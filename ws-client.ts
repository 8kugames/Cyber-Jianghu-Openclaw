// tools/act/ws-client.ts
// ============================================================================
// WebSocket Client for Cyber-Jianghu-Openclaw Plugin
// ============================================================================
//
// Connects to the Rust Agent's WebSocket server at ws://{host}:{port}/ws.
// Handles ALL downstream message types defined in protocol.rs and types.ts.
//
// Heartbeat: ping every 30s, pong expected within 10s, idle timeout 50s.
// Reconnect: exponential backoff, max 3 attempts, base delay 5s.
//
// Architecture:
//   OpenClaw (Brain) <--WebSocket--> Agent (Body) <--WS/HTTP--> Game Server
//

import type {
	LLMRequestMessage,
	LLMResponsePayload,
} from "./types.js";

// ============================================================================
// Configuration
// ============================================================================

export interface WsClientConfig {
	/** Agent WebSocket host. */
	host: string;
	/** Agent WebSocket port. */
	port: number;
	/** Interval between heartbeat pings (ms). Default: 30000. */
	heartbeatIntervalMs: number;
	/** Max wait for a pong response before treating connection as stale (ms). Default: 10000. */
	pongTimeoutMs: number;
	/** Max silence on the wire before treating connection as dead (ms). Default: 50000. */
	idleTimeoutMs: number;
	/** Base delay for exponential-backoff reconnect (ms). Default: 5000. */
	reconnectBaseDelayMs: number;
	/** Maximum reconnect attempts. Default: 3. */
	maxReconnectAttempts: number;
	/** Connection handshake timeout (ms). Default: 10000. */
	connectTimeoutMs: number;
}

const DEFAULT_CONFIG: Readonly<WsClientConfig> = {
	host: "127.0.0.1",
	port: 23340,
	heartbeatIntervalMs: 30_000,
	pongTimeoutMs: 10_000,
	idleTimeoutMs: 50_000,
	reconnectBaseDelayMs: 5_000,
	maxReconnectAttempts: 3,
	connectTimeoutMs: 10_000,
};

// ============================================================================
// Handler types
// ============================================================================

export interface WsClientHandlers {
        onLLMRequest?: (msg: LLMRequestMessage) => void;
}

// ============================================================================
// WsClient
// ============================================================================

export class WsClient {
	private readonly config: WsClientConfig;
	private ws: WebSocket | null = null;
	private readonly handlers: WsClientHandlers;

	// Heartbeat bookkeeping
	private heartbeatTimer: ReturnType<typeof setInterval> | null = null;
	private lastPongAt: number = 0;
	private lastMessageAt: number = 0;
	private waitingForPong: boolean = false;

	// Reconnect bookkeeping
	private reconnectAttempts: number = 0;
	private shouldReconnect: boolean = false;
	private reconnectTimer: ReturnType<typeof setTimeout> | null = null;

	// Connect timeout
	private connectTimer: ReturnType<typeof setTimeout> | null = null;

	constructor(config: Partial<WsClientConfig> = {}, handlers: WsClientHandlers = {}) {
		this.config = { ...DEFAULT_CONFIG, ...config };
		this.handlers = handlers;
	}

	// -----------------------------------------------------------------------
	// Public API
	// -----------------------------------------------------------------------

	/** Open a WebSocket connection. Rejects on timeout or immediate error. */
	connect(): Promise<void> {
		if (this.ws) {
			return Promise.resolve();
		}

		const url = `ws://${this.config.host}:${this.config.port}/ws`;
		console.log(`[ws-client] Connecting to ${url} ...`);

		this.shouldReconnect = true;

		return new Promise<void>((resolve, reject) => {
			let settled = false;

			const onSettled = (err?: Error) => {
				if (settled) return;
				settled = true;
				this.clearConnectTimer();
				if (err) reject(err);
				else resolve();
			};

			// Connection timeout
			this.connectTimer = setTimeout(() => {
				onSettled(new Error(
					`[ws-client] Connection to ${url} timed out after ${this.config.connectTimeoutMs}ms`,
				));
				this.teardownWs();
			}, this.config.connectTimeoutMs);

			try {
				const socket = new WebSocket(url);
				this.ws = socket;

				socket.onopen = () => {
					console.log("[ws-client] Connected");
					this.reconnectAttempts = 0;
					this.lastPongAt = Date.now();
					this.lastMessageAt = Date.now();
					this.startHeartbeat();
					onSettled();
				};

				socket.onmessage = (event: MessageEvent) => {
					this.onRawMessage(event);
				};

				socket.onerror = () => {
					// The browser fires onclose right after onerror; we handle
					// reconnect in onclose.  Only reject the connect promise if
					// we never opened.
					onSettled(new Error("[ws-client] WebSocket error during connect"));
				};

				socket.onclose = (ev: CloseEvent) => {
					console.log(`[ws-client] Disconnected: code=${ev.code} reason=${ev.reason}`);
					this.stopHeartbeat();
					this.ws = null;
					if (this.shouldReconnect) {
						this.scheduleReconnect();
					}
					onSettled(new Error(`[ws-client] Connection closed (${ev.code})`));
				};
			} catch (e) {
				onSettled(e instanceof Error ? e : new Error(String(e)));
			}
		});
	}

	/** Clean close -- disables auto-reconnect. */
	disconnect(): void {
		this.shouldReconnect = false;
		this.clearReconnectTimer();
		this.stopHeartbeat();
		this.clearConnectTimer();

		if (this.ws) {
			try {
				this.ws.close(1000, "client disconnect");
			} catch {
				// Best-effort close
			}
			this.ws = null;
		}
	}

	/** True when the underlying WebSocket is in OPEN state. */
	isConnected(): boolean {
		return this.ws !== null && this.ws.readyState === WebSocket.OPEN;
	}

	// -----------------------------------------------------------------------
	// Upstream: send helpers
	// -----------------------------------------------------------------------

	/** Send LLM response back to the Agent. */
	sendLLMResponse(requestId: string, content: string, error?: string): void {
		const msg: LLMResponsePayload = {
			type: "llm_response",
			request_id: requestId,
			content,
			...(error !== undefined && { error }),
		};
		this.sendRaw(msg);
	}

	// -----------------------------------------------------------------------
        // Handler registration (post-construction setters)
        // -----------------------------------------------------------------------

        // The handlers object is already passed via the constructor.  These
        // setters allow late-binding (e.g. after a tool initialises).

        set onLLMRequestHandler(fn: ((msg: LLMRequestMessage) => void) | undefined) { this.handlers.onLLMRequest = fn; }

	// -----------------------------------------------------------------------
	// Private: message dispatch
	// -----------------------------------------------------------------------

	private onRawMessage(event: MessageEvent): void {
		this.lastMessageAt = Date.now();

		let data: unknown;
		try {
			data = JSON.parse(event.data as string);
		} catch {
			console.warn("[ws-client] Dropping non-JSON message");
			return;
		}

		if (typeof data !== "object" || data === null || !("type" in data)) {
			console.warn("[ws-client] Dropping message without 'type' field:", data);
			return;
		}

		const msg = data as Record<string, unknown>;
		const type = msg.type as string;

		switch (type) {
			// --- heartbeat ---
			case "pong":
				this.waitingForPong = false;
				this.lastPongAt = Date.now();
				break;

			// --- llm integration ---
			case "llm_request":
				this.handlers.onLLMRequest?.(msg as unknown as LLMRequestMessage);
				break;

			default:
				console.warn(`[ws-client] Unhandled downstream type: ${type}`);
		}
	}

	// -----------------------------------------------------------------------
	// Private: heartbeat
	// -----------------------------------------------------------------------

	private startHeartbeat(): void {
		this.stopHeartbeat();

		this.heartbeatTimer = setInterval(() => {
			if (!this.isConnected()) return;

			// Idle timeout: no message received for too long
			const silenceMs = Date.now() - this.lastMessageAt;
			if (silenceMs > this.config.idleTimeoutMs) {
				console.warn(`[ws-client] Idle timeout (${silenceMs}ms silence), closing`);
				this.teardownWs();
				return;
			}

			// Still waiting for previous pong -- connection may be dead
			if (this.waitingForPong) {
				const elapsed = Date.now() - (this.lastPongAt ?? 0);
				if (elapsed > this.config.pongTimeoutMs) {
					console.warn(`[ws-client] Pong timeout (${elapsed}ms), closing`);
					this.teardownWs();
					return;
				}
			}

			// Send ping
			this.waitingForPong = true;
			this.sendRaw({ type: "ping" });
		}, this.config.heartbeatIntervalMs);
	}

	private stopHeartbeat(): void {
		if (this.heartbeatTimer !== null) {
			clearInterval(this.heartbeatTimer);
			this.heartbeatTimer = null;
		}
		this.waitingForPong = false;
	}

	// -----------------------------------------------------------------------
	// Private: reconnect with exponential backoff
	// -----------------------------------------------------------------------

	private scheduleReconnect(): void {
		if (this.reconnectAttempts >= this.config.maxReconnectAttempts) {
			console.error(
				`[ws-client] Max reconnect attempts reached (${this.config.maxReconnectAttempts}). Giving up.`,
			);
			return;
		}

		this.reconnectAttempts++;
		const delay = this.config.reconnectBaseDelayMs * Math.pow(2, this.reconnectAttempts - 1);

		console.log(
			`[ws-client] Reconnect attempt ${this.reconnectAttempts}/${this.config.maxReconnectAttempts} in ${delay}ms`,
		);

		this.reconnectTimer = setTimeout(() => {
			this.reconnectTimer = null;
			if (!this.shouldReconnect) return;
			this.connect().catch((e: Error) => {
				console.error(`[ws-client] Reconnect failed: ${e.message}`);
			});
		}, delay);
	}

	private clearReconnectTimer(): void {
		if (this.reconnectTimer !== null) {
			clearTimeout(this.reconnectTimer);
			this.reconnectTimer = null;
		}
	}

	// -----------------------------------------------------------------------
	// Private: low-level helpers
	// -----------------------------------------------------------------------

	private sendRaw(msg: unknown): void {
		if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
			console.warn("[ws-client] Cannot send -- not connected");
			return;
		}
		this.ws.send(JSON.stringify(msg));
	}

	private teardownWs(): void {
		this.stopHeartbeat();
		if (this.ws) {
			try { this.ws.close(); } catch { /* ignore */ }
			this.ws = null;
		}
	}

	private clearConnectTimer(): void {
		if (this.connectTimer !== null) {
			clearTimeout(this.connectTimer);
			this.connectTimer = null;
		}
	}
}

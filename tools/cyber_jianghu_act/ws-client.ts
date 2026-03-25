// tools/cyber_jianghu_act/ws-client.ts
// ============================================================================
// WebSocket Client for Agent Communication
// ============================================================================
//
// Agent exposes a WebSocket endpoint at /ws that OpenClaw connects to as a client.
//
// Protocol (matches Rust protocol.rs):
// - Downstream (Agent → OpenClaw):
//   - tick: WorldState + deadline + context
//   - tick_closed: timeout notification
//   - review_request: Observer Agent review request
//
// - Upstream (OpenClaw → Agent):
//   - intent: submit decision
//   - review_result: Observer review decision
//
// Architecture:
//   OpenClaw (Brain) ←→ WebSocket ←→ Agent (Body) ←→ Game Server
//

import { WorldState } from "./types.js";

// ============================================================================
// Downstream Messages (Agent → OpenClaw)
// ============================================================================

/**
 * Base type for downstream messages from Agent
 */
export interface DownstreamMessage {
	type: "tick" | "tick_closed" | "review_request";
}

/**
 * Tick message - sent each game tick with WorldState
 */
export interface TickMessage extends DownstreamMessage {
	type: "tick";
	tick_id: number;
	deadline_ms: number;
	state: WorldState;
	context?: string;
}

/**
 * Tick closed message - sent when tick times out
 */
export interface TickClosedMessage extends DownstreamMessage {
	type: "tick_closed";
	tick_id: number;
	reason: string;
	next_tick_in_ms: number;
}

/**
 * Review request - sent to Observer Agent
 */
export interface ReviewRequestMessage extends DownstreamMessage {
	type: "review_request";
	tick_id: number;
	player_intent: PlayerIntent;
	persona_summary: PersonaSummary;
	world_context: string;
	deadline_ms: number;
}

/**
 * Player intent from review request
 */
export interface PlayerIntent {
	action_type: string;
	action_data?: unknown;
	thought_log?: string;
}

/**
 * Persona summary for review
 */
export interface PersonaSummary {
	name: string;
	personality: string[];
	values: string[];
}

// ============================================================================
// Upstream Messages (OpenClaw → Agent)
// ============================================================================

/**
 * Base type for upstream messages to Agent
 */
export interface UpstreamMessage {
	type: "intent" | "review_result";
}

/**
 * Intent message - submit decision to Agent
 */
export interface IntentMessage extends UpstreamMessage {
	type: "intent";
	tick_id: number;
	action_type: string;
	action_data?: unknown;
	thought_log?: string;
}

/**
 * Review result message - Observer decision
 */
export interface ReviewResultMessage extends UpstreamMessage {
	type: "review_result";
	tick_id: number;
	decision: "approved" | "rejected" | "needs_modification";
	reason?: string;
	narrative?: string;
}

// ============================================================================
// WebSocket Client
// ============================================================================

/**
 * WebSocket client configuration
 */
export interface WsClientConfig {
	/** Host where Agent is running */
	host: string;
	/** Port where Agent WebSocket is listening */
	port: number;
	/** Connection timeout in ms */
	connectTimeoutMs: number;
	/** Message receive timeout in ms */
	recvTimeoutMs: number;
	/** Reconnect delay in ms */
	reconnectDelayMs: number;
	/** Max reconnection attempts */
	maxReconnectAttempts: number;
}

const DEFAULT_WS_CONFIG: WsClientConfig = {
	host: "127.0.0.1",
	port: 23340,
	connectTimeoutMs: 5000,
	recvTimeoutMs: 60000,
	reconnectDelayMs: 5000,  // Increased to 5s to allow agent to detect dead connection
	maxReconnectAttempts: 3,
};

/**
 * WebSocket client for Agent communication
 */
export class WsClient {
	private config: WsClientConfig;
	private ws: WebSocket | null = null;
	private reconnectAttempts: number = 0;
	private shouldReconnect: boolean = true;
	private isReconnecting: boolean = false;
	private isConnecting: boolean = false;
	private tickHandler: ((tick: TickMessage) => void) | null = null;
	private tickClosedHandler: ((msg: TickClosedMessage) => void) | null = null;
	private reviewHandler: ((msg: ReviewRequestMessage) => void) | null = null;
	private onErrorHandler: ((error: Error) => void) | null = null;
	private onConnectHandler: (() => void) | null = null;
	private onDisconnectHandler: (() => void) | null = null;

	constructor(config: Partial<WsClientConfig> = {}) {
		this.config = { ...DEFAULT_WS_CONFIG, ...config };
	}

	/**
	 * Connect to Agent WebSocket
	 */
	async connect(): Promise<void> {
		if (this.isConnecting) {
			console.log("[ws-client] Connection in progress, skipping");
			return;
		}
		if (this.ws && this.ws.readyState === WebSocket.OPEN) {
			console.log("[ws-client] Already connected, skipping");
			return;
		}
		if (this.ws && this.ws.readyState === WebSocket.CONNECTING) {
			console.log("[ws-client] Connection already in progress, skipping");
			return;
		}

		this.isConnecting = true;

		const url = `ws://${this.config.host}:${this.config.port}/ws`;
		console.log(`[ws-client] Connecting to ${url}`);

		return new Promise((resolve, reject) => {
			const timeout = setTimeout(() => {
				this.isConnecting = false;
				reject(new Error(`Connection timeout after ${this.config.connectTimeoutMs}ms`));
			}, this.config.connectTimeoutMs);

			try {
				this.ws = new WebSocket(url);

				this.ws.onopen = () => {
					clearTimeout(timeout);
					console.log("[ws-client] Connected");
					this.reconnectAttempts = 0;
					this.isReconnecting = false;
					this.isConnecting = false;
					this.onConnectHandler?.();
					resolve();
				};

				this.ws.onmessage = (event) => {
					try {
						const msg = JSON.parse(event.data) as DownstreamMessage;
						this.handleMessage(msg);
					} catch (e) {
						console.error("[ws-client] Failed to parse message:", e);
					}
				};

				this.ws.onerror = (event) => {
					console.error("[ws-client] WebSocket error:", event);
					const error = new Error("WebSocket error");
					this.onErrorHandler?.(error);
				};

				this.ws.onclose = (event) => {
					console.log(`[ws-client] Disconnected: ${event.code} ${event.reason}`);
					this.isConnecting = false;
					this.onDisconnectHandler?.();
				};
			} catch (e) {
				clearTimeout(timeout);
				this.isConnecting = false;
				this.isReconnecting = false;
				reject(e);
			}
		});
	}

	/**
	 * Disconnect from Agent
	 */
	disconnect(): void {
		this.shouldReconnect = false;
		if (this.ws) {
			this.ws.close();
			this.ws = null;
		}
	}

	/**
	 * Send intent to Agent
	 */
	sendIntent(
		tickId: number,
		actionType: string,
		actionData?: unknown,
		thoughtLog?: string,
	): void {
		const msg: IntentMessage = {
			type: "intent",
			tick_id: tickId,
			action_type: actionType,
			action_data: actionData,
			thought_log: thoughtLog,
		};
		this.send(msg);
	}

	/**
	 * Send review result to Agent (for Observer Agent)
	 */
	sendReviewResult(
		tickId: number,
		decision: "approved" | "rejected" | "needs_modification",
		reason?: string,
		narrative?: string,
	): void {
		const msg: ReviewResultMessage = {
			type: "review_result",
			tick_id: tickId,
			decision,
			reason,
			narrative,
		};
		this.send(msg);
	}

	/**
	 * Set handler for tick messages
	 */
	onTick(handler: (tick: TickMessage) => void): void {
		this.tickHandler = handler;
	}

	/**
	 * Set handler for tick closed messages
	 */
	onTickClosed(handler: (msg: TickClosedMessage) => void): void {
		this.tickClosedHandler = handler;
	}

	/**
	 * Set handler for review request messages
	 */
	onReviewRequest(handler: (msg: ReviewRequestMessage) => void): void {
		this.reviewHandler = handler;
	}

	/**
	 * Set handler for errors
	 */
	onError(handler: (error: Error) => void): void {
		this.onErrorHandler = handler;
	}

	/**
	 * Set handler for connect event
	 */
	onConnect(handler: () => void): void {
		this.onConnectHandler = handler;
	}

	/**
	 * Set handler for disconnect event
	 */
	onDisconnect(handler: () => void): void {
		this.onDisconnectHandler = handler;
	}

	/**
	 * Check if connected
	 */
	isConnected(): boolean {
		return this.ws?.readyState === WebSocket.OPEN;
	}

	// Private methods

	private send(msg: UpstreamMessage): void {
		if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
			console.warn("[ws-client] Not connected, cannot send message");
			return;
		}
		this.ws.send(JSON.stringify(msg));
	}

	private handleMessage(msg: DownstreamMessage): void {
		switch (msg.type) {
			case "tick":
				this.tickHandler?.(msg as TickMessage);
				break;
			case "tick_closed":
				this.tickClosedHandler?.(msg as TickClosedMessage);
				break;
			case "review_request":
				this.reviewHandler?.(msg as ReviewRequestMessage);
				break;
			default:
				console.warn("[ws-client] Unknown message type:", (msg as any).type);
		}
	}

	private scheduleReconnect(): void {
		this.reconnectAttempts++;
		const delay = this.config.reconnectDelayMs * Math.pow(2, this.reconnectAttempts - 1);
		console.log(
			`[ws-client] Scheduling reconnect attempt ${this.reconnectAttempts}/${this.config.maxReconnectAttempts} in ${delay}ms`,
		);
		setTimeout(() => {
			if (this.shouldReconnect) {
				this.connect().catch((e) => console.error("[ws-client] Reconnect failed:", e));
			}
		}, delay);
	}
}

// ============================================================================
// Global WebSocket client management
// ============================================================================

let globalWsClient: WsClient | null = null;
let isConnecting: boolean = false;

/**
 * Get or create global WebSocket client
 */
export async function getWsClientAsync(
	port: number = 0,
	host?: string,
): Promise<WsClient> {
	// If we have an existing client that's connected, reuse it
	if (globalWsClient && globalWsClient.isConnected()) {
		return globalWsClient;
	}

	// Wait if another connect is in progress
	if (isConnecting) {
		console.log("[ws-client] Connection in progress, waiting...");
		while (isConnecting) {
			await new Promise(resolve => setTimeout(resolve, 500));
		}
		// After waiting, check again
		if (globalWsClient && globalWsClient.isConnected()) {
			return globalWsClient;
		}
	}

	isConnecting = true;

	try {
		if (globalWsClient) {
			globalWsClient.disconnect();
			globalWsClient = null;
		}

		const { discoverPort, getDiscoveredAgentInfo, setDiscoveredAgentInfo, DEFAULT_HTTP_CONFIG } = await import("./http-client.js");

		let targetHost: string;
		let targetPort: number;

		// WebSocket MUST connect to the same agent that HTTP discovered
		// This prevents the two clients from connecting to different agent instances
		if (port !== 0) {
			targetPort = port;
			targetHost = host ||
				process.env.DOCKER_AGENT_HOST ||
				"host.docker.internal";
		} else {
			const discoveredInfo = getDiscoveredAgentInfo();
			if (discoveredInfo) {
				console.log(`[ws-client] Reusing HTTP discovered agent at ${discoveredInfo.host}:${discoveredInfo.port}`);
				targetHost = discoveredInfo.host;
				targetPort = discoveredInfo.port;
			} else {
				targetHost = host ||
					process.env.DOCKER_AGENT_HOST ||
					"host.docker.internal";
				const discovered = await discoverPort(targetHost, DEFAULT_HTTP_CONFIG);
				if (!discovered) {
					throw new Error(`No agent found in port range ${DEFAULT_HTTP_CONFIG.portRange.min}-${DEFAULT_HTTP_CONFIG.portRange.max}`);
				}
				targetPort = discovered;
				setDiscoveredAgentInfo(targetHost, targetPort);
			}
		}

		globalWsClient = new WsClient({
			host: targetHost,
			port: targetPort,
		});

		return globalWsClient;
	} finally {
		isConnecting = false;
	}
}

/**
 * Reset global WebSocket client
 */
export function resetWsClient(): void {
	if (globalWsClient) {
		globalWsClient.disconnect();
		globalWsClient = null;
	}
}

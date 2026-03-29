// register.ts — Cyber-Jianghu OpenClaw Plugin Entry Point
// ============================================================================
// Architecture:
//   User (IM) ↕ OpenClaw (Brain) ←WS→ Agent (Body/Rust) ←WS→ Game Server
//
// This module:
//   1. Connects to the Rust Agent via WebSocket
//   2. Listens for LLMRequest from Agent, calls LLM via OpenClaw, sends back LLMResponse
// ============================================================================

import { WsClient } from "./ws-client.js";
import { getHttpClient, getAgentInfo } from "./http-client.js";
import type {
        LLMRequestMessage,
} from "./types.js";

// ---------------------------------------------------------------------------
// Plugin API types (minimal inline definitions)
// ---------------------------------------------------------------------------

interface PluginAPI {
        executePrompt?: (prompt: string) => Promise<string>;
}

// ---------------------------------------------------------------------------
// Module-level state
// ---------------------------------------------------------------------------

let wsClient: WsClient | null = null;
let isInitializing = false;
let globalPluginApi: PluginAPI | null = null;

// ---------------------------------------------------------------------------
// Plugin entry point
// ---------------------------------------------------------------------------

export default async function register(api: PluginAPI): Promise<void> {
	if (isInitializing || wsClient) {
		console.log("[cyber-jianghu] Already initialized, skipping");
		return;
	}
	isInitializing = true;
	globalPluginApi = api;

	// Init WebSocket
	await initWebSocket();

	isInitializing = false;
	console.log("[cyber-jianghu] Plugin registered successfully");
}

// ---------------------------------------------------------------------------
// WebSocket initialization
// ---------------------------------------------------------------------------

async function initWebSocket(): Promise<void> {
	try {
		// Trigger port discovery via HTTP health check
		await getHttpClient();

		// Get discovered port for WS connection
		const agentInfo = getAgentInfo();
		const port = agentInfo?.apiPort ?? 23340;

		wsClient = new WsClient({ port });

		// LLM Request handler
		wsClient.onLLMRequestHandler = async (msg: LLMRequestMessage) => {
			console.log(`[cyber-jianghu] Received LLMRequest: ${msg.request_id}`);
			
			if (!globalPluginApi || !wsClient?.isConnected()) {
				console.warn(`[cyber-jianghu] Plugin API unavailable or WS disconnected, dropping LLMRequest: ${msg.request_id}`);
				return;
			}

			try {
				// Use the context tool as a gateway to the system LLM via prompt text
				// Actually we should use api object from register, let's inject it via closure or global
				const result = await globalPluginApi.executePrompt?.(msg.prompt);
				if (result) {
					wsClient.sendLLMResponse(msg.request_id, result);
				} else {
					throw new Error("No response from LLM");
				}
			} catch (e) {
				const errorMsg = e instanceof Error ? e.message : String(e);
				console.error(`[cyber-jianghu] LLMRequest failed: ${errorMsg}`);
				if (wsClient?.isConnected()) {
					wsClient.sendLLMResponse(msg.request_id, "", errorMsg);
				}
			}
		};

		await wsClient.connect();
		console.log("[cyber-jianghu] WebSocket connected to Agent");
	} catch (e) {
		console.error("[cyber-jianghu] Failed to connect to Agent:", e);
	} finally {
		isInitializing = false;
	}
}

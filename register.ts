// register.ts — Cyber-Jianghu OpenClaw Plugin Entry Point
// ============================================================================
// Architecture:
//   User (IM) ↕ OpenClaw (Brain) ←WS→ Agent (Body/Rust) ←WS→ Game Server
//
// This module:
//   1. Connects to the Rust Agent via WebSocket
//   2. Registers context/act/dream tools for the LLM
//   3. Routes tick → in-memory context snapshot + reporter
//   4. Submits pending intents on agent_end
// ============================================================================

import { Type } from "@sinclair/typebox";
import { WsClient } from "./tools/act/ws-client.js";
import { getHttpClient, getAgentInfo } from "./tools/act/http-client.js";
import type {
	TickMessage,
	AgentDiedMessage,
	ServerErrorMessage,
	ServerDialogueMessage,
	GameActionParams,
	LLMRequestMessage,
} from "./tools/act/types.js";
import { Reporter } from "./plugins/reporter/index.js";

// ---------------------------------------------------------------------------
// Plugin API types (minimal inline definitions)
// ---------------------------------------------------------------------------

interface PluginAPI {
	registerTool(params: ToolDefinition): void;
	on(
		event: string,
		handler: (event: unknown, context: unknown) => unknown | Promise<unknown>,
		options?: unknown,
	): void;
	config?: Record<string, unknown>;
	executePrompt?: (prompt: string) => Promise<string>;
}

interface ToolDefinition {
	name: string;
	description: string;
	parameters: unknown;
	execute: (
		_id: string,
		params: Record<string, unknown>,
	) => Promise<ToolResult>;
}

interface ToolResult {
	content: Array<{ type: string; text: string }>;
	isError?: boolean;
}

// ---------------------------------------------------------------------------
// Module-level state
// ---------------------------------------------------------------------------

let wsClient: WsClient | null = null;
let reporter: Reporter | null = null;
let lastGameActionCall: GameActionParams | null = null;
let isInitializing = false;
let globalPluginApi: PluginAPI | null = null;
let latestTickSnapshot: {
	tickId: number;
	deadlineMs: number;
	context: string | null;
	cognitiveContext: TickMessage["cognitive_context"] | null;
	updatedAt: string;
} | null = null;

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

	// 1. Reporter
	reporter = new Reporter();

	// 2. Register context tool
	api.registerTool({
		name: "cyber_jianghu_context",
		description:
			"获取当前 Tick 的最新上下文快照（来自 WS 实时消息）。决策前优先调用此工具，再调用 cyber_jianghu_act。",
		parameters: Type.Object({}),
		execute: async () => {
			if (!latestTickSnapshot) {
				return {
					content: [
						{
							type: "text",
							text: JSON.stringify(
								{
									status: "unavailable",
									message: "尚未收到 Tick，请等待下一次世界状态更新。",
								},
								null,
								2,
							),
						},
					],
					isError: true,
				};
			}
			return {
				content: [
					{
						type: "text",
						text: JSON.stringify(
							{
								status: "ok",
								tick_id: latestTickSnapshot.tickId,
								deadline_ms: latestTickSnapshot.deadlineMs,
								context: latestTickSnapshot.context,
								cognitive_context: latestTickSnapshot.cognitiveContext,
								updated_at: latestTickSnapshot.updatedAt,
							},
							null,
							2,
						),
					},
				],
			};
		},
	});

	// 3. Register act tool
	api.registerTool({
		name: "cyber_jianghu_act",
		description:
			"提交游戏动作到赛博江湖世界。你必须每个 Tick 调用这个工具。可用动作请先通过 cyber_jianghu_context 获取。",
		parameters: Type.Object({
			action: Type.String({
				description: "动作类型（从 cyber_jianghu_context 返回的 available_actions 中选择）",
			}),
			target: Type.Optional(
				Type.String({ description: "目标实体/物品/地点的ID" }),
			),
			data: Type.Optional(
				Type.String({ description: "额外数据，如说话内容、物品ID等" }),
			),
			reasoning: Type.Optional(
				Type.String({ description: "你的思考过程，解释为什么选择这个动作" }),
			),
		}),
		execute: async (_id, params) => {
			lastGameActionCall = params as unknown as GameActionParams;
			console.log(
				`[cyber_jianghu_act] Intent recorded: ${lastGameActionCall.action} ${lastGameActionCall.target || ""} (${lastGameActionCall.reasoning || ""})`,
			);
			return {
				content: [
					{ type: "text", text: `动作已记录: ${lastGameActionCall.action}` },
				],
			};
		},
	});

	// 4. Register dream tool
	api.registerTool({
		name: "cyber_jianghu_dream",
		description:
			"向角色注入一个梦（托梦），影响角色意识。用户每游戏日可干预一次，持续最多5个Tick。",
		parameters: Type.Object({
			content: Type.String({
				description: "梦的内容——将出现在角色意识中的念头",
			}),
			duration: Type.Optional(
				Type.Number({ description: "持续Tick数（最多5）", default: 5 }),
			),
		}),
		execute: async (_id, params) => {
			const duration = Math.min((params.duration as number) ?? 5, 5);
			const content = params.content as string;

			try {
				const httpClient = await getHttpClient();
				await httpClient.post("/api/v1/character/dream", {
					thought: content,
					duration,
				});
				return {
					content: [
						{
							type: "text",
							text: `托梦成功注入。"${content}" 将影响角色 ${duration} 个Tick。`,
						},
					],
				};
			} catch (error) {
				const msg = error instanceof Error ? error.message : String(error);
				const isQuota =
					msg.includes("429") || msg.includes("今日已使用过托梦");
				return {
					content: [
						{
							type: "text",
							text: isQuota
								? `托梦失败: 今日已使用过托梦次数。(${msg})`
								: `托梦失败: ${msg}`,
						},
					],
					isError: true,
				};
			}
		},
	});

	// 5. Init WebSocket
	await initWebSocket();

	// 6. agent_end hook
	api.on("agent_end", async () => {
		// Check for pending report from reporter
		const pending = reporter?.getPendingReport();
		if (pending) {
			console.log(
				`[cyber-jianghu] Pending ${pending.type} report available for delivery`,
			);
			// Report delivery: the report content is logged and available.
			// In production, register.ts would schedule a cron job via the API
			// to push this to the user's IM channel. For now, log it.
			console.log(`[reporter] Report:\n${pending.content}`);
			reporter?.clearPendingReport();
		}
	});

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

		// Tick handler — wrap async to prevent silent rejection in void callback
		wsClient.onTickHandler = (msg: TickMessage) => {
			latestTickSnapshot = {
				tickId: msg.tick_id,
				deadlineMs: msg.deadline_ms,
				context: msg.context ?? null,
				cognitiveContext: msg.cognitive_context ?? null,
				updatedAt: new Date().toISOString(),
			};
			Promise.resolve()
				.then(async () => {
					await reporter?.onTick(msg);
				})
				.catch((e) => console.error("[cyber-jianghu] Tick handler error:", e));
		};

		// Agent died
		wsClient.onAgentDiedHandler = (msg: AgentDiedMessage) => {
			console.log(
				`[cyber-jianghu] Agent died: ${msg.cause} at ${msg.location} (tick ${msg.tick_id})`,
			);
			reporter?.onAgentDied(msg).catch((e) =>
				console.error("[cyber-jianghu] onAgentDied error:", e),
			);
		};

		// Server errors
		wsClient.onServerErrorHandler = (msg: ServerErrorMessage) => {
			console.error(
				`[cyber-jianghu] Server error: ${msg.code} - ${msg.message}`,
			);
		};

		// Dialogue from other agents
		wsClient.onDialogueHandler = (msg: ServerDialogueMessage) => {
			const content = msg.content || msg.opening_remark || "(无声)";
			console.log(
				`[cyber-jianghu] Dialogue from ${msg.from_agent_id}: ${content}`,
			);
		};

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

// register.ts — Cyber-Jianghu OpenClaw Plugin Entry Point
// ============================================================================
// Architecture:
//   User (IM) ↕ OpenClaw (Brain) ←WS→ Agent (Body/Rust) ←WS→ Game Server
//
// This module:
//   1. Connects to the Rust Agent via WebSocket
//   2. Registers act/dream tools for the LLM
//   3. Routes tick → CONTEXT.md + reporter
//   4. Submits pending intents on agent_end
// ============================================================================

import { promises as fs } from "fs";
import { Type } from "@sinclair/typebox";
import { WsClient } from "./tools/act/ws-client.js";
import { getHttpClient, getAgentInfo } from "./tools/act/http-client.js";
import type {
	TickMessage,
	AgentDiedMessage,
	ServerErrorMessage,
	ServerDialogueMessage,
	GameActionParams,
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
let currentTickId = 0;
let lastWrittenTickId = 0;
let isInitializing = false;

// ---------------------------------------------------------------------------
// Plugin entry point
// ---------------------------------------------------------------------------

export default async function register(api: PluginAPI): Promise<void> {
	if (isInitializing || wsClient) {
		console.log("[cyber-jianghu] Already initialized, skipping");
		return;
	}
	isInitializing = true;

	// 1. Reporter
	reporter = new Reporter();

	// 2. Register act tool
	api.registerTool({
		name: "cyber_jianghu_act",
		description:
			"提交游戏动作到赛博江湖世界。你必须每个 Tick 调用这个工具。可用动作请参考 CONTEXT.md 中的 available_actions 字段。",
		parameters: Type.Object({
			action: Type.String({
				description: "动作类型（从 CONTEXT.md 的 available_actions 中选择）",
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

	// 3. Register dream tool
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

	// 4. Init WebSocket
	await initWebSocket();

	// 5. agent_end hook — submit pending intent
	api.on("agent_end", async () => {
		submitPendingIntent();

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
			currentTickId = msg.tick_id;
			Promise.resolve()
				.then(async () => {
					if (msg.context) {
						await writeContextMd(msg.context, msg.tick_id);
					}
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

		await wsClient.connect();
		console.log("[cyber-jianghu] WebSocket connected to Agent");
	} catch (e) {
		console.error("[cyber-jianghu] Failed to connect to Agent:", e);
	} finally {
		isInitializing = false;
	}
}

// ---------------------------------------------------------------------------
// Intent submission (called from agent_end hook)
// ---------------------------------------------------------------------------

function submitPendingIntent(): void {
	if (!wsClient?.isConnected()) return;

	if (lastGameActionCall && currentTickId > 0) {
		const actionData =
			lastGameActionCall.target || lastGameActionCall.data
				? {
						target: lastGameActionCall.target,
						data: lastGameActionCall.data,
					}
				: undefined;

		wsClient.sendIntent(
			currentTickId,
			lastGameActionCall.action,
			actionData,
			lastGameActionCall.reasoning,
		);
		console.log(
			`[cyber-jianghu] Intent submitted: ${lastGameActionCall.action} for tick ${currentTickId}`,
		);
	} else if (currentTickId > 0) {
		// LLM didn't call act → submit idle
		wsClient.sendIntent(
			currentTickId,
			"idle",
			undefined,
			"LLM did not call jianghu_act",
		);
		console.log(
			`[cyber-jianghu] Idle submitted for tick ${currentTickId}`,
		);
	}

	lastGameActionCall = null;
}

// ---------------------------------------------------------------------------
// CONTEXT.md writer
// ---------------------------------------------------------------------------

async function writeContextMd(context: string, tickId: number): Promise<void> {
	if (tickId <= lastWrittenTickId) return;

	const workspaceDir = "/home/node/workspace";
	try {
		await fs.writeFile(`${workspaceDir}/CONTEXT.md`, context, "utf-8");
		lastWrittenTickId = tickId;
		console.log(
			`[cyber-jianghu] CONTEXT.md updated for tick ${tickId}`,
		);
	} catch (e) {
		console.error("[cyber-jianghu] Failed to write CONTEXT.md:", e);
	}
}

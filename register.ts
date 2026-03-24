// register.ts - Cyber-Jianghu OpenClaw Plugin Entry Point
// ============================================================================
// This file is the main entry point for the Cyber-Jianghu OpenClaw plugin.
// OpenClaw calls the register(api) function when the plugin is loaded.
//
// Architecture:
//   OpenClaw (Brain) ←→ WebSocket ←→ Agent (Body) ←→ Game Server
//
// WebSocket Integration:
// - Connect to Agent's WebSocket endpoint on load
// - Receive tick updates (WorldState + deadline)
// - Submit intents via WebSocket
// ============================================================================

import { promises as fs } from "fs";

/**
 * Plugin API type (minimal definition for type safety)
 */
interface PluginAPI {
	registerTool(params: ToolDefinition): void;
	on(
		event: string,
		handler: (event: any, context: any) => any | Promise<any>,
		options?: any,
	): void;
	config?: Record<string, unknown>;
}

interface ToolDefinition {
	name: string;
	description: string;
	parameters: {
		type: string;
		properties: Record<
			string,
			{
				type: string;
				description: string;
				enum?: string[];
			}
		>;
		required: string[];
	};
	execute: (id: string, params: Record<string, unknown>) => Promise<ToolResult>;
}

interface ToolResult {
	content: Array<{ type: string; text: string }>;
	isError?: boolean;
}

// Store the last cyber_jianghu_act call for the enforcement hook
let lastGameActionCall: { action: string; target?: string; data?: string; reasoning?: string } | null = null;

// Shared state for WebSocket tick data
interface SharedTickState {
	tickId: number;
	deadlineMs: number;
	agentId: string;
	state: any;
	context?: string;
}

let sharedTickState: SharedTickState | null = null;
let wsClient: any = null;
let registerCallId = 0;
let isInitializing = false;

/**
 * Plugin entry point - called by OpenClaw when the plugin is loaded
 */
export default async function register(api: PluginAPI) {
	const callId = ++registerCallId;
	console.log(`[cyber-jianghu-openclaw] register() called #${callId}`);

	if (isInitializing) {
		console.log(`[cyber-jianghu-openclaw] Initialization in progress, skipping #${callId}`);
		return;
	}
	if (wsClient) {
		console.log(`[cyber-jianghu-openclaw] Already initialized, skipping #${callId}`);
		return;
	}

	isInitializing = true;

	// Initialize WebSocket connection to Agent
	await initWebSocket(api);

	// Register cyber_jianghu_act tool
	//
	// 工具执行时只记录意图，实际的验证和提交由 agent_end hook 处理
	// 这样可以集中处理验证逻辑、重试机制和记忆归档
	api.registerTool({
		name: "cyber_jianghu_act",
		description:
			"提交游戏动作到赛博江湖世界。你必须每个 Tick 调用这个工具。可用动作请参考 CONTEXT.md 中的 available_actions 字段。",
		parameters: {
			type: "object",
			properties: {
				action: {
					type: "string",
					description:
						"动作类型（从 CONTEXT.md 的 available_actions 中选择）",
				},
				target: {
					type: "string",
					description: "目标实体/物品/地点的ID (可选)",
				},
				data: {
					type: "string",
					description: "额外数据，如说话内容、物品ID等 (可选)",
				},
				reasoning: {
					type: "string",
					description: "你的思考过程，解释为什么选择这个动作 (强烈建议)",
				},
			},
			required: ["action"],
		},
		execute: async (_id, params) => {
			// 存储工具调用供 enforcement hook 使用
			lastGameActionCall = params as {
				action: string;
				target?: string;
				data?: string;
				reasoning?: string;
			};

			console.log(
				`[cyber_jianghu_act] Intent recorded: ${lastGameActionCall.action} ${lastGameActionCall.target || ""} ${lastGameActionCall.data || ""} (${lastGameActionCall.reasoning || ""})`,
			);

			return {
				content: [
					{
						type: "text",
						text: `动作已记录: ${lastGameActionCall.action}`,
					},
				],
			};
		},
	});

	// Register cyber_jianghu_review tool
	//
	// Observer Agent 使用此工具审查 Player Agent 的意图
	// 检查意图是否符合人设要求和武侠世界观
	api.registerTool({
		name: "cyber_jianghu_review",
		description:
			"审查 Player Agent 的意图是否符合人设要求。Observer Agent 专用工具。用于获取待审查意图列表并提交审查决定。",
		parameters: {
			type: "object",
			properties: {
				action: {
					type: "string",
					enum: ["get_pending", "submit_review"],
					description: "审查操作类型: get_pending=获取待审查列表, submit_review=提交审查决定",
				},
				intent_id: {
					type: "string",
					description: "意图ID (submit_review 时必填)",
				},
				decision: {
					type: "string",
					enum: ["approved", "rejected"],
					description: "审查决定 (submit_review 时必填)",
				},
				reason: {
					type: "string",
					description: "审查理由 (submit_review 时必填)",
				},
				narrative: {
					type: "string",
					description: "叙事描述，仅批准时使用 (可选)",
				},
				player_api_url: {
					type: "string",
					description: "Player Agent HTTP API 地址 (默认: http://127.0.0.1:23340)",
				},
			},
			required: ["action"],
		},
		execute: async (_id, params) => {
			const action = params.action as string;
			const playerApiUrl = (params.player_api_url as string) || "http://127.0.0.1:23340";

			try {
				const { ReviewHttpClient } = await import("./tools/cyber_jianghu_review/http-client.js");
				const client = new ReviewHttpClient(playerApiUrl);

				if (action === "get_pending") {
					const pending = await client.getPendingReviews();
					return {
						content: [
							{
								type: "text",
								text: JSON.stringify(pending, null, 2),
							},
						],
					};
				}

				if (action === "submit_review") {
					const intentId = params.intent_id as string;
					const decision = params.decision as "approved" | "rejected";
					const reason = params.reason as string;
					const narrative = params.narrative as string | undefined;

					if (!intentId || !decision || !reason) {
						return {
							content: [
								{
									type: "text",
									text: "错误: submit_review 需要 intent_id, decision, 和 reason 参数",
								},
							],
							isError: true,
						};
					}

					const result = await client.submitReview(intentId, {
						result: decision,
						reason,
						narrative,
					});

					return {
						content: [
							{
								type: "text",
								text: JSON.stringify(result, null, 2),
							},
						],
					};
				}

				return {
					content: [
						{
							type: "text",
							text: `未知的审查操作: ${action}`,
						},
					],
					isError: true,
				};
			} catch (error) {
				const errorMessage = error instanceof Error ? error.message : String(error);
				console.error("[cyber_jianghu_review] Error:", errorMessage);
				return {
					content: [
						{
							type: "text",
							text: `审查操作失败: ${errorMessage}`,
						},
					],
					isError: true,
				};
			}
		},
	});

	// Register agent_end lifecycle hook (plugin hook, not internal hook)
	//
	// 这个 hook 在每次 agent 决策周期后运行
	// 它确保 cyber_jianghu_act 被调用，并将意图提交到游戏服务器
	api.on("agent_end", async (event, context) => {
		// 优先使用 WebSocket 共享的 tick 状态
		let tickId = sharedTickState?.tickId || 0;
		let agentId = sharedTickState?.agentId || "unknown";

		// 如果没有 WebSocket tick 状态，从 HTTP API 获取
		if (tickId === 0) {
			try {
				const { getHttpClientAsync } = await import("./tools/cyber_jianghu_act/http-client.js");
				const client = await getHttpClientAsync(0);
				const tickStatus = await client.get<{
					tick_id: number;
					agent_id: string;
				}>("/api/v1/tick");
				tickId = tickStatus.tick_id;
				agentId = tickStatus.agent_id;
				console.log(`[cyber-jianghu-openclaw] Current tick: ${tickId}, agent: ${agentId}`);
			} catch (e) {
				console.warn("[cyber-jianghu-openclaw] Failed to get tick status, using defaults:", e);
			}
		} else {
			console.log(`[cyber-jianghu-openclaw] Using tick from WebSocket: ${tickId}`);
		}

		// 将存储的工具调用传递给 enforcement handler
		const enrichedContext = {
			...context,
			tickId,
			agentId,
			lastGameActionCall,
			wsClient,
		};

		const { runEnforcement } = await import("./tools/cyber_jianghu_act/enforcement.js");
		await runEnforcement(event, enrichedContext);

		// 重置状态
		lastGameActionCall = null;
	});

	console.log("[cyber-jianghu-openclaw] Plugin registered successfully");
}

// Initialize WebSocket connection to Agent
async function initWebSocket(api: PluginAPI): Promise<void> {
	try {
		const { getWsClientAsync } = await import("./tools/cyber_jianghu_act/ws-client.js");

		console.log("[cyber-jianghu-openclaw] Connecting to Agent via WebSocket...");

		const client = await getWsClientAsync(0);

		// CRITICAL: Set wsClient BEFORE any async operations to prevent double initialization
		wsClient = client;

		// Handle tick messages
		client.onTick(async (tick) => {
			console.log(`[cyber-jianghu-openclaw] Tick ${tick.tick_id} received (deadline: ${tick.deadline_ms})`);
			sharedTickState = {
				tickId: tick.tick_id,
				deadlineMs: tick.deadline_ms,
				agentId: tick.state?.agent_id || "unknown",
				state: tick.state,
				context: tick.context,
			};

			// 生成并写入 CONTEXT.md
			await updateContextMd(tick.tick_id);
		});

		// Handle tick closed messages
		client.onTickClosed((msg) => {
			console.log(`[cyber-jianghu-openclaw] Tick ${msg.tick_id} closed: ${msg.reason}`);
		});

		// Handle errors
		client.onError((error) => {
			console.error("[cyber-jianghu-openclaw] WebSocket error:", error.message);
		});

		// Handle disconnect
		client.onDisconnect(() => {
			console.log("[cyber-jianghu-openclaw] WebSocket disconnected");
		});

		// Handle connect
		client.onConnect(() => {
			console.log("[cyber-jianghu-openclaw] WebSocket connected to Agent");
		});

		// Now connect after wsClient is set
		await client.connect();
	} catch (e) {
		console.error("[cyber-jianghu-openclaw] Failed to connect to Agent:", e);
	} finally {
		isInitializing = false;
	}
}

// 跟踪上一个写入的 tick ID，避免重复写入
let lastWrittenTickId = 0;

// 生成并写入 CONTEXT.md - 仅使用 WebSocket 传递的 context，禁止 HTTP
async function updateContextMd(tickId: number): Promise<void> {
	if (tickId <= lastWrittenTickId) {
		return;
	}

	const context = sharedTickState?.context;
	if (!context) {
		console.warn("[cyber-jianghu-openclaw] No context available from WebSocket tick");
		return;
	}

	const workspaceDir = "/home/node/workspace";
	const filePath = `${workspaceDir}/CONTEXT.md`;

	try {
		await fs.writeFile(filePath, context, "utf-8");
		lastWrittenTickId = tickId;
		console.log(`[cyber-jianghu-openclaw] CONTEXT.md updated for tick ${tickId}`);
	} catch (e) {
		console.error("[cyber-jianghu-openclaw] Failed to write CONTEXT.md:", e);
	}
}

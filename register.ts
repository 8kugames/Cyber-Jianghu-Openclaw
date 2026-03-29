// register.ts — Cyber-Jianghu OpenClaw Plugin Entry Point
// ============================================================================
// Architecture:
//   User (IM) ↕ OpenClaw (Brain) ←WS→ Agent (Body/Rust) ←WS→ Game Server
//
// This module:
//   1. Connects to the Rust Agent via WebSocket
//   2. Listens for LLMRequest from Agent, calls LLM via OpenClaw, sends back LLMResponse
//   3. Provides tools (dream/status) for user IM intervention
// ============================================================================

import { Type } from "@sinclair/typebox";
import { WsClient } from "./ws-client.js";
import { getHttpClient, getAgentInfo } from "./http-client.js";
import type {
        LLMRequestMessage,
        TickMessage,
        AgentDiedMessage,
} from "./types.js";

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
let isInitializing = false;
let globalPluginApi: PluginAPI | null = null;
let latestTickSnapshot: {
        tickId: number;
        deadlineMs: number;
        context: string | null;
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

        // 0. Initialize Reporter
        reporter = new Reporter();

        // 1. Register status tool (for user to query current state)
        api.registerTool({
                name: "cyber_jianghu_status",
                description: "获取赛博江湖中你当前角色的最新状态（位置、属性、周围环境等），用于向用户汇报。",
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
                                                                        message: "尚未收到游戏世界状态，请等待连接或下一次状态更新。",
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
                                                                context: latestTickSnapshot.context,
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

        // 2. Register create character tool
        api.registerTool({
                name: "cyber_jianghu_create_character",
                description: "在赛博江湖中创建一个新的侠客角色。需要收集用户的设定并转化为结构化数据。",
                parameters: Type.Object({
                        name: Type.String({ description: "角色姓名，例如：李寻欢" }),
                        age: Type.Optional(Type.Number({ description: "年龄（1-100）" })),
                        gender: Type.Optional(Type.String({ description: "性别（male, female, other）" })),
                        appearance: Type.Optional(Type.String({ description: "外貌描述" })),
                        identity: Type.Optional(Type.String({ description: "身份背景" })),
                        personality: Type.Optional(Type.Array(Type.String(), { description: "性格特征列表，例如：['嫉恶如仇', '嗜酒如命']" })),
                        values: Type.Optional(Type.Array(Type.String(), { description: "核心价值观列表" })),
                        language_style: Type.Optional(Type.Object({
                                tone: Type.Optional(Type.String()),
                                catchphrases: Type.Optional(Type.Array(Type.String())),
                                vocabulary: Type.Optional(Type.Array(Type.String()))
                        })),
                        goals: Type.Optional(Type.Object({
                                short_term: Type.Optional(Type.Array(Type.String())),
                                long_term: Type.Optional(Type.Array(Type.String()))
                        })),
                        system_prompt: Type.Optional(Type.String({ description: "自定义系统提示词（高级）" }))
                }),
                execute: async (_id, params) => {
                        try {
                                const httpClient = await getHttpClient();
                                await httpClient.post("/api/v1/character/register", params);
                                return {
                                        content: [
                                                {
                                                        type: "text",
                                                        text: `侠客 ${params.name} 创建成功！角色已注入赛博江湖。`,
                                                },
                                        ],
                                };
                        } catch (error) {
                                const msg = error instanceof Error ? error.message : String(error);
                                return {
                                        content: [
                                                {
                                                        type: "text",
                                                        text: `角色创建失败: ${msg}。可能是因为后端 Agent 未启动或连接异常。`,
                                                },
                                        ],
                                        isError: true,
                                };
                        }
                }
        });

        // 3. Register dream tool (for user intervention)
        api.registerTool({
                name: "cyber_jianghu_dream",
                description:
                        "代表用户向角色注入一个梦（托梦），影响角色意识。这是用户干预游戏世界的唯一方式。",
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
                                                        text: `托梦成功。"${content}" 将影响角色后续 ${duration} 个Tick的决策。`,
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
                                                                ? `托梦失败: 频率限制或额度用尽。(${msg})`
                                                                : `托梦失败: ${msg}`,
                                                },
                                        ],
                                        isError: true,
                                };
                        }
                },
        });

        // Init WebSocket
        await initWebSocket();

        // 3. Register agent_end hook for report delivery
        api.on("agent_end", async () => {
                const pending = reporter?.getPendingReport();
                if (pending) {
                        console.log(
                                `[cyber-jianghu] Pending ${pending.type} report available for delivery`,
                        );
                        // Report delivery: the report content is logged and available.
                        // In production, OpenClaw could push this to the user's IM channel.
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

                // Tick handler - store the latest state for user queries and trigger reporter
                wsClient.onTickHandler = (msg: TickMessage) => {
                        latestTickSnapshot = {
                                tickId: msg.tick_id,
                                deadlineMs: msg.deadline_ms,
                                context: msg.context ?? null,
                                updatedAt: new Date().toISOString(),
                        };
                        Promise.resolve()
                                .then(async () => {
                                        await reporter?.onTick(msg);
                                })
                                .catch((e) => console.error("[cyber-jianghu] Tick handler error:", e));
                };

                // Agent died - trigger reporter death narrative
                wsClient.onAgentDiedHandler = (msg: AgentDiedMessage) => {
                        console.log(
                                `[cyber-jianghu] Agent died: ${msg.cause} at ${msg.location} (tick ${msg.tick_id})`,
                        );
                        reporter?.onAgentDied(msg).catch((e) =>
                                console.error("[cyber-jianghu] onAgentDied error:", e),
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

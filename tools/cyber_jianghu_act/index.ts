// integration/openclaw/tools/jianghu_act/index.ts
// ============================================================================
// jianghu_act Tool - Core constraint that enforces LLM thinking
// ============================================================================
//
// This tool is the MANDATORY entry point for all game actions.
// OpenClaw agent MUST call this tool to act in the game world.
//
// 数据驱动设计：
// - 动作类型从服务端 available_actions 动态获取
// - 不硬编码动作列表
// - 参数验证由服务端处理
//
// 重要说明：
// - Intent 提交必须通过 WebSocket，HTTP API /api/v1/intent 已禁用
// - Agent 端有独立的超时机制，确保即使 OpenClaw 失败也会提交 idle
// ============================================================================

// Re-export types
export type {
	ActionType,
	GameActionParams,
	Intent,
	ActionResult,
	PersonaInfo,
	WorldState,
	AvailableAction,
	MemoryEntry,
	Relationship,
	LifespanStatus,
	RetryConfig,
} from "./types";

// Re-export HTTP client
export {
	HttpClient,
	getHttpClientAsync,
	discoverPort,
	PORT_RANGE,
	DEFAULT_HTTP_CONFIG,
} from "./http-client";
export type { HttpClientConfig } from "./http-client";

// Re-export intent builder
export { buildIntentFromParams } from "./intent-builder";

// Re-export execution (validation only, submission via WebSocket)
export { validateIntent } from "./execute";

// Re-export retry handler (validation with retry)
export { executeWithRetry } from "./retry-handler";
export type { ExecuteContext } from "./retry-handler";

// Re-export enforcement
export { runEnforcement } from "./enforcement";

// Re-export WebSocket client
export {
	WsClient,
	getWsClientAsync,
	resetWsClient,
} from "./ws-client";
export type {
	WsClientConfig,
	DownstreamMessage,
	UpstreamMessage,
	IntentMessage,
	TickMessage,
	TickClosedMessage,
} from "./ws-client";

// Re-export types constants
export { DEFAULT_RETRY_CONFIG } from "./types";

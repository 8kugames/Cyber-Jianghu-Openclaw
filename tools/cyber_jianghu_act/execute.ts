// tools/jianghu_act/execute.ts
// ============================================================================
// Game Action Execution - Validate intents via agent HTTP API
// ============================================================================
//
// 数据驱动设计：
// - 使用通用 HTTP 客户端，不定义具体接口
// - 所有接口以 crates/agent 实际披露的为准
// - Intent 构建在 intent-builder.ts 中处理
//
// 重要说明：
// - Intent 提交必须通过 WebSocket，HTTP API /api/v1/intent 已禁用
// - 本模块仅提供验证功能，不负责提交
// - Agent 端有独立的超时机制，确保即使验证失败也会提交 idle

import { getHttpClientAsync } from "./http-client.js";
import type { Intent, PersonaInfo } from "./types.js";

/**
 * @deprecated
 * HTTP API /api/v1/intent 已禁用，必须通过 WebSocket 提交 intent
 *
 * 此函数仅用于调试目的，生产环境不应使用。
 * 请使用 WebSocket client 的 sendIntent 方法提交 intent。
 *
 * @throws Error - 始终抛出错误，提示使用 WebSocket
 */
export async function submitIntentToServer(
	_intent: Intent,
	_port: number = 0,
): Promise<void> {
	throw new Error(
		"[execute] HTTP API /api/v1/intent is DISABLED.\n" +
		"[execute] You MUST submit intents via WebSocket.\n" +
		"[execute] Use wsClient.sendIntent(tickId, actionType, actionData, thoughtLog) instead.\n" +
		"[execute] See ws-client.ts for WebSocket client implementation."
	);
}

/**
 * Validate an intent using the agent HTTP API
 *
 * POST /api/v1/validate
 *
 * 此端点仍然可用，用于在提交前验证 intent
 */
export async function validateIntent(request: {
	intent: Intent;
	persona: PersonaInfo;
	world_context: string;
	port?: number;
}): Promise<{
	valid: boolean;
	reason?: string;
	rejection_type?: string;
	narrative?: string;
}> {
	const httpClient = await getHttpClientAsync(request.port || 0);

	return await httpClient.post("/api/v1/validate", {
		action_type: request.intent.action_type,
		agent_id: request.intent.agent_id,
		tick_id: request.intent.tick_id,
		action_data: request.intent.action_data,
		persona_gender: request.persona.gender,
		persona_age: request.persona.age,
		persona_personality: request.persona.personality,
		persona_values: request.persona.values,
		world_context: request.world_context,
	});
}

/**
 * @deprecated
 * HTTP API /api/v1/intent 已禁用，必须通过 WebSocket 提交 intent
 *
 * 此函数仅用于调试目的，生产环境不应使用。
 * 请使用 WebSocket client 的 sendIntent 方法提交 intent。
 *
 * @throws Error - 始终抛出错误，提示使用 WebSocket
 */
export async function buildAndSubmitIntent(
	_params: { action: string; target?: string; data?: string; reasoning?: string },
	_agentId: string,
	_tickId: number,
	_port: number = 0,
): Promise<Intent> {
	throw new Error(
		"[execute] HTTP API /api/v1/intent is DISABLED.\n" +
		"[execute] You MUST submit intents via WebSocket.\n" +
		"[execute] Use wsClient.sendIntent(tickId, actionType, actionData, thoughtLog) instead.\n" +
		"[execute] See ws-client.ts for WebSocket client implementation."
	);
}

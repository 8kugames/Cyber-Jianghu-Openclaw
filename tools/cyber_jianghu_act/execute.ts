// tools/jianghu_act/execute.ts
// ============================================================================
// Game Action Execution - Submit intents to agent HTTP API
// ============================================================================
//
// 数据驱动设计：
// - 使用通用 HTTP 客户端，不定义具体接口
// - 所有接口以 crates/agent 实际披露的为准
// - Intent 构建在 intent-builder.ts 中处理

import { getHttpClientAsync } from "./http-client.js";
import { buildIntentFromParams } from "./intent-builder.js";
import type { GameActionParams, Intent, PersonaInfo } from "./types.js";

// Re-export buildIntentFromParams as buildIntent for backward compat within module
export { buildIntentFromParams as buildIntent } from "./intent-builder.js";

/**
 * Submit an intent directly to the agent HTTP API
 *
 * POST /api/v1/intent
 */
export async function submitIntentToServer(
	intent: Intent,
	port: number = 0,
): Promise<void> {
	const httpClient = await getHttpClientAsync(port);
	await httpClient.post("/api/v1/intent", intent);
	console.log(`[execute] Submitted: ${intent.action_type}`);
}

/**
 * Validate an intent using the agent HTTP API
 *
 * POST /api/v1/validate
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
 * Build and submit intent in one step
 *
 * Convenience function that combines buildIntentFromParams + submitIntentToServer
 */
export async function buildAndSubmitIntent(
	params: GameActionParams,
	agentId: string,
	tickId: number,
	port: number = 0,
): Promise<Intent> {
	const intent = buildIntentFromParams(params, agentId, tickId);
	await submitIntentToServer(intent, port);
	return intent;
}

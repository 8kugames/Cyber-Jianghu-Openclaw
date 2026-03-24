// integration/openclaw/tools/jianghu_act/retry-handler.ts
// ============================================================================
// Retry Handler - Retry logic and validation
// ============================================================================
//
// 数据驱动设计：
// - 使用通用 HTTP 客户端，不定义具体接口
// - 所有 API 调用以 crates/agent 实际披露的为准
//
// 重要说明：
// - Intent 提交必须通过 WebSocket，HTTP API /api/v1/intent 已禁用
// - 本模块仅用于验证 intent，不负责提交
// - Agent 端有独立的超时机制，确保即使验证失败也会提交 idle

import type { HttpClient } from "./http-client.js";
import type {
	ActionResult,
	GameActionParams,
	PersonaInfo,
	RetryConfig,
	WorldState,
} from "./types.js";
import { DEFAULT_RETRY_CONFIG } from "./types.js";

/**
 * Calculate backoff delay with exponential backoff
 */
function calculateBackoff(attempt: number, config: RetryConfig): number {
	const delay = config.baseDelayMs * config.backoffMultiplier ** attempt;
	return Math.min(delay, config.maxDelayMs);
}

/**
 * Sleep for specified milliseconds
 */
function sleep(ms: number): Promise<void> {
	return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Execute context for retry handler
 */
export interface ExecuteContext {
	httpClient: HttpClient;
	agentId: string;
	tickId: number;
	worldState: WorldState | null;
	persona: PersonaInfo;
}

/**
 * Execute game action with retry logic
 */
export async function executeWithRetry(
	params: GameActionParams,
	context: ExecuteContext,
	config: RetryConfig = DEFAULT_RETRY_CONFIG,
): Promise<ActionResult> {
	let lastError: string | null = null;

	for (let attempt = 0; attempt <= config.maxRetries; attempt++) {
		try {
			const result = await executeGameAction(params, context);

			if (result.success) {
				return result;
			}

			// Validation failed - prepare for retry
			lastError = result.error || "Unknown validation error";

			console.warn(
				`[retry-handler] Attempt ${attempt + 1} failed: ${lastError}`,
			);

			// Wait before retry (except on last attempt)
			if (attempt < config.maxRetries) {
				const delay = calculateBackoff(attempt, config);
				console.log(`[retry-handler] Waiting ${delay}ms before retry...`);
				await sleep(delay);
			}
		} catch (error) {
			lastError = (error as Error).message;
			console.error(
				`[retry-handler] Attempt ${attempt + 1} threw error:`,
				error,
			);

			if (attempt < config.maxRetries) {
				await sleep(calculateBackoff(attempt, config));
			}
		}
	}

	// All retries exhausted - apply fallback strategy
	console.warn(
		`[retry-handler] All ${config.maxRetries + 1} attempts failed, applying fallback`,
	);

	return handleFallback(params, context, lastError, config);
}

/**
 * Execute a single game action (validation only)
 *
 * 使用通用 HTTP 客户端，调用 crates/agent 验证 API
 *
 * 注意：此函数仅验证 intent，不负责提交
 * Intent 提交必须通过 WebSocket，HTTP API /api/v1/intent 已禁用
 */
async function executeGameAction(
	params: GameActionParams,
	context: ExecuteContext,
): Promise<ActionResult> {
	const { httpClient, agentId, tickId, worldState, persona } = context;

	// 1. Build validation request
	// 使用服务端提供的 context（如果有），否则使用简单的 context
	const worldContextStr = worldState
		? JSON.stringify({
				tick_id: worldState.tick_id,
				location: worldState.location?.name,
				attributes: worldState.self_state?.attributes,
			})
		: "{}";

	// 2. Call validation endpoint (POST /api/v1/validate)
	const validateResponse = await httpClient.post<{
		valid: boolean;
		reason?: string;
		rejection_type?: string;
		narrative?: string;
	}>("/api/v1/validate", {
		action_type: params.action,
		agent_id: agentId,
		tick_id: tickId,
		action_data: params.data ? { target: params.target, data: params.data } : undefined,
		persona_gender: persona.gender,
		persona_age: persona.age,
		persona_personality: persona.personality,
		persona_values: persona.values,
		world_context: worldContextStr,
	});

	// 3. Handle validation result
	if (!validateResponse.valid) {
		return {
			success: false,
			error: validateResponse.reason,
			rejection_type: validateResponse.rejection_type,
			hint: generateRetryHint(validateResponse),
		};
	}

	// 4. Validation approved
	// 注意：实际提交需要通过 WebSocket，由调用者负责
	return {
		success: true,
		narrative: validateResponse.narrative,
	};
}

/**
 * Generate retry hint based on rejection type
 */
function generateRetryHint(response: {
	reason?: string;
	rejection_type?: string;
}): string {
	if (response.rejection_type) {
		return `验证失败: ${response.rejection_type}。原因: ${response.reason || "未知"}`;
	}
	return response.reason || "请重新考虑你的行动";
}

/**
 * Handle fallback when all retries fail
 *
 * 注意：不再尝试通过 HTTP 提交 idle
 * HTTP API /api/v1/intent 已禁用，必须通过 WebSocket 提交
 * Agent 端有独立的超时机制，会自动提交 idle
 */
async function handleFallback(
	originalParams: GameActionParams,
	context: ExecuteContext,
	lastError: string | null,
	_config: RetryConfig,
): Promise<ActionResult> {
	// Log incident
	logIncident("fallback_triggered", {
		original_action: originalParams.action,
		error: lastError,
		tick: context.tickId,
	});

	console.error(
		`[retry-handler] All retries failed for tick ${context.tickId}.\n` +
		`[retry-handler] Original action: ${originalParams.action}\n` +
		`[retry-handler] Last error: ${lastError}\n` +
		`[retry-handler] HTTP API /api/v1/intent is disabled - cannot submit fallback.\n` +
		`[retry-handler] Agent will auto-submit idle after timeout (tick_duration * 0.8).`
	);

	// 返回失败，让调用者知道需要通过 WebSocket 提交 idle
	return {
		success: false,
		error: `验证多次失败: ${lastError}`,
		hint: "请通过 WebSocket 提交 idle 动作，或等待 Agent 超时自动提交",
	};
}

/**
 * Log incident for analysis
 *
 * Note: In OpenClaw environment, we only log to console.
 * File logging is handled by OpenClaw's internal logging system.
 */
function logIncident(type: string, data: Record<string, unknown>): void {
	const incident = {
		type,
		timestamp: new Date().toISOString(),
		...data,
	};

	// Log to console - OpenClaw will capture this
	console.log(`[incident] ${JSON.stringify(incident)}`);
}

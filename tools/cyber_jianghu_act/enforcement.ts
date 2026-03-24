// integration/openclaw/tools/jianghu_act/enforcement.ts
// ============================================================================
// Agent End Hook Handler - Ensures jianghu_act is called every tick
// ============================================================================
//
// 数据驱动设计：
// - 使用通用 HTTP 客户端，不定义具体接口
// - 所有接口以 crates/agent 实际披露的为准
// - Persona 必须从配置或 SOUL.md 加载，无硬编码默认值
// - 重要性评分从配置加载，无硬编码规则
//
// 架构说明：
// - register.ts 中的 jianghu_act 工具只记录意图
// - 这个 hook 负责实际的验证、提交和记忆归档
// - Intent 提交必须通过 WebSocket，HTTP API 端点已禁用
// - Agent 端有独立的超时机制，确保即使 OpenClaw 失败也会提交 idle

import { getHttpClientAsync } from "./http-client.js";
import type { GameActionParams, PersonaInfo, WorldState } from "./types.js";

/**
 * 重要性评分配置
 *
 * 数据驱动：从配置加载，不硬编码
 */
interface ImportanceConfig {
	base: number;
	actionBonus: Record<string, number>;
	reasoningLengthBonus: { threshold: number; bonus: number };
	max: number;
}

/**
 * 默认重要性配置（可被 config.importance 覆盖）
 */
const DEFAULT_IMPORTANCE_CONFIG: ImportanceConfig = {
	base: 0.5,
	actionBonus: {
		attack: 0.3,
		use: 0.1,
		pickup: 0.1,
		give: 0.1,
		trade: 0.15,
		speak: 0.05,
	},
	reasoningLengthBonus: { threshold: 50, bonus: 0.1 },
	max: 1.0,
};

/**
 * Run enforcement logic after agent completes
 *
 * This is called by the agent_end plugin hook.
 */
export async function runEnforcement(
	_event: { messages?: unknown[]; runId?: string; [key: string]: unknown },
	context: {
		toolCalls?: Array<{ name: string; arguments: Record<string, unknown> }>;
		tickId?: number;
		agentId?: string;
		localApiPort?: number;
		lastAssistantMessage?: string;
		// 由 register.ts 传递
		lastGameActionCall?: {
			action: string;
			target?: string;
			data?: string;
			reasoning?: string;
		} | null;
		worldState?: WorldState;
		persona?: PersonaInfo;
		// OpenClaw 配置
		config?: {
			persona?: Partial<PersonaInfo>;
			importance?: Partial<ImportanceConfig>;
			[key: string]: unknown;
		};
		// 文件系统访问（用于读取 SOUL.md）
		workspace?: {
			readFile?: (path: string) => Promise<string>;
			[key: string]: unknown;
		};
		// WebSocket client for intent submission
		wsClient?: {
			sendIntent: (tickId: number, actionType: string, actionData?: unknown, thoughtLog?: string) => void;
			isConnected: () => boolean;
		};
		[key: string]: unknown;
	},
): Promise<void> {
	// 优先使用 register.ts 传递的 lastGameActionCall
	// 如果没有（例如直接调用），则从 toolCalls 中查找
	const gameActionCall = context.lastGameActionCall ||
		context.toolCalls?.find((tc) => tc.name === "cyber_jianghu_act")?.arguments;

	const gameActionCalled = !!gameActionCall;

	if (!gameActionCalled || !gameActionCall) {
		console.warn("[enforcement] LLM did not call jianghu_act");
		// 尝试通过 WebSocket 提交 idle
		if (context.wsClient && context.wsClient.isConnected()) {
			console.log("[enforcement] Submitting idle via WebSocket");
			context.wsClient.sendIntent(context.tickId || 0, "idle", undefined, "LLM did not call jianghu_act");
		} else {
			console.error("[enforcement] WebSocket not connected, cannot submit idle. Agent will handle timeout.");
		}
		return;
	}

	// 提取参数
	const params = gameActionCall as GameActionParams;

	// 执行动作
	try {
		const httpClient = await getHttpClientAsync(context.localApiPort || 0);

		// Tick boundary validation - reject intents for expired ticks
		const tickValid = await validateTickBoundary(httpClient, context.tickId || 0);
		if (!tickValid.valid) {
			console.warn(`[enforcement] Intent expired: tick ${context.tickId} < current ${tickValid.currentTick}. Skipping submission.`);
			await archiveDecision(context, params, gameActionCalled, true);
			return;
		}

		// 如果 WebSocket 可用且已连接，使用 WebSocket 提交 intent
		if (context.wsClient && context.wsClient.isConnected()) {
			console.log("[enforcement] Submitting intent via WebSocket");
			context.wsClient.sendIntent(
				context.tickId || 0,
				params.action,
				params.data ? { target: params.target, data: params.data } : undefined,
				params.reasoning,
			);
			await archiveDecision(context, params, gameActionCalled);
			return;
		}

		// WebSocket 不可用 - 输出错误，不使用 HTTP fallback
		// HTTP API /api/v1/intent 端点已禁用，必须使用 WebSocket
		// Agent 端有独立的超时机制，会在超时后自动提交 idle
		console.error(
			"[enforcement] WebSocket not connected! Intent submission requires WebSocket.\n" +
			"[enforcement] HTTP API /api/v1/intent is disabled - you must connect via WebSocket.\n" +
			"[enforcement] Agent will auto-submit idle after timeout (tick_duration * 0.8).\n" +
			`[enforcement] Lost intent: tick=${context.tickId}, action=${params.action}`
		);
		await archiveDecision(context, params, gameActionCalled);
	} catch (error) {
		console.error("[enforcement] Failed to execute action:", error);
		// 即使失败也尝试归档
		await archiveDecision(context, params, gameActionCalled);
	}
}

/**
 * Validate tick boundary before submitting intent
 *
 * Returns true if the intent's tick is still valid (not expired)
 */
async function validateTickBoundary(
	httpClient: Awaited<ReturnType<typeof getHttpClientAsync>>,
	intentTickId: number,
): Promise<{ valid: boolean; currentTick: number }> {
	try {
		const tickStatus = await httpClient.get<{
			tick_id: number;
		}>("/api/v1/tick");

		return {
			valid: intentTickId >= tickStatus.tick_id,
			currentTick: tickStatus.tick_id,
		};
	} catch (error) {
		console.warn("[enforcement] Failed to validate tick boundary:", error);
		return { valid: true, currentTick: intentTickId };
	}
}

/**
 * Archive decision to memory
 */
async function archiveDecision(
	context: {
		tickId?: number;
		lastAssistantMessage?: string;
		localApiPort?: number;
		config?: { importance?: Partial<ImportanceConfig> };
	},
	action: { action: string; target?: string; data?: string; reasoning?: string },
	gameActionCalled: boolean,
	expired: boolean = false,
): Promise<void> {
	try {
		const httpClient = await getHttpClientAsync(context.localApiPort || 0);

		const decision = {
			tick: context.tickId,
			action: {
				action: action.action,
				target: action.target,
				data: action.data,
			},
			reasoning: action.reasoning || context.lastAssistantMessage,
			jianghu_act_called: gameActionCalled,
			expired,
		};

		// 使用配置的重要性计算（数据驱动）
		const importanceConfig: ImportanceConfig = {
			...DEFAULT_IMPORTANCE_CONFIG,
			...context.config?.importance,
		};

		// POST /api/v1/memory
		await httpClient.post("/api/v1/memory", {
			content: JSON.stringify(decision),
			importance: calculateImportance(decision, importanceConfig),
			metadata: {
				type: "decision",
				tick: decision.tick,
				action: decision.action?.action,
				expired,
			},
		});
	} catch (error) {
		console.error("[enforcement] Failed to archive decision:", error);
	}
}

/**
 * Calculate importance score for a decision
 *
 * 数据驱动：使用配置，不硬编码规则
 */
function calculateImportance(
	decision: {
		action?: { action: string } | null;
		reasoning?: string;
	},
	config: ImportanceConfig,
): number {
	let importance = config.base;

	// 动作类型加成（从配置读取）
	if (decision.action?.action && config.actionBonus[decision.action.action]) {
		importance += config.actionBonus[decision.action.action];
	}

	// 推理长度加成（从配置读取）
	if (decision.reasoning && decision.reasoning.length > config.reasoningLengthBonus.threshold) {
		importance += config.reasoningLengthBonus.bonus;
	}

	return Math.min(importance, config.max);
}

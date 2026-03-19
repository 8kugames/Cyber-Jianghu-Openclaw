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

import { getHttpClientAsync } from "./http-client.js";
import { executeWithRetry } from "./retry-handler.js";
import type { GameActionParams, PersonaInfo, WorldState } from "./types.js";
import { DEFAULT_RETRY_CONFIG } from "./types.js";

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
		[key: string]: unknown;
	},
): Promise<void> {
	// 优先使用 register.ts 传递的 lastGameActionCall
	// 如果没有（例如直接调用），则从 toolCalls 中查找
	const gameActionCall = context.lastGameActionCall ||
		context.toolCalls?.find((tc) => tc.name === "cyber_jianghu_act")?.arguments;

	const gameActionCalled = !!gameActionCall;

	if (!gameActionCalled || !gameActionCall) {
		console.warn("[enforcement] LLM did not call jianghu_act, submitting idle action");
		await submitIdleAction(context);
		return;
	}

	// 提取参数
	const params = gameActionCall as GameActionParams;

	// 获取 Persona（必须从配置加载）
	const persona = await getPersona(context);

	// 执行动作（带重试）
	try {
		const httpClient = await getHttpClientAsync(context.localApiPort || 0);

		// 构建 context
		const executeContext = {
			httpClient,
			agentId: context.agentId || "unknown",
			tickId: context.tickId || 0,
			worldState: context.worldState || null,
			persona,
		};

		const result = await executeWithRetry(params, executeContext, DEFAULT_RETRY_CONFIG);

		if (!result.success) {
			console.warn(`[enforcement] Action failed: ${result.error}`);
		}

		// 归档决策到记忆
		await archiveDecision(context, params, gameActionCalled);
	} catch (error) {
		console.error("[enforcement] Failed to execute action:", error);
		// 即使失败也尝试归档
		await archiveDecision(context, params, gameActionCalled);
	}
}

/**
 * Get persona from context, config, or SOUL.md
 *
 * 数据驱动：必须从配置加载，无假数据兜底
 *
 * Priority:
 * 1. context.persona (from enforcement call)
 * 2. config.persona (from OpenClaw config)
 * 3. SOUL.md (if workspace available)
 * 4. Error - persona is required
 */
async function getPersona(
	context: {
		persona?: PersonaInfo;
		config?: { persona?: Partial<PersonaInfo> };
		workspace?: { readFile?: (path: string) => Promise<string> };
		agentId?: string;
	}
): Promise<PersonaInfo> {
	// 1. Use context.persona if provided
	if (context.persona) {
		return context.persona;
	}

	// 2. Use config.persona if provided
	if (context.config?.persona) {
		const p = context.config.persona;
		// 必须提供 gender 和 age
		if (!p.gender || !p.age) {
			throw new Error(
				"[enforcement] config.persona 必须提供 gender 和 age。" +
				"请在 OpenClaw 配置或 SOUL.md 中定义角色信息。"
			);
		}
		return {
			gender: p.gender,
			age: p.age,
			personality: p.personality || [],
			values: p.values || [],
		};
	}

	// 3. Try to load from SOUL.md
	if (context.workspace?.readFile) {
		try {
			const soulContent = await context.workspace.readFile("SOUL.md");
			const persona = parsePersonaFromSoul(soulContent);
			// 验证必要字段
			if (persona.gender === "未知" || persona.age === 0) {
				throw new Error(
					"[enforcement] SOUL.md 必须包含性别和年龄信息。" +
					"示例格式:\n" +
					"- 性别: 女\n" +
					"- 年龄: 25岁"
				);
			}
			return persona;
		} catch (e) {
			if (e instanceof Error && e.message.includes("必须")) {
				throw e;
			}
			console.warn("[enforcement] Failed to read SOUL.md:", e);
		}
	}

	// 4. Error - persona is required for data-driven design
	throw new Error(
		"[enforcement] 未找到角色配置。必须通过以下方式之一提供 persona:\n" +
		"1. context.persona（代码传入）\n" +
		"2. config.persona（OpenClaw 配置）\n" +
		"3. SOUL.md（工作区文件）"
	);
}

/**
 * Parse persona info from SOUL.md content
 *
 * 数据驱动：解析 Markdown 格式的角色定义
 */
function parsePersonaFromSoul(content: string): PersonaInfo {
	const persona: PersonaInfo = {
		gender: "未知",
		age: 0,
		personality: [],
		values: [],
	};

	const lines = content.split("\n");

	for (const line of lines) {
		const trimmed = line.trim();

		// Extract gender (支持多种格式)
		// - 性别: 女
		// - **性别**: 女
		// - 性别：女
		const genderMatch = trimmed.match(/(?:\*{0,2}性别\*{0,2})\s*[:：]\s*(男|女|未知)/);
		if (genderMatch) {
			persona.gender = genderMatch[1];
		}

		// Extract age (支持多种格式)
		// - 年龄: 25岁
		// - **年龄**: 25
		// - 年龄：25
		const ageMatch = trimmed.match(/(?:\*{0,2}年龄\*{0,2})\s*[:：]\s*(\d+)/);
		if (ageMatch) {
			persona.age = parseInt(ageMatch[1], 10);
		}

		// Extract personality traits (列表项)
		if (trimmed.startsWith("-") || trimmed.startsWith("*")) {
			const trait = trimmed.replace(/^[-*]\s*/, "").trim();
			// Skip headers, long descriptions, and empty lines
			if (trait.length > 0 && trait.length < 20 && !trait.includes(":") && !trait.startsWith("#")) {
				persona.personality.push(trait);
			}
		}
	}

	return persona;
}

/**
 * Submit idle action when LLM fails to call jianghu_act
 */
async function submitIdleAction(
	context: { tickId?: number; agentId?: string; localApiPort?: number },
): Promise<void> {
	try {
		const httpClient = await getHttpClientAsync(context.localApiPort || 0);

		const idleIntent = {
			agent_id: context.agentId || "unknown",
			tick_id: context.tickId || 0,
			action_type: "idle",
		};

		// POST /api/v1/intent
		await httpClient.post("/api/v1/intent", idleIntent);
	} catch (error) {
		console.error("[enforcement] Failed to submit idle action:", error);
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

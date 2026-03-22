// cyber-jianghu-bootstrap/handler.ts
// ============================================================================
// Bootstrap Hook Handler - Fetches WorldState and generates CONTEXT.md
// ============================================================================
//
// Tick-Driven Design:
// - Polls for new ticks at configurable intervals
// - Only triggers OpenClaw when WorldState actually changes
// - Respects game tick deadlines from API
//
// 数据驱动设计：
// - 使用通用 HTTP 客户端
// - 所有接口以 crates/agent 实际披露的为准
// - 动作列表从 WorldState.available_actions 动态获取
// - 不硬编码游戏逻辑（如生存优先级）

import { getHttpClientAsync } from "../../tools/cyber_jianghu_act/http-client.js";
import type { AvailableAction, CognitiveContext, CognitiveContextResponse } from "../../tools/cyber_jianghu_act/types.js";

/**
 * Hook event type (compatible with OpenClaw internal hooks)
 */
type HookEvent = {
	type: "agent";
	action: "bootstrap" | "cron";
	context: {
		workspaceDir: string;
		cfg?: unknown;
		sessionKey?: string;
		sessionId?: string;
		agentId?: string;
		workspace?: {
			writeFile: (path: string, content: string) => Promise<void>;
			[key: string]: unknown;
		};
		[key: string]: unknown;
	};
	timestamp: number;
};

/**
 * Type guard to check if workspace has writeFile
 */
function hasWriteFile(
	workspace: unknown,
): workspace is { writeFile: (path: string, content: string) => Promise<void> } {
	return (
		typeof workspace === "object" &&
		workspace !== null &&
		"writeFile" in workspace &&
		typeof (workspace as { writeFile: unknown }).writeFile === "function"
	);
}

/**
 * Tick state for change detection
 */
let lastKnownTickId: number = 0;

/**
 * Available actions cache from last WorldState
 */
let cachedAvailableActions: AvailableAction[] = [];

/**
 * Generate decision hints for the LLM (data-driven)
 *
 * 动作列表从 WorldState.available_actions 动态生成
 * 不硬编码任何游戏逻辑
 */
function generateDecisionHints(
    availableActions: AvailableAction[],
    secondsUntilNextTick?: number,
): string {
	// 动态生成动作列表
	const actionList = availableActions.length > 0
		? availableActions.map(a => {
				let line = `- \`${a.action}\``;
				if (a.description) line += ` - ${a.description}`;
				return line;
			}).join("\n")
		: "(No available actions - check CONTEXT.md for current state)";

	// 动态生成决策窗口提示
	const timingHint = secondsUntilNextTick !== undefined
		? `**Decision Window**: You have approximately ${secondsUntilNextTick} seconds before the tick deadline.`
		: `**Decision Window**: Submit your action before the tick deadline.`;

	return `
## Decision Hints

Based on the above status, choose an appropriate action and submit it using the \`cyber_jianghu_act\` tool.

**CRITICAL**: You must call the cyber_jianghu_act tool to submit your action. No exceptions.

**Available Actions**:
${actionList}

${timingHint}
`;
}

/**
 * Format the cognitive context into a Markdown CONTEXT.md document.
 * This follows the four-stage structure:
 *  - Stage 1: Perception (self_status, environment, key_observations)
 *  - Stage 2: Motivation (active_drives with intensity, dominant_drive)
 *  - Stage 3: Planning (current_goals, available_actions)
  *  - Stage 4: Decision (thinking_prompt)
 *
 * @param cog The cognitive context payload from the cognitive endpoint
 * @param tickId The current tick id to include in the header
 */
function formatCognitiveContext(
  cog: CognitiveContext,
  tickId: number,
): string {
  // Be defensive and support variations in the payload shape
  const stage1 = (cog as any).stage1 ?? {};
  const stage2 = (cog as any).stage2 ?? {};
  const stage3 = (cog as any).stage3 ?? {};
  const stage4 = (cog as any).stage4 ?? {};

  // Perception
  const self_status = stage1.self_status ?? (cog as any).self_status ?? "";
  const environment = stage1.environment ?? (cog as any).environment ?? "";
  const key_observations = (stage1.key_observations ?? (cog as any).key_observations ?? []) as any[];

  // Motivation
  const active_drives = (stage2.active_drives ?? (cog as any).active_drives ?? []) as any[];
  const dominant_drive = stage2.dominant_drive ?? (cog as any).dominant_drive ?? "";

  // Planning
  const current_goals = (stage3.current_goals ?? (cog as any).current_goals ?? []) as any[];
  const available_actions = (stage3.available_actions ?? (cog as any).available_actions ?? []) as AvailableAction[];

  // Decision
  const thinking_prompt = stage4.thinking_prompt ?? (cog as any).thinking_prompt ?? "";

  const makeOrNull = (v: any) => (Array.isArray(v) ? v.map(String) : v ?? "");

  const obsLines = (key_observations && key_observations.length > 0)
    ? key_observations.map(o => `- ${o}`).join("\n")
    : "- 无观察";

  const drivesLines = active_drives && active_drives.length > 0
    ? active_drives.map((d: any) => {
        const drive = d.drive ?? d.name ?? String(d);
        const intensity = d.intensity ?? d.level ?? 0;
        const reason = d.reason ?? "";
        return `- **${drive}** (强度: ${intensity}/10)${reason ? ` - ${reason}` : ""}`;
      }).join("\n")
    : "- 无驱动力";

  const goalsLines = current_goals && current_goals.length > 0
    ? current_goals.map((g: any) => `- ${g}`).join("\n")
    : "- 无目标";

  const actionsLines = available_actions && available_actions.length > 0
    ? available_actions.map(a => `- \`${a.action}\` - ${a.description ?? ""}`).join("\n")
    : "- 无可用动作";

  // Assemble final Markdown
  const header = `# 赛博江湖 - Tick ${tickId}\n`;
  const sectionPerception = `## 第一阶段：感知\n\n### 自身状态\n${self_status}\n\n### 环境\n${environment}\n\n### 关键观察\n${obsLines}\n`;
  const sectionMotivation = `## 第二阶段：动机\n\n### 当前驱动力\n${drivesLines}\n\n### 主导驱动力\n${dominant_drive}\n`;
  const sectionPlanning = `## 第三阶段：规划\n\n### 当前目标\n${goalsLines}\n\n### 可用动作\n${actionsLines}\n`;
  const sectionDecision = `## 第四阶段：决策\n\n${thinking_prompt}\n`;

  return `${header}\n${sectionPerception}\n${sectionMotivation}\n${sectionPlanning}\n${sectionDecision}\n`;
}

/**
 * Bootstrap hook handler
 *
 * This function is called on agent bootstrap or cron tick.
 * It fetches the formatted context from the agent HTTP API and writes it to CONTEXT.md.
 * Only updates when tick_id changes.
 */
const handler = async (event: HookEvent): Promise<void> => {
	const { context } = event;
	const { workspaceDir, workspace } = context;

	if (!workspaceDir) {
		console.warn("[bootstrap] No workspaceDir in context, skipping");
		return;
	}

	try {
		// Discover the agent HTTP API port
		const client = await getHttpClientAsync(0);

		// Check if connected (GET /api/v1/health)
		let isHealthy = false;
		try {
			const health = await client.get<{ status: string }>("/api/v1/health");
			isHealthy = health.status === "ok";
		} catch {
			isHealthy = false;
		}

		if (!isHealthy) {
			console.warn(
				"[bootstrap] Agent HTTP API not reachable. Make sure cyber-jianghu-agent is running.",
			);
			return;
		}

		// First check tick status to detect changes
		const tickStatus = await client.get<{
			tick_id: number;
			agent_id: string;
			has_new_state: boolean;
			seconds_until_next_tick?: number;
		}>("/api/v1/tick");

		// Skip if tick hasn't changed
		if (tickStatus.tick_id === lastKnownTickId) {
			console.log(`[bootstrap] Tick ${tickStatus.tick_id} unchanged, skipping update`);
			return;
		}

		// Update last known tick
		const previousTickId = lastKnownTickId;
		lastKnownTickId = tickStatus.tick_id;

		console.log(
			`[bootstrap] New Tick detected: ${tickStatus.tick_id} (previous: ${previousTickId})`
		);

		// Get cognitive context from agent HTTP API (GET /api/v1/cognitive)
		// This provides structured four-stage reasoning: Perception → Motivation → Planning → Decision
		const cognitiveResponse = await client.get<CognitiveContextResponse>("/api/v1/cognitive");

		// Extract available actions for decision hints
		const availableActions = cognitiveResponse.cognitive_context.planning?.available_actions ?? cachedAvailableActions;

		// Cache available actions for hints
		if (availableActions.length > 0) {
			cachedAvailableActions = availableActions;
		}

		// Generate data-driven decision hints
		const hints = generateDecisionHints(
			cachedAvailableActions,
			tickStatus.seconds_until_next_tick,
		);

		// Format cognitive context as Markdown with four stages
		const cognitiveMd = formatCognitiveContext(
			cognitiveResponse.cognitive_context,
			tickStatus.tick_id
		);

		const contextMd = cognitiveMd + hints;

		// Write to workspace using the workspace API
		// Note: OpenClaw provides workspace.writeFile through context
		if (!hasWriteFile(workspace)) {
			console.error("[bootstrap] workspace.writeFile not available from OpenClaw");
			return;
		}

		await workspace.writeFile("CONTEXT.md", contextMd);

		console.log(
			`[bootstrap] CONTEXT.md updated for tick ${tickStatus.tick_id}`
		);

		// Log timing info for debugging
		if (tickStatus.seconds_until_next_tick !== undefined) {
			console.log(
				`[bootstrap] ~${tickStatus.seconds_until_next_tick}s until next tick`
			);
		}
	} catch (error) {
		console.error("[bootstrap] Failed:", error);
		// Don't throw - the previous CONTEXT.md will be used if available
	}
};

export default handler;

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
import type { AvailableAction } from "../../tools/cyber_jianghu_act/types.js";

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

		// Get formatted context from agent HTTP API (GET /api/v1/context)
		const response = await client.get<{
			context: string;
			tick_id: number;
			agent_id: string;
		}>("/api/v1/context");

		// Get WorldState to extract available_actions
		const worldState = await client.get<{
			available_actions?: AvailableAction[];
		}>("/api/v1/state");

		// Cache available actions for hints
		if (worldState.available_actions) {
			cachedAvailableActions = worldState.available_actions;
		}

		// Generate data-driven decision hints
		const hints = generateDecisionHints(
			cachedAvailableActions,
			tickStatus.seconds_until_next_tick,
		);

		const contextMd = response.context + hints;

		// Write to workspace using the workspace API
		// Note: OpenClaw provides workspace.writeFile through context
		if (!hasWriteFile(workspace)) {
			console.error("[bootstrap] workspace.writeFile not available from OpenClaw");
			return;
		}

		await workspace.writeFile("CONTEXT.md", contextMd);

		console.log(
			`[bootstrap] CONTEXT.md updated for tick ${response.tick_id}`
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

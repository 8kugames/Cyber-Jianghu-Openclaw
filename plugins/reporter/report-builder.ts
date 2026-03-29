// plugins/reporter/report-builder.ts
// ============================================================================
// Report Builder — experiences query + narrative generation
// ============================================================================
//
// Pure functions for building daily reports and death narratives.
// No HTTP calls, no side effects — fetching is done by the Reporter class.

import type { AgentDiedMessage } from "../../types.js";

// ---------------------------------------------------------------------------
// Experience type (returned by GET /api/v1/character/experiences)
// ---------------------------------------------------------------------------

export interface Experience {
	tick_id: number;
	world_time: { year: number; month: number; day: number; hour: number; minute: number };
	event: string;
	observer_thought?: string;
	intent_summary?: string;
}

// ---------------------------------------------------------------------------
// Day matching
// ---------------------------------------------------------------------------

/**
 * Check if a world_time falls on the given game day.
 * `gameDay` format: `"year-month-day"` (e.g. `"1-3-15"`).
 */
export function matchesGameDay(
	worldTime: { year: number; month: number; day: number },
	gameDay: string,
): boolean {
	return `${worldTime.year}-${worldTime.month}-${worldTime.day}` === gameDay;
}

// ---------------------------------------------------------------------------
// Narrative helpers
// ---------------------------------------------------------------------------

/** Categorise an experience event for grouping. */
function categorise(event: string): "combat" | "dialogue" | "movement" | "trade" | "rest" | "other" {
	const lower = event.toLowerCase();
	if (/战斗|攻击|被击|反击|击杀|受伤|阵亡|combat|attack|fight|kill/.test(lower)) return "combat";
	if (/对话|交谈|说话|询问|dialogue|speak|talk|chat/.test(lower)) return "dialogue";
	if (/移动|前往|来到|离开|行走|move|travel|go|arrive|leave/.test(lower)) return "movement";
	if (/交易|购买|出售|买卖|trade|buy|sell|shop/.test(lower)) return "trade";
	if (/休息|冥想|打坐|idle|rest|meditate|sleep/.test(lower)) return "rest";
	return "other";
}

/** Format time-of-day from world_time. */
function formatHourMinute(wt: { hour: number; minute: number }): string {
	return `${String(wt.hour).padStart(2, "0")}:${String(wt.minute).padStart(2, "0")}`;
}

/** Parse gameDay `"year-month-day"` to readable Chinese date. */
function formatGameDay(gameDay: string): string {
	const parts = gameDay.split("-");
	if (parts.length !== 3) return gameDay;
	return `第${parts[0]}年${parts[1]}月${parts[2]}日`;
}

// ---------------------------------------------------------------------------
// buildNarrative — daily report
// ---------------------------------------------------------------------------

/**
 * Build a wuxia-style narrative report from a day's experiences.
 *
 * Returns a Markdown string suitable for pushing to the user's IM channel.
 */
export function buildNarrative(experiences: Experience[], gameDay: string): string {
	if (experiences.length === 0) {
		return `【江湖见闻 · ${formatGameDay(gameDay)}】\n\n今日风平浪静，无事发生。\n`;
	}

	// Sort by tick_id for chronological order
	const sorted = [...experiences].sort((a, b) => a.tick_id - b.tick_id);

	// Group by category
	const groups: Record<string, Experience[]> = {};
	for (const exp of sorted) {
		const cat = categorise(exp.event);
		(groups[cat] ??= []).push(exp);
	}

	const lines: string[] = [];
	lines.push(`【江湖见闻 · ${formatGameDay(gameDay)}】`);
	lines.push("");

	// Overview paragraph — chronological highlights
	lines.push("## 一日概述");
	const highlights = sorted.filter((e) => categorise(e.event) !== "rest").slice(0, 8);
	if (highlights.length > 0) {
		for (const h of highlights) {
			const time = formatHourMinute(h.world_time);
			const line = h.intent_summary
				? `- [${time}] ${h.intent_summary}`
				: `- [${time}] ${h.event}`;
			lines.push(line);
		}
	} else {
		lines.push("整日波澜不惊。");
	}
	lines.push("");

	// Combat section
	if (groups.combat?.length) {
		lines.push("## 刀光剑影");
		for (const c of groups.combat) {
			const time = formatHourMinute(c.world_time);
			lines.push(`- [${time}] ${c.event}`);
			if (c.observer_thought) lines.push(`  > ${c.observer_thought}`);
		}
		lines.push("");
	}

	// Dialogue section
	if (groups.dialogue?.length) {
		lines.push("## 江湖言语");
		for (const d of groups.dialogue) {
			const time = formatHourMinute(d.world_time);
			lines.push(`- [${time}] ${d.intent_summary || d.event}`);
		}
		lines.push("");
	}

	// Movement section
	if (groups.movement?.length) {
		lines.push("## 足迹所至");
		const locations = [...new Set(groups.movement.map((m) => m.intent_summary || m.event))];
		for (const loc of locations) {
			lines.push(`- ${loc}`);
		}
		lines.push("");
	}

	// Trade section
	if (groups.trade?.length) {
		lines.push("## 银货两讫");
		for (const t of groups.trade) {
			const time = formatHourMinute(t.world_time);
			lines.push(`- [${time}] ${t.intent_summary || t.event}`);
		}
		lines.push("");
	}

	// Other notable events
	if (groups.other?.length) {
		lines.push("## 杂闻轶事");
		for (const o of groups.other) {
			const time = formatHourMinute(o.world_time);
			lines.push(`- [${time}] ${o.event}`);
			if (o.observer_thought) lines.push(`  > ${o.observer_thought}`);
		}
		lines.push("");
	}

	// Statistics
	lines.push("---");
	lines.push(`本日共历 ${sorted.length} 刻。`);
	const combatCount = groups.combat?.length ?? 0;
	const dialogueCount = groups.dialogue?.length ?? 0;
	if (combatCount) lines.push(`- 交锋: ${combatCount} 次`);
	if (dialogueCount) lines.push(`- 交谈: ${dialogueCount} 次`);

	return lines.join("\n");
}

// ---------------------------------------------------------------------------
// constructDeathNarrative — death notification
// ---------------------------------------------------------------------------

/**
 * Build a death notification in wuxia style.
 */
export function constructDeathNarrative(msg: AgentDiedMessage): string {
	const lines: string[] = [];

	lines.push("🕯️ **角色陨落**");
	lines.push("");
	lines.push(`> ${msg.description}`);
	lines.push("");
	lines.push(`- **死因**: ${msg.cause}`);
	lines.push(`- **地点**: ${msg.location}`);
	lines.push(`- **时刻**: 第 ${msg.tick_id} 刻`);
	lines.push("");

	if (msg.rebirth_delay_ticks === -1) {
		lines.push("此为永久死亡，无法转世重生。");
		lines.push("尘缘已尽，江湖再见。");
	} else if (msg.rebirth_delay_ticks >= 0) {
		lines.push(
			`角色将在 ${msg.rebirth_delay_ticks} 刻后可重入轮回。` +
			"请回复是否重生，并描述新角色人设。",
		);
	}

	return lines.join("\n");
}

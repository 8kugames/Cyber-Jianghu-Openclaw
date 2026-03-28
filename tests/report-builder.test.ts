import { describe, it, expect } from "vitest";
import {
	matchesGameDay,
	buildNarrative,
	constructDeathNarrative,
	type Experience,
} from "../plugins/reporter/report-builder.js";
import type { AgentDiedMessage } from "../tools/act/types.js";

// ---------------------------------------------------------------------------
// matchesGameDay
// ---------------------------------------------------------------------------

describe("matchesGameDay", () => {
	it("returns true when world_time matches gameDay string", () => {
		expect(
			matchesGameDay({ year: 1, month: 3, day: 15 }, "1-3-15"),
		).toBe(true);
	});

	it("returns false when year differs", () => {
		expect(
			matchesGameDay({ year: 2, month: 3, day: 15 }, "1-3-15"),
		).toBe(false);
	});

	it("returns false when month differs", () => {
		expect(
			matchesGameDay({ year: 1, month: 4, day: 15 }, "1-3-15"),
		).toBe(false);
	});

	it("returns false when day differs", () => {
		expect(
			matchesGameDay({ year: 1, month: 3, day: 16 }, "1-3-15"),
		).toBe(false);
	});
});

// ---------------------------------------------------------------------------
// buildNarrative
// ---------------------------------------------------------------------------

const makeExperience = (
	overrides: Partial<Experience> & Pick<Experience, "tick_id" | "event">,
): Experience => ({
	world_time: { year: 1, month: 3, day: 15, hour: 10, minute: 30 },
	...overrides,
});

describe("buildNarrative", () => {
	it("returns calm report when no experiences", () => {
		const result = buildNarrative([], "1-3-15");
		expect(result).toContain("风平浪静");
		expect(result).toContain("第1年3月15日");
	});

	it("includes overview section with highlights", () => {
		const experiences: Experience[] = [
			makeExperience({ tick_id: 1, event: "战斗" }),
			makeExperience({ tick_id: 2, event: "对话" }),
		];
		const result = buildNarrative(experiences, "1-3-15");
		expect(result).toContain("一日概述");
		expect(result).toContain("战斗");
		expect(result).toContain("对话");
	});

	it("includes combat section when combat events present", () => {
		const experiences: Experience[] = [
			makeExperience({ tick_id: 1, event: "被敌人攻击" }),
		];
		const result = buildNarrative(experiences, "1-3-15");
		expect(result).toContain("刀光剑影");
	});

	it("includes dialogue section when dialogue events present", () => {
		const experiences: Experience[] = [
			makeExperience({ tick_id: 1, event: "与NPC交谈" }),
		];
		const result = buildNarrative(experiences, "1-3-15");
		expect(result).toContain("江湖言语");
	});

	it("includes movement section when movement events present", () => {
		const experiences: Experience[] = [
			makeExperience({
				tick_id: 1,
				event: "移动",
				intent_summary: "前往长安城",
			}),
		];
		const result = buildNarrative(experiences, "1-3-15");
		expect(result).toContain("足迹所至");
		expect(result).toContain("前往长安城");
	});

	it("includes trade section when trade events present", () => {
		const experiences: Experience[] = [
			makeExperience({ tick_id: 1, event: "购买物品" }),
		];
		const result = buildNarrative(experiences, "1-3-15");
		expect(result).toContain("银货两讫");
	});

	it("includes statistics footer", () => {
		const experiences: Experience[] = [
			makeExperience({ tick_id: 1, event: "战斗" }),
			makeExperience({ tick_id: 2, event: "对话" }),
			makeExperience({ tick_id: 3, event: "休息" }),
		];
		const result = buildNarrative(experiences, "1-3-15");
		expect(result).toContain("共历 3 刻");
		expect(result).toContain("交锋: 1 次");
		expect(result).toContain("交谈: 1 次");
	});

	it("uses intent_summary over event when available", () => {
		const experiences: Experience[] = [
			makeExperience({
				tick_id: 1,
				event: "对话",
				intent_summary: "与张三讨论武功",
			}),
		];
		const result = buildNarrative(experiences, "1-3-15");
		expect(result).toContain("与张三讨论武功");
	});

	it("skips rest events from highlights", () => {
		const experiences: Experience[] = [
			makeExperience({ tick_id: 1, event: "休息" }),
			makeExperience({ tick_id: 2, event: "冥想" }),
		];
		const result = buildNarrative(experiences, "1-3-15");
		expect(result).toContain("波澜不惊");
	});
});

// ---------------------------------------------------------------------------
// constructDeathNarrative
// ---------------------------------------------------------------------------

describe("constructDeathNarrative", () => {
	it("formats permanent death", () => {
		const msg: AgentDiedMessage = {
			type: "agent_died",
			agent_id: "agent-1",
			cause: "战斗",
			description: "壮烈牺牲",
			location: "长安城",
			tick_id: 42,
			died_at: 1000,
			rebirth_delay_ticks: -1,
		};
		const result = constructDeathNarrative(msg);
		expect(result).toContain("角色陨落");
		expect(result).toContain("壮烈牺牲");
		expect(result).toContain("战斗");
		expect(result).toContain("长安城");
		expect(result).toContain("永久死亡");
	});

	it("formats temporary death with rebirth", () => {
		const msg: AgentDiedMessage = {
			type: "agent_died",
			agent_id: "agent-1",
			cause: "饥饿",
			description: "倒在路上",
			location: "野外",
			tick_id: 20,
			died_at: 500,
			rebirth_delay_ticks: 10,
		};
		const result = constructDeathNarrative(msg);
		expect(result).toContain("10 刻后可重入轮回");
	});

	it("formats immediate rebirth", () => {
		const msg: AgentDiedMessage = {
			type: "agent_died",
			agent_id: "agent-1",
			cause: "意外",
			description: "不慎跌落",
			location: "悬崖",
			tick_id: 5,
			died_at: 200,
			rebirth_delay_ticks: 0,
		};
		const result = constructDeathNarrative(msg);
		expect(result).toContain("0 刻后可重入轮回");
	});
});

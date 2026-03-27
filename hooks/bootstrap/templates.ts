// hooks/bootstrap/templates.ts
// ============================================================================
// Character Templates for Quick Selection
// ============================================================================

import type { CharacterTemplate } from "./types.js";

/**
 * Predefined character templates
 * Users can select a template to quickly create a character
 */
export const CHARACTER_TEMPLATES: CharacterTemplate[] = [
	{
		id: "xia-ke",
		name: "侠客",
		description: "行侠仗义的江湖人士，以武犯禁，扶弱抑强",
		character: {
			identity: "剑客",
			personality: ["豪爽", "正直", "勇敢", "重情义"],
			values: ["侠义", "自由", "公道"],
			language_style: "豪迈直率，不拘小节",
			goals: ["行侠仗义", "寻找名师", "闯荡江湖"],
		},
	},
	{
		id: "shang-ren",
		name: "商人",
		description: "精打细算的买卖人，行走四方，通晓人情世故",
		character: {
			identity: "行商",
			personality: ["精明", "圆滑", "务实", "善于言辞"],
			values: ["财富", "信誉", "机遇"],
			language_style: "谦和有礼，善于周旋",
			goals: ["积累财富", "拓展商路", "结交权贵"],
		},
	},
	{
		id: "yi-zhe",
		name: "医者",
		description: "悬壶济世的大夫，精通医术，仁心仁术",
		character: {
			identity: "大夫",
			personality: ["仁慈", "细心", "沉稳", "好学"],
			values: ["生命", "仁爱", "知识"],
			language_style: "温和谦逊，言语谨慎",
			goals: ["救死扶伤", "寻访名医", "研究医术"],
		},
	},
	{
		id: "xia-tou",
		name: "侠盗",
		description: "劫富济贫的江湖盗贼，来去无踪，义薄云天",
		character: {
			identity: "侠盗",
			personality: ["机敏", "狡黠", "侠义", "独立"],
			values: ["自由", "公义", "技艺"],
			language_style: "诙谐幽默，话中带刺",
			goals: ["劫富济贫", "精进技艺", "逍遥江湖"],
		},
	},
	{
		id: "wen-ren",
		name: "文人",
		description: "饱读诗书的士子，心怀天下，以笔为剑",
		character: {
			identity: "书生",
			personality: ["儒雅", "执着", "理想主义", "傲骨"],
			values: ["学问", "名声", "天下"],
			language_style: "引经据典，文质彬彬",
			goals: ["金榜题名", "著书立说", "济世安民"],
		},
	},
	{
		id: "custom",
		name: "自定义",
		description: "完全自定义角色，自由发挥创意",
		character: {},
	},
];

/**
 * Get template by ID
 */
export function getTemplateById(id: string): CharacterTemplate | undefined {
	return CHARACTER_TEMPLATES.find((t) => t.id === id);
}

/**
 * Format template list for display
 */
export function formatTemplateList(): string {
	return CHARACTER_TEMPLATES
		.map((t, i) => `${i + 1}. ${t.name} - ${t.description}`)
		.join("\n");
}

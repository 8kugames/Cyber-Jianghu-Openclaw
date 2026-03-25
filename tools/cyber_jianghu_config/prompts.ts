// tools/cyber_jianghu_config/prompts.ts
// ============================================================================
// Interactive Character Configuration Prompts
// ============================================================================

import * as readline from "readline";
import type { CharacterConfig, CharacterGender, PluginConfig } from "./types.js";
import { CHARACTER_TEMPLATES, formatTemplateList } from "./templates.js";
import { ENV_VAR_MAPPING } from "./types.js";

/**
 * Create readline interface for interactive prompts
 */
function createReadlineInterface(): readline.ReadLine {
	return readline.createInterface({
		input: process.stdin,
		output: process.stdout,
	});
}

/**
 * Prompt user for input
 */
async function prompt(rl: readline.ReadLine, question: string): Promise<string> {
	return new Promise((resolve) => {
		rl.question(question, (answer) => {
			resolve(answer.trim());
		});
	});
}

/**
 * Prompt user for selection from options
 */
async function promptSelect(
	rl: readline.ReadLine,
	question: string,
	options: string[],
): Promise<number> {
	console.log(`\n${question}`);
	options.forEach((opt, i) => console.log(`  ${i + 1}. ${opt}`));

	while (true) {
		const answer = await prompt(rl, "\n请选择 [1-" + options.length + "]: ");
		const num = parseInt(answer, 10);
		if (num >= 1 && num <= options.length) {
			return num - 1;
		}
		console.log("无效选择，请重试。");
	}
}

/**
 * Parse comma-separated string to array
 */
function parseArray(value: string): string[] {
	return value
		.split(/[,，]/)
		.map((s) => s.trim())
		.filter((s) => s.length > 0);
}

/**
 * Read character configuration from environment variables
 */
export function readCharacterFromEnv(): Partial<CharacterConfig> {
	const config: Partial<CharacterConfig> = {};

	for (const [envVar, field] of Object.entries(ENV_VAR_MAPPING)) {
		const value = process.env[envVar];
		if (!value) continue;

		if (field === "age") {
			config.age = parseInt(value, 10);
		} else if (field === "personality" || field === "values" || field === "goals") {
			config[field] = parseArray(value);
		} else {
			(config as Record<string, unknown>)[field] = value;
		}
	}

	return config;
}

/**
 * Interactive character configuration wizard
 */
export async function promptCharacterInfo(
	existingConfig?: Partial<CharacterConfig>,
): Promise<CharacterConfig> {
	const rl = createReadlineInterface();

	try {
		console.log("\n========================================");
		console.log("  降生前配置 - 角色创建向导");
		console.log("========================================\n");

		// Step 1: Select template
		console.log("请选择角色模板:");
		console.log(formatTemplateList());

		const templateIndex = await promptSelect(
			rl,
			"",
			CHARACTER_TEMPLATES.map((t) => `${t.name} - ${t.description}`),
		);
		const selectedTemplate = CHARACTER_TEMPLATES[templateIndex];
		console.log(`\n已选择模板: ${selectedTemplate.name}\n`);

		// Merge template with existing config
		const baseConfig: Partial<CharacterConfig> = {
			...selectedTemplate.character,
			...existingConfig,
		};

		// Step 2: Required fields
		let name = baseConfig.name;
		if (!name) {
			name = await prompt(rl, "角色姓名 (必填): ");
			while (!name) {
				console.log("姓名不能为空！");
				name = await prompt(rl, "角色姓名 (必填): ");
			}
		} else {
			console.log(`角色姓名: ${name}`);
		}

		let age = baseConfig.age;
		if (!age) {
			const ageStr = await prompt(rl, "角色年龄 (1-100, 必填): ");
			age = parseInt(ageStr, 10);
			while (isNaN(age) || age < 1 || age > 100) {
				console.log("年龄必须是 1-100 之间的数字！");
				const ageStr = await prompt(rl, "角色年龄 (1-100, 必填): ");
				age = parseInt(ageStr, 10);
			}
		} else {
			console.log(`角色年龄: ${age}`);
		}

		let gender = baseConfig.gender;
		if (!gender) {
			const genderIndex = await promptSelect(rl, "角色性别:", ["男 (male)", "女 (female)", "其他 (other)"]);
			const genders: CharacterGender[] = ["male", "female", "other"];
			gender = genders[genderIndex];
		} else {
			console.log(`角色性别: ${gender}`);
		}

		// Step 3: Optional fields (skip if template provides them)
		const appearance = baseConfig.appearance || await prompt(rl, "\n外貌描述 (可选，回车跳过): ");
		const identity = baseConfig.identity || await prompt(rl, "身份/职业 (可选，回车跳过): ");

		let personality = baseConfig.personality;
		if (!personality || personality.length === 0) {
			const personalityStr = await prompt(rl, "性格特点 (可选，逗号分隔，回车跳过): ");
			if (personalityStr) personality = parseArray(personalityStr);
		}

		let values = baseConfig.values;
		if (!values || values.length === 0) {
			const valuesStr = await prompt(rl, "核心价值观 (可选，逗号分隔，回车跳过): ");
			if (valuesStr) values = parseArray(valuesStr);
		}

		const language_style = baseConfig.language_style || await prompt(rl, "说话风格 (可选，回车跳过): ");

		let goals = baseConfig.goals;
		if (!goals || goals.length === 0) {
			const goalsStr = await prompt(rl, "目标/愿望 (可选，逗号分隔，回车跳过): ");
			if (goalsStr) goals = parseArray(goalsStr);
		}

		const backstory = baseConfig.backstory || await prompt(rl, "背景故事 (可选，回车跳过): ");

		// Step 4: Confirmation
		console.log("\n========================================");
		console.log("  角色配置确认");
		console.log("========================================");
		console.log(`姓名: ${name}`);
		console.log(`年龄: ${age}`);
		console.log(`性别: ${gender}`);
		if (appearance) console.log(`外貌: ${appearance}`);
		if (identity) console.log(`身份: ${identity}`);
		if (personality?.length) console.log(`性格: ${personality.join(", ")}`);
		if (values?.length) console.log(`价值观: ${values.join(", ")}`);
		if (language_style) console.log(`说话风格: ${language_style}`);
		if (goals?.length) console.log(`目标: ${goals.join(", ")}`);
		if (backstory) console.log(`背景: ${backstory}`);
		console.log("========================================\n");

		const confirmIndex = await promptSelect(rl, "确认创建角色?", ["确认", "重新配置"]);
		if (confirmIndex === 1) {
			// Restart configuration
			return promptCharacterInfo(existingConfig);
		}

		const config: CharacterConfig = {
			name,
			age,
			gender,
		};

		if (appearance) config.appearance = appearance;
		if (identity) config.identity = identity;
		if (personality?.length) config.personality = personality;
		if (values?.length) config.values = values;
		if (language_style) config.language_style = language_style;
		if (goals?.length) config.goals = goals;
		if (backstory) config.backstory = backstory;

		return config;
	} finally {
		rl.close();
	}
}

/**
 * Load character configuration from plugin config or environment
 * Returns null if not configured
 */
export async function loadCharacterConfig(
	pluginConfig?: PluginConfig,
): Promise<CharacterConfig | null> {
	// 1. Check plugin config first
	if (pluginConfig?.character?.name && pluginConfig.character.age && pluginConfig.character.gender) {
		console.log("[config] Using character config from plugin config");
		return pluginConfig.character;
	}

	// 2. Check environment variables
	const envConfig = readCharacterFromEnv();
	if (envConfig.name && envConfig.age && envConfig.gender) {
		console.log("[config] Using character config from environment variables");
		return envConfig as CharacterConfig;
	}

	// 3. Merge partial configs if available
	const mergedConfig: Partial<CharacterConfig> = {
		...pluginConfig?.character,
		...envConfig,
	};

	if (mergedConfig.name && mergedConfig.age && mergedConfig.gender) {
		console.log("[config] Using merged character config");
		return mergedConfig as CharacterConfig;
	}

	return null;
}

/**
 * Check if running in headless mode
 */
export function isHeadlessMode(pluginConfig?: PluginConfig): boolean {
	// Explicit headless setting
	if (pluginConfig?.headless === true) return true;

	// No TTY available (Docker, CI, etc.)
	if (!process.stdin.isTTY) return true;

	// Environment variable override
	if (process.env.HEADLESS === "true") return true;

	return false;
}

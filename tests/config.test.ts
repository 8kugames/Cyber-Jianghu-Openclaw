// tests/config.test.ts
// ============================================================================
// Configuration Module Tests
// ============================================================================

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import {
	validateCharacterConfig,
	CHARACTER_TEMPLATES,
	getTemplateById,
	formatTemplateList,
	readCharacterFromEnv,
} from "../tools/cyber_jianghu_config/index.js";
import type { CharacterConfig } from "../tools/cyber_jianghu_config/types.js";

describe("Configuration Module", () => {
	describe("validateCharacterConfig", () => {
		it("should return errors for missing required fields", () => {
			const config = {} as CharacterConfig;
			const errors = validateCharacterConfig(config);
			expect(errors.length).toBeGreaterThan(0);
			expect(errors).toContain("Name is required");
		});

		it("should return error for invalid age", () => {
			const config: CharacterConfig = {
				name: "Test",
				age: 0,
				gender: "male",
			};
			const errors = validateCharacterConfig(config);
			expect(errors).toContain("Age must be between 1 and 100");
		});

		it("should return error for invalid age (too high)", () => {
			const config: CharacterConfig = {
				name: "Test",
				age: 101,
				gender: "male",
			};
			const errors = validateCharacterConfig(config);
			expect(errors).toContain("Age must be between 1 and 100");
		});

		it("should return error for invalid gender", () => {
			const config = {
				name: "Test",
				age: 25,
				gender: "invalid",
			} as unknown as CharacterConfig;
			const errors = validateCharacterConfig(config);
			expect(errors).toContain("Gender must be 'male', 'female', or 'other'");
		});

		it("should return no errors for valid config", () => {
			const config: CharacterConfig = {
				name: "张三",
				age: 25,
				gender: "male",
			};
			const errors = validateCharacterConfig(config);
			expect(errors.length).toBe(0);
		});

		it("should accept all valid genders", () => {
			const genders: Array<"male" | "female" | "other"> = ["male", "female", "other"];
			for (const gender of genders) {
				const config: CharacterConfig = {
					name: "Test",
					age: 25,
					gender,
				};
				const errors = validateCharacterConfig(config);
				expect(errors).not.toContain("Gender must be 'male', 'female', or 'other'");
			}
		});
	});

	describe("Character Templates", () => {
		it("should have at least 4 templates", () => {
			expect(CHARACTER_TEMPLATES.length).toBeGreaterThanOrEqual(4);
		});

		it("should include xia-ke template", () => {
			const template = getTemplateById("xia-ke");
			expect(template).toBeDefined();
			expect(template?.name).toBe("侠客");
		});

		it("should include shang-ren template", () => {
			const template = getTemplateById("shang-ren");
			expect(template).toBeDefined();
			expect(template?.name).toBe("商人");
		});

		it("should include yi-zhe template", () => {
			const template = getTemplateById("yi-zhe");
			expect(template).toBeDefined();
			expect(template?.name).toBe("医者");
		});

		it("should include custom template", () => {
			const template = getTemplateById("custom");
			expect(template).toBeDefined();
			expect(template?.name).toBe("自定义");
		});

		it("should return undefined for non-existent template", () => {
			const template = getTemplateById("non-existent");
			expect(template).toBeUndefined();
		});

		it("formatTemplateList should return formatted string", () => {
			const list = formatTemplateList();
			expect(list).toContain("侠客");
			expect(list).toContain("商人");
			expect(list).toContain("医者");
		});

		it("all templates should have required fields", () => {
			for (const template of CHARACTER_TEMPLATES) {
				expect(template.id).toBeDefined();
				expect(template.name).toBeDefined();
				expect(template.description).toBeDefined();
				expect(template.character).toBeDefined();
			}
		});
	});

	describe("readCharacterFromEnv", () => {
		const originalEnv = { ...process.env };

		beforeEach(() => {
			// Clear relevant env vars
			delete process.env.CHARACTER_NAME;
			delete process.env.CHARACTER_AGE;
			delete process.env.CHARACTER_GENDER;
			delete process.env.CHARACTER_IDENTITY;
		});

		afterEach(() => {
			// Restore original env
			process.env = originalEnv;
		});

		it("should return empty object when no env vars set", () => {
			const config = readCharacterFromEnv();
			expect(Object.keys(config).length).toBe(0);
		});

		it("should read name from env", () => {
			process.env.CHARACTER_NAME = "张三";
			const config = readCharacterFromEnv();
			expect(config.name).toBe("张三");
		});

		it("should parse age as number", () => {
			process.env.CHARACTER_AGE = "25";
			const config = readCharacterFromEnv();
			expect(config.age).toBe(25);
		});

		it("should read gender from env", () => {
			process.env.CHARACTER_GENDER = "male";
			const config = readCharacterFromEnv();
			expect(config.gender).toBe("male");
		});

		it("should parse comma-separated arrays", () => {
			process.env.CHARACTER_PERSONALITY = "豪爽,正直,勇敢";
			const config = readCharacterFromEnv();
			expect(config.personality).toEqual(["豪爽", "正直", "勇敢"]);
		});

		it("should handle Chinese commas", () => {
			process.env.CHARACTER_VALUES = "侠义，自由，公道";
			const config = readCharacterFromEnv();
			expect(config.values).toEqual(["侠义", "自由", "公道"]);
		});
	});
});

// tools/cyber_jianghu_config/index.ts
// ============================================================================
// Character Configuration Module Entry Point
// ============================================================================

import type { CharacterConfig, PluginConfig } from "./types.js";
import { promptCharacterInfo, loadCharacterConfig, isHeadlessMode } from "./prompts.js";

// Re-export types and functions
export * from "./types.js";
export * from "./prompts.js";
export * from "./templates.js";

/**
 * Bootstrap character configuration
 * Called during agent bootstrap to ensure character is configured
 *
 * @param pluginConfig - Plugin configuration from OpenClaw
 * @returns CharacterConfig if configured, null otherwise
 */
export async function bootstrapCharacterConfig(
	pluginConfig?: PluginConfig,
): Promise<CharacterConfig | null> {
	console.log("[config] Bootstrap character configuration...");

	// Try to load existing config
	const existingConfig = await loadCharacterConfig(pluginConfig);
	if (existingConfig) {
		console.log(`[config] Character already configured: ${existingConfig.name}`);
		return existingConfig;
	}

	// Check if we should prompt
	if (isHeadlessMode(pluginConfig)) {
		console.warn("[config] Headless mode detected but no character config available");
		console.warn("[config] Please set CHARACTER_NAME, CHARACTER_AGE, CHARACTER_GENDER environment variables");
		console.warn("[config] Or provide character config in plugin settings");
		throw new Error("Headless mode requires character configuration");
	}

	// Interactive configuration
	console.log("[config] No character configured, starting interactive wizard...");
	const newConfig = await promptCharacterInfo(pluginConfig?.character);

	console.log(`[config] Character configured: ${newConfig.name}`);
	return newConfig;
}

/**
 * Validate character configuration
 */
export function validateCharacterConfig(config: CharacterConfig): string[] {
	const errors: string[] = [];

	if (!config.name || config.name.trim().length === 0) {
		errors.push("Name is required");
	}

	if (!config.age || config.age < 1 || config.age > 100) {
		errors.push("Age must be between 1 and 100");
	}

	if (!config.gender || !["male", "female", "other"].includes(config.gender)) {
		errors.push("Gender must be 'male', 'female', or 'other'");
	}

	return errors;
}

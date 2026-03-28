// hooks/bootstrap/handler.ts
// ============================================================================
// Bootstrap Handler for Cyber-Jianghu Agent
// ============================================================================
//
// This handler runs when the OpenClaw gateway starts or when agent bootstrap occurs.
// It ensures the character is properly configured before the agent starts playing.
//
// Flow:
// 1. Check if character is already registered with Agent
// 2. If not, load character config from plugin config or environment
// 3. If still not configured, prompt user interactively (or fail in headless mode)
// 4. Register character with Agent HTTP API

import { promises as fs } from "fs";
import type { CharacterConfig, HookEvent, PluginConfig } from "./types.js";
import {
	loadCharacterConfig,
	validateCharacterConfig,
	isHeadlessMode,
} from "./prompts.js";

// Re-export loadCharacterConfig for external use
export { loadCharacterConfig as bootstrapCharacterConfig };

/**
 * Bootstrap character configuration
 * Called during agent bootstrap to ensure character is configured
 *
 * @param pluginConfig - Plugin configuration from OpenClaw
 * @returns CharacterConfig if configured, null otherwise
 */
async function bootstrapCharacterConfigInternal(
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

	// Interactive configuration - dynamic import to avoid circular dependency
	const { promptCharacterInfo } = await import("./prompts.js");
	console.log("[config] No character configured, starting interactive wizard...");
	const newConfig = await promptCharacterInfo(pluginConfig?.character);

	console.log(`[config] Character configured: ${newConfig.name}`);
	return newConfig;
}

/**
 * Check if character is already registered with Agent
 */
async function checkCharacterRegistered(): Promise<boolean> {
	try {
		const { getHttpClient } = await import("../../tools/act/http-client.js");
		const client = await getHttpClient();
		const character = await client.get<{ name: string }>("/api/v1/character");
		if (character?.name) {
			console.log(`[bootstrap] Character already registered: ${character.name}`);
			return true;
		}
	} catch {
		// Character not registered or Agent not available
		console.log("[bootstrap] Character not yet registered or Agent unavailable");
	}
	return false;
}

/**
 * Register character with Agent
 */
async function registerCharacter(config: CharacterConfig): Promise<void> {
	const { getHttpClient } = await import("../../tools/act/http-client.js");
	const client = await getHttpClient();

	// Validate config first
	const errors = validateCharacterConfig(config);
	if (errors.length > 0) {
		throw new Error(`Invalid character config: ${errors.join(", ")}`);
	}

	// Register via Agent HTTP API
	await client.post("/api/v1/character/register", config);
	console.log(`[bootstrap] Character registered: ${config.name}`);
}

/**
 * Save character config to file for persistence
 */
async function saveCharacterConfig(
	workspaceDir: string,
	config: CharacterConfig,
): Promise<void> {
	const configPath = `${workspaceDir}/character.json5`;
	const content = JSON.stringify(config, null, 2);
	await fs.writeFile(configPath, content, "utf-8");
	console.log(`[bootstrap] Character config saved to ${configPath}`);
}

/**
 * Main bootstrap handler
 */
export default async function handler(event: string, context: any): Promise<void> {
	console.log("[bootstrap] Handler invoked", JSON.stringify({ event }));

	// Parse event if it's a string, otherwise use as-is
	let hookEvent: HookEvent;
	if (typeof event === "string") {
		// Handle string event names like "agent:bootstrap" or "gateway:startup"
		const [type, action] = event.split(":");
		hookEvent = {
			type: type as "agent" | "gateway",
			action: action as "bootstrap" | "startup" | "cron",
			context: {
				workspaceDir: context?.workspaceDir || process.cwd(),
			},
			timestamp: Date.now(),
		};
	} else {
		hookEvent = event as HookEvent;
	}

	const workspaceDir = hookEvent.context?.workspaceDir || context?.workspaceDir || process.cwd();
	console.log("[bootstrap] workspaceDir:", workspaceDir);

	try {
		// Step 1: Check if already registered
		const isRegistered = await checkCharacterRegistered();
		if (isRegistered) {
			console.log("[bootstrap] Character already registered, skipping configuration");
			return;
		}

		// Step 2: Load or prompt character config
		console.log("[bootstrap] Character not registered, loading configuration...");
		const pluginConfig: PluginConfig | undefined = context?.config || context?.pluginConfig;
		const characterConfig = await bootstrapCharacterConfigInternal(pluginConfig);

		if (!characterConfig) {
			throw new Error("Failed to get character configuration");
		}

		// Step 3: Register with Agent
		console.log(`[bootstrap] Registering character: ${characterConfig.name}`);
		await registerCharacter(characterConfig);

		// Step 4: Save config for persistence
		await saveCharacterConfig(workspaceDir, characterConfig);

		console.log("[bootstrap] Character setup complete!");
	} catch (e) {
		console.error("[bootstrap] Failed to configure character:", e);
		throw e;
	}
}

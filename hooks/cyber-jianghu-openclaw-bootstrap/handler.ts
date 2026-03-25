// hooks/cyber-jianghu-openclaw-bootstrap/handler.ts
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
import {
	bootstrapCharacterConfig,
	validateCharacterConfig,
	type CharacterConfig,
	type PluginConfig,
} from "../../tools/cyber_jianghu_config/index.js";

type HookEvent = {
	type: "agent";
	action: "bootstrap" | "cron";
	context: {
		workspaceDir: string;
		[key: string]: unknown;
	};
	timestamp: number;
};

type HookContext = {
	config?: PluginConfig;
	[key: string]: unknown;
};

/**
 * Check if character is already registered with Agent
 */
async function checkCharacterRegistered(): Promise<boolean> {
	try {
		const { getHttpClientAsync } = await import("../../tools/cyber_jianghu_act/http-client.js");
		const client = await getHttpClientAsync(0);
		const character = await client.get<{ name: string }>("/api/v1/character");
		if (character?.name) {
			console.log(`[bootstrap] Character already registered: ${character.name}`);
			return true;
		}
	} catch (e) {
		// Character not registered or Agent not available
		console.log("[bootstrap] Character not yet registered or Agent unavailable");
	}
	return false;
}

/**
 * Register character with Agent
 */
async function registerCharacter(config: CharacterConfig): Promise<void> {
	const { getHttpClientAsync } = await import("../../tools/cyber_jianghu_act/http-client.js");
	const client = await getHttpClientAsync(0);

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
const handler = async (event: HookEvent, context?: HookContext): Promise<void> => {
	console.log("[bootstrap] Handler invoked", JSON.stringify({ type: event.type, action: event.action }));
	console.log("[bootstrap] workspaceDir:", event.context.workspaceDir);

	try {
		// Step 1: Check if already registered
		const isRegistered = await checkCharacterRegistered();
		if (isRegistered) {
			console.log("[bootstrap] Character already registered, skipping configuration");
			return;
		}

		// Step 2: Load or prompt character config
		console.log("[bootstrap] Character not registered, loading configuration...");
		const pluginConfig = context?.config;
		const characterConfig = await bootstrapCharacterConfig(pluginConfig);

		if (!characterConfig) {
			throw new Error("Failed to get character configuration");
		}

		// Step 3: Register with Agent
		console.log(`[bootstrap] Registering character: ${characterConfig.name}`);
		await registerCharacter(characterConfig);

		// Step 4: Save config for persistence
		await saveCharacterConfig(event.context.workspaceDir, characterConfig);

		console.log("[bootstrap] Character setup complete!");
	} catch (e) {
		console.error("[bootstrap] Failed to configure character:", e);
		throw e;
	}
};

export default handler;

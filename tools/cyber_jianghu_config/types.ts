// tools/cyber_jianghu_config/types.ts
// ============================================================================
// Character Configuration Types
// ============================================================================

/**
 * Character gender options
 */
export type CharacterGender = "male" | "female" | "other";

/**
 * Character configuration for registration
 */
export interface CharacterConfig {
	/** Character name (required) */
	name: string;
	/** Character age 1-100 (required) */
	age: number;
	/** Character gender (required) */
	gender: CharacterGender;
	/** Physical appearance description */
	appearance?: string;
	/** Identity/role in the world */
	identity?: string;
	/** Personality traits */
	personality?: string[];
	/** Core values */
	values?: string[];
	/** Speaking style */
	language_style?: string;
	/** Short/long term goals */
	goals?: string[];
	/** Background story */
	backstory?: string;
}

/**
 * Report configuration
 */
export interface ReportConfig {
	/** Report generation frequency */
	frequency?: "30m" | "1h" | "2h";
	/** Days to keep historical reports */
	retention_days?: number;
	/** Report output format */
	format?: "narrative" | "structured" | "summary";
	/** Webhook URL for push notifications */
	webhook_url?: string;
}

/**
 * Plugin configuration schema
 */
export interface PluginConfig {
	/** Port for agent HTTP API (0 = auto-discover) */
	localApiPort?: number;
	/** Host for agent HTTP API */
	localApiHost?: string;
	/** Game server URL */
	gameServerUrl?: string;
	/** Run in headless mode */
	headless?: boolean;
	/** Character configuration */
	character?: CharacterConfig;
	/** Report configuration */
	report?: ReportConfig;
}

/**
 * Character template for quick selection
 */
export interface CharacterTemplate {
	/** Template identifier */
	id: string;
	/** Template display name */
	name: string;
	/** Template description */
	description: string;
	/** Pre-filled character config */
	character: Partial<CharacterConfig>;
}

/**
 * Environment variable mapping for character config
 * Maps CHARACTER_* env vars to CharacterConfig fields
 */
export const ENV_VAR_MAPPING: Record<string, keyof CharacterConfig> = {
	CHARACTER_NAME: "name",
	CHARACTER_AGE: "age",
	CHARACTER_GENDER: "gender",
	CHARACTER_APPEARANCE: "appearance",
	CHARACTER_IDENTITY: "identity",
	CHARACTER_PERSONALITY: "personality",
	CHARACTER_VALUES: "values",
	CHARACTER_LANGUAGE_STYLE: "language_style",
	CHARACTER_GOALS: "goals",
	CHARACTER_BACKSTORY: "backstory",
};

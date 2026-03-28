// tools/act/index.ts
// ============================================================================
// Act Tool - Core tool the LLM must call every tick
// ============================================================================
//
// This is the primary game action tool. On each tick the LLM decides what
// the agent should do and calls this tool. The execute function only records
// the intent; actual validation and submission happen in the agent_end hook
// (see register.ts).
//
// The tool exports mutable module-level state so the agent_end hook in
// register.ts can read the recorded action after the LLM turn completes.

import { Type } from "@sinclair/typebox";
import type { GameActionParams, TickState } from "./types.js";

// ---------------------------------------------------------------------------
// Module-level mutable state
// ---------------------------------------------------------------------------

/** The last action recorded by the act tool (reset each tick by agent_end hook). */
export let lastGameActionCall: GameActionParams | null = null;

/** Shared tick state set by the WebSocket tick handler. */
export let sharedTickState: TickState | null = null;

// ---------------------------------------------------------------------------
// Reset helper
// ---------------------------------------------------------------------------

/** Reset the recorded action call (called by agent_end hook after submission). */
export function resetActionCall(): void {
	lastGameActionCall = null;
}

// ---------------------------------------------------------------------------
// Tool definition
// ---------------------------------------------------------------------------

const actTool = {
	name: "cyber_jianghu_act",
	description:
		"Submit a game action to the Cyber-Jianghu world. You MUST call this tool every tick. Choose the action from available_actions in CONTEXT.md.",
	parameters: Type.Object({
		action: Type.String({
			description: "Action type from available_actions in CONTEXT.md",
		}),
		target: Type.Optional(
			Type.String({
				description: "Entity/item/location ID",
			}),
		),
		data: Type.Optional(
			Type.String({
				description: "Extra data (speech content, item ID, etc.)",
			}),
		),
		reasoning: Type.Optional(
			Type.String({
				description: "Your thinking process for this action",
			}),
		),
	}),
	execute: async (
		_id: string,
		params: Record<string, unknown>,
	): Promise<{ content: Array<{ type: "text"; text: string }> }> => {
		lastGameActionCall = params as unknown as GameActionParams;

		console.log(
			`[cyber_jianghu_act] Intent recorded: ${lastGameActionCall.action} ${lastGameActionCall.target || ""} ${lastGameActionCall.data || ""} (${lastGameActionCall.reasoning || ""})`,
		);

		return {
			content: [
				{
					type: "text",
					text: `Action recorded: ${params.action}. Will be submitted at end of turn.`,
				},
			],
		};
	},
};

export { actTool };

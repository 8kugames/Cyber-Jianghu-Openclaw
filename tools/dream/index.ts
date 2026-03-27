// tools/dream/index.ts
// ============================================================================
// Dream Tool - User IM intervention for injecting thoughts into character
// ============================================================================
//
// Allows a user (via IM / messaging) to inject a "dream" -- a thought that
// appears in the character's consciousness and influences their behaviour
// for a number of ticks.
//
// Endpoint: POST /api/v1/character/dream  { thought, duration }

import { Type } from "@sinclair/typebox";
import { getHttpClient } from "../act/http-client.js";

// ---------------------------------------------------------------------------
// Tool definition
// ---------------------------------------------------------------------------

const dreamTool = {
	name: "cyber_jianghu_dream",
	description:
		"Inject a dream (thought) into the character's consciousness. The thought will influence the character's behaviour for a number of ticks. Used for user IM intervention.",
	parameters: Type.Object({
		content: Type.String({
			description: "Dream content to inject into character consciousness",
		}),
		duration: Type.Optional(
			Type.Number({
				description: "Duration in ticks (max 5, default 5)",
				default: 5,
			}),
		),
	}),
	execute: async (
		_id: string,
		params: Record<string, unknown>,
	): Promise<{ content: Array<{ type: "text"; text: string }>; isError?: boolean }> => {
		const duration = Math.min((params.duration as number) ?? 5, 5);
		const content = params.content as string;

		try {
			const httpClient = await getHttpClient();
			await httpClient.post("/api/v1/character/dream", {
				thought: content,
				duration,
			});

			return {
				content: [
					{
						type: "text",
						text: `Dream injected successfully. The thought "${content}" will influence the character for ${duration} tick(s).`,
					},
				],
			};
		} catch (error) {
			const errorMessage = error instanceof Error ? error.message : String(error);

			// Surface rate-limit messages clearly
			if (errorMessage.includes("429") || errorMessage.includes("今日已使用过托梦")) {
				return {
					content: [
						{
							type: "text",
							text: `Dream injection failed: today's dream quota has already been used. (${errorMessage})`,
						},
					],
					isError: true,
				};
			}

			return {
				content: [
					{
						type: "text",
						text: `Dream injection failed: ${errorMessage}`,
					},
				],
				isError: true,
			};
		}
	},
};

export { dreamTool };

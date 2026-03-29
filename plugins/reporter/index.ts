// plugins/reporter/index.ts
// ============================================================================
// Reporter — day boundary detection + report scheduling
// ============================================================================
//
// Receives every tick message from the WS handler (via register.ts).
// Detects game-day boundaries and generates daily narrative reports.
// Also handles agent death notifications.
//
// Design:
// - Pure state machine — no dependency on OpenClaw PluginAPI.
// - Exposes getPendingReport() / clearPendingReport() for register.ts
//   to poll and deliver reports via cron or other mechanism.

import type { TickMessage, AgentDiedMessage } from "../../types.js";
import { getHttpClient } from "../../http-client.js";
import {
	matchesGameDay,
	buildNarrative,
	constructDeathNarrative,
	type Experience,
} from "./report-builder.js";

// ---------------------------------------------------------------------------
// Pending report (consumed by register.ts)
// ---------------------------------------------------------------------------

export interface PendingReport {
	content: string;
	type: "daily" | "death";
	gameDay?: string;
}

// ---------------------------------------------------------------------------
// Reporter class
// ---------------------------------------------------------------------------

export class Reporter {
	private lastGameDay: string = "";
	private _pendingReport: PendingReport | null = null;

	// -----------------------------------------------------------------------
	// Public: tick handler
	// -----------------------------------------------------------------------

	/**
	 * Called on every tick message from the WS handler.
	 * Detects day boundaries and generates a report for the PREVIOUS day.
	 */
	async onTick(msg: TickMessage): Promise<void> {
		const wt = msg.state?.world_time;
		if (!wt) return;

		const gameDay = `${wt.year}-${wt.month}-${wt.day}`;

		if (gameDay !== this.lastGameDay && this.lastGameDay) {
			await this.scheduleDailyReport(this.lastGameDay);
		}

		this.lastGameDay = gameDay;
	}

	// -----------------------------------------------------------------------
	// Public: death handler
	// -----------------------------------------------------------------------

	/**
	 * Called when the agent dies. Generates a death narrative immediately.
	 */
	async onAgentDied(msg: AgentDiedMessage): Promise<void> {
		const narrative = constructDeathNarrative(msg);
		this._pendingReport = {
			content: narrative,
			type: "death",
		};
		console.log(`[reporter] Agent died: ${msg.cause} at ${msg.location}`);
	}

	// -----------------------------------------------------------------------
	// Public: report polling (for register.ts)
	// -----------------------------------------------------------------------

	/** Get the pending report, if any. Returns null if nothing pending. */
	getPendingReport(): PendingReport | null {
		return this._pendingReport;
	}

	/** Clear the pending report after it has been delivered. */
	clearPendingReport(): void {
		this._pendingReport = null;
	}

	// -----------------------------------------------------------------------
	// Public: reset (useful for testing or reconnect)
	// -----------------------------------------------------------------------

	/** Reset all internal state. */
	reset(): void {
		this.lastGameDay = "";
		this._pendingReport = null;
	}

	// -----------------------------------------------------------------------
	// Private: daily report generation
	// -----------------------------------------------------------------------

	/**
	 * Fetch experiences for the given game day and build a narrative report.
	 * Stores the result in _pendingReport for register.ts to deliver.
	 */
	private async scheduleDailyReport(gameDay: string): Promise<void> {
		try {
			const httpClient = await getHttpClient();
			const experiences = await httpClient.get<Experience[]>(
				"/api/v1/character/experiences?limit=48",
			);

			const dayExperiences = experiences.filter((e) =>
				matchesGameDay(e.world_time, gameDay),
			);

			const reportContent = buildNarrative(dayExperiences, gameDay);

			this._pendingReport = {
				content: reportContent,
				type: "daily",
				gameDay,
			};

			console.log(
				`[reporter] Daily report generated for ${gameDay} (${dayExperiences.length} experiences)`,
			);
		} catch (error) {
			const msg = error instanceof Error ? error.message : String(error);
			console.error(`[reporter] Failed to generate daily report for ${gameDay}: ${msg}`);
		}
	}
}

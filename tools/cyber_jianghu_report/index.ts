// tools/cyber_jianghu_report/index.ts
// ============================================================================
// Report Module Entry Point
// ============================================================================
//
// This module provides hourly report generation for the Cyber-Jianghu agent.
// It aggregates tick events into narrative summaries and pushes them via webhook.

import type { TickEvent, Report, ReportConfig, TickEventType } from "./types.js";
import { DEFAULT_REPORT_CONFIG } from "./types.js";
import { EventQueue, getEventQueue, resetEventQueue } from "./event_queue.js";
import {
	generateHourlyReport,
	scheduleReportGeneration,
	saveReport,
	getReports,
	getLatestReport,
} from "./aggregator.js";
import { pushReport, pushCriticalEvent } from "./webhook.js";

// Re-export types and functions
export * from "./types.js";
export * from "./event_queue.js";
export * from "./aggregator.js";
export * from "./webhook.js";

/**
 * Report manager - coordinates event collection, aggregation, and push
 */
export class ReportManager {
	private config: ReportConfig;
	private queue: EventQueue;
	private scheduler: ReturnType<typeof setInterval> | null = null;
	private agentId: string;

	constructor(agentId: string, config: Partial<ReportConfig> = {}) {
		this.agentId = agentId;
		this.config = { ...DEFAULT_REPORT_CONFIG, ...config };
		this.queue = getEventQueue();
	}

	/**
	 * Start the report manager
	 */
	start(): void {
		if (this.scheduler) {
			console.log("[report-manager] Already running");
			return;
		}

		console.log(`[report-manager] Starting for agent ${this.agentId}`);

		this.scheduler = scheduleReportGeneration(
			this.agentId,
			this.config,
			async (report) => {
				// Save report
				saveReport(report);

				// Push via webhook if configured
				if (this.config.webhook_url) {
					await pushReport(report, this.config);
				}
			},
		);
	}

	/**
	 * Stop the report manager
	 */
	stop(): void {
		if (this.scheduler) {
			clearInterval(this.scheduler);
			this.scheduler = null;
			console.log("[report-manager] Stopped");
		}
	}

	/**
	 * Record a tick event
	 */
	recordEvent(event: Omit<TickEvent, "id" | "created_at">): boolean {
		const fullEvent: TickEvent = {
			...event,
			id: `${event.tick_id}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
			created_at: new Date(),
		};

		return this.queue.addEvent(fullEvent);
	}

	/**
	 * Record a tick event from tick data
	 */
	recordTickEvent(
		tickId: number,
		actionType: string,
		description?: string,
		metadata?: Record<string, unknown>,
	): boolean {
		const eventType: TickEventType = this.mapActionToEventType(actionType);

		return this.recordEvent({
			tick_id: tickId,
			agent_id: this.agentId,
			event_type: eventType,
			description,
			metadata: {
				action_type: actionType,
				...metadata,
			},
		});
	}

	/**
	 * Generate a report immediately
	 */
	async generateNow(): Promise<Report | null> {
		const report = await generateHourlyReport(this.agentId, this.config);
		if (report) {
			saveReport(report);
			if (this.config.webhook_url) {
				await pushReport(report, this.config);
			}
		}
		return report;
	}

	/**
	 * Get recent reports
	 */
	getRecentReports(limit: number = 10): Report[] {
		return getReports(this.agentId, limit);
	}

	/**
	 * Get the latest report
	 */
	getLatestReport(): Report | undefined {
		return getLatestReport(this.agentId);
	}

	/**
	 * Push a critical event immediately
	 */
	async pushCritical(
		eventType: string,
		data: Record<string, unknown>,
	): Promise<boolean> {
		if (!this.config.webhook_url || !this.config.realtime_critical) {
			return false;
		}

		const result = await pushCriticalEvent(
			this.agentId,
			eventType,
			data,
			this.config.webhook_url,
		);

		return result.success;
	}

	/**
	 * Get queue statistics
	 */
	getStats(): { total: number; unreported: number; oldest?: Date } {
		return this.queue.getStats();
	}

	/**
	 * Map action type to event type
	 */
	private mapActionToEventType(actionType: string): TickEventType {
		const mapping: Record<string, TickEventType> = {
			move: "location_change",
			attack: "combat",
			defend: "combat",
			trade: "trade",
			buy: "trade",
			sell: "trade",
			talk: "dialogue",
			say: "dialogue",
			explore: "discovery",
			rest: "action",
		};

		return mapping[actionType] || "action";
	}
}

// Global report manager instance
let globalReportManager: ReportManager | null = null;

/**
 * Initialize global report manager
 */
export function initReportManager(
	agentId: string,
	config?: Partial<ReportConfig>,
): ReportManager {
	if (globalReportManager) {
		globalReportManager.stop();
	}
	globalReportManager = new ReportManager(agentId, config);
	return globalReportManager;
}

/**
 * Get global report manager
 */
export function getReportManager(): ReportManager | null {
	return globalReportManager;
}

/**
 * Stop and cleanup global report manager
 */
export function cleanupReportManager(): void {
	if (globalReportManager) {
		globalReportManager.stop();
		globalReportManager = null;
	}
	resetEventQueue();
}

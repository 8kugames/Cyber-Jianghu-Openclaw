// tools/cyber_jianghu_report/types.ts
// ============================================================================
// Report System Types
// ============================================================================

/**
 * Tick event types for reporting
 */
export type TickEventType =
	| "action"
	| "attribute_change"
	| "location_change"
	| "interaction"
	| "combat"
	| "trade"
	| "dialogue"
	| "death"
	| "birth"
	| "discovery";

/**
 * Tick event recorded for reporting
 */
export interface TickEvent {
	/** Unique event ID */
	id: string;
	/** Tick ID when event occurred */
	tick_id: number;
	/** Agent ID */
	agent_id: string;
	/** Event type */
	event_type: TickEventType;
	/** Human-readable description */
	description?: string;
	/** Additional metadata */
	metadata?: Record<string, unknown>;
	/** When the event was created */
	created_at: Date;
	/** When the event was included in a report (null = not yet reported) */
	reported_at?: Date;
}

/**
 * Hourly report
 */
export interface Report {
	/** Report ID (e.g., rpt-20260325-1400) */
	id: string;
	/** Agent ID */
	agent_id: string;
	/** Report period start */
	period_start: Date;
	/** Report period end */
	period_end: Date;
	/** Number of events in this report */
	event_count: number;
	/** Narrative summary (LLM-generated) */
	summary?: string;
	/** Webhook status */
	webhook_status: "pending" | "sent" | "failed" | "skipped";
	/** When the report was created */
	created_at: Date;
}

/**
 * Event filter configuration
 */
export interface EventFilter {
	/** Action types to exclude from reports */
	exclude_actions: string[];
	/** Minimum attribute change thresholds */
	attribute_threshold: {
		health: number;
		stamina: number;
		money: number;
	};
	/** Event types to always include */
	include_events: TickEventType[];
}

/**
 * Default event filter
 */
export const DEFAULT_EVENT_FILTER: EventFilter = {
	exclude_actions: ["idle"],
	attribute_threshold: {
		health: 10,
		stamina: 5,
		money: 100,
	},
	include_events: ["combat", "trade", "dialogue", "death", "birth", "discovery"],
};

/**
 * Report configuration
 */
export interface ReportConfig {
	/** Report generation frequency */
	frequency: "30m" | "1h" | "2h";
	/** Days to keep historical reports */
	retention_days: number;
	/** Report output format */
	format: "narrative" | "structured" | "summary";
	/** Webhook URL for push notifications */
	webhook_url?: string;
	/** Max retries for webhook */
	max_retries: number;
	/** Enable real-time push for critical events */
	realtime_critical: boolean;
}

/**
 * Default report configuration
 */
export const DEFAULT_REPORT_CONFIG: ReportConfig = {
	frequency: "1h",
	retention_days: 30,
	format: "narrative",
	max_retries: 3,
	realtime_critical: true,
};

/**
 * Webhook payload for report push
 */
export interface WebhookPayload {
	/** Report ID */
	report_id: string;
	/** Agent ID */
	agent_id: string;
	/** Period start (ISO string) */
	period_start: string;
	/** Period end (ISO string) */
	period_end: string;
	/** Event count */
	event_count: number;
	/** Narrative summary */
	summary?: string;
	/** Timestamp */
	timestamp: string;
}

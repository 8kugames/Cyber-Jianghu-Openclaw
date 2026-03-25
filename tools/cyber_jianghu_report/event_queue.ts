// tools/cyber_jianghu_report/event_queue.ts
// ============================================================================
// Event Queue with Filtering
// ============================================================================
//
// Manages tick events in memory with optional filtering for reporting.
// Events are filtered based on action type and attribute change thresholds.

import type { TickEvent, EventFilter } from "./types.js";

/**
 * In-memory event queue for tick events
 */
export class EventQueue {
	private events: TickEvent[] = [];
	private filter: EventFilter;
	private maxEvents: number;

	constructor(
		filter: EventFilter = {
			exclude_actions: ["idle"],
			attribute_threshold: { health: 10, stamina: 5, money: 100 },
			include_events: ["combat", "trade", "dialogue", "death", "birth", "discovery"],
		},
		maxEvents: number = 10000,
	) {
		this.filter = filter;
		this.maxEvents = maxEvents;
	}

	/**
	 * Add a tick event to the queue
	 * Returns true if the event was added, false if filtered out
	 */
	addEvent(event: TickEvent): boolean {
		// Apply filter
		if (!this.shouldInclude(event)) {
			return false;
		}

		// Add to queue
		this.events.push(event);

		// Trim if over limit
		if (this.events.length > this.maxEvents) {
			this.events = this.events.slice(-this.maxEvents);
		}

		return true;
	}

	/**
	 * Get all unreported events for an agent
	 */
	getUnreportedEvents(agentId: string): TickEvent[] {
		return this.events.filter(
			(e) => e.agent_id === agentId && !e.reported_at,
		);
	}

	/**
	 * Get all events for a time range
	 */
	getEventsInRange(agentId: string, start: Date, end: Date): TickEvent[] {
		return this.events.filter(
			(e) =>
				e.agent_id === agentId &&
				e.created_at >= start &&
				e.created_at <= end,
		);
	}

	/**
	 * Mark events as reported
	 */
	markAsReported(eventIds: string[]): void {
		const reportedAt = new Date();
		for (const event of this.events) {
			if (eventIds.includes(event.id)) {
				event.reported_at = reportedAt;
			}
		}
	}

	/**
	 * Clear old events (cleanup)
	 */
	clearOlderThan(date: Date): number {
		const before = this.events.length;
		this.events = this.events.filter((e) => e.created_at >= date);
		return before - this.events.length;
	}

	/**
	 * Get queue statistics
	 */
	getStats(): { total: number; unreported: number; oldest?: Date } {
		const unreported = this.events.filter((e) => !e.reported_at).length;
		const oldest = this.events[0]?.created_at;
		return {
			total: this.events.length,
			unreported,
			oldest,
		};
	}

	/**
	 * Check if event should be included based on filter
	 */
	private shouldInclude(event: TickEvent): boolean {
		// Always include critical events
		if (this.filter.include_events.includes(event.event_type)) {
			return true;
		}

		// Check metadata for action type filtering
		const actionType = event.metadata?.action_type as string | undefined;
		if (actionType && this.filter.exclude_actions.includes(actionType)) {
			return false;
		}

		// Check attribute change thresholds
		const changes = event.metadata?.attribute_changes as Record<string, number> | undefined;
		if (changes) {
			const thresholds = this.filter.attribute_threshold;
			for (const [key, threshold] of Object.entries(thresholds)) {
				const change = Math.abs(changes[key] || 0);
				if (change >= threshold) {
					return true; // Significant change, include
				}
			}
		}

		// Default: include if no specific filter criteria match
		return event.event_type !== "action" || !actionType;
	}
}

// Global event queue instance
let globalEventQueue: EventQueue | null = null;

/**
 * Get or create global event queue
 */
export function getEventQueue(filter?: EventFilter): EventQueue {
	if (!globalEventQueue) {
		globalEventQueue = new EventQueue(filter);
	}
	return globalEventQueue;
}

/**
 * Reset global event queue
 */
export function resetEventQueue(): void {
	globalEventQueue = null;
}

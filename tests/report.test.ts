// tests/report.test.ts
// ============================================================================
// Report Module Tests
// ============================================================================

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { EventQueue, getEventQueue, resetEventQueue } from "../tools/cyber_jianghu_report/event_queue.js";
import { ReportManager, initReportManager, cleanupReportManager } from "../tools/cyber_jianghu_report/index.js";
import { DEFAULT_EVENT_FILTER, DEFAULT_REPORT_CONFIG } from "../tools/cyber_jianghu_report/types.js";
import type { TickEvent, ReportConfig } from "../tools/cyber_jianghu_report/types.js";

describe("Report Module", () => {
	describe("Event Queue", () => {
		let queue: EventQueue;

		beforeEach(() => {
			resetEventQueue();
			queue = getEventQueue();
		});

		afterEach(() => {
			resetEventQueue();
		});

		it("should create queue with default filter", () => {
			expect(queue).toBeDefined();
		});

		it("should add event that passes filter", () => {
			const event: TickEvent = {
				id: "test-1",
				tick_id: 1,
				agent_id: "agent-1",
				event_type: "combat",
				description: "Test combat",
				created_at: new Date(),
			};

			const result = queue.addEvent(event);
			expect(result).toBe(true);
		});

		it("should filter out idle actions", () => {
			const event: TickEvent = {
				id: "test-2",
				tick_id: 1,
				agent_id: "agent-1",
				event_type: "action",
				description: "Doing nothing",
				metadata: { action_type: "idle" },
				created_at: new Date(),
			};

			const result = queue.addEvent(event);
			expect(result).toBe(false);
		});

		it("should always include critical events", () => {
			const event: TickEvent = {
				id: "test-3",
				tick_id: 1,
				agent_id: "agent-1",
				event_type: "death",
				description: "Character died",
				created_at: new Date(),
			};

			const result = queue.addEvent(event);
			expect(result).toBe(true);
		});

		it("should get unreported events for agent", () => {
			const event1: TickEvent = {
				id: "test-4",
				tick_id: 1,
				agent_id: "agent-1",
				event_type: "combat",
				created_at: new Date(),
			};
			const event2: TickEvent = {
				id: "test-5",
				tick_id: 1,
				agent_id: "agent-2",
				event_type: "combat",
				created_at: new Date(),
			};

			queue.addEvent(event1);
			queue.addEvent(event2);

			const unreported = queue.getUnreportedEvents("agent-1");
			expect(unreported.length).toBe(1);
			expect(unreported[0].agent_id).toBe("agent-1");
		});

		it("should mark events as reported", () => {
			const event: TickEvent = {
				id: "test-6",
				tick_id: 1,
				agent_id: "agent-1",
				event_type: "combat",
				created_at: new Date(),
			};

			queue.addEvent(event);
			queue.markAsReported(["test-6"]);

			const unreported = queue.getUnreportedEvents("agent-1");
			expect(unreported.length).toBe(0);
		});

		it("should return correct stats", () => {
			const event: TickEvent = {
				id: "test-7",
				tick_id: 1,
				agent_id: "agent-1",
				event_type: "combat",
				created_at: new Date(),
			};

			queue.addEvent(event);
			const stats = queue.getStats();

			expect(stats.total).toBe(1);
			expect(stats.unreported).toBe(1);
		});

		it("should clear old events", () => {
			const oldEvent: TickEvent = {
				id: "test-8",
				tick_id: 1,
				agent_id: "agent-1",
				event_type: "combat",
				created_at: new Date(Date.now() - 100000), // 100 seconds ago
			};
			const newEvent: TickEvent = {
				id: "test-9",
				tick_id: 2,
				agent_id: "agent-1",
				event_type: "combat",
				created_at: new Date(),
			};

			queue.addEvent(oldEvent);
			queue.addEvent(newEvent);

			const deleted = queue.clearOlderThan(new Date(Date.now() - 50000));
			expect(deleted).toBe(1);
		});
	});

	describe("Report Manager", () => {
		beforeEach(() => {
			cleanupReportManager();
		});

		afterEach(() => {
			cleanupReportManager();
		});

		it("should create report manager with config", () => {
			const config: Partial<ReportConfig> = {
				frequency: "30m",
				format: "narrative",
			};

			const manager = initReportManager("test-agent", config);
			expect(manager).toBeDefined();
		});

		it("should record tick events", () => {
			const manager = initReportManager("test-agent");
			const result = manager.recordTickEvent(1, "speak", "Said hello", { target: "npc-1" });
			expect(result).toBe(true);
		});

		it("should get stats", async () => {
			const manager = initReportManager("test-agent");
			manager.recordTickEvent(1, "combat", "Fought enemy");
			manager.recordTickEvent(2, "trade", "Bought item");

			const stats = await manager.getStats();
			expect(stats.total).toBe(2);
		});

		it("should return recent reports as empty initially", () => {
			const manager = initReportManager("test-agent");
			const reports = manager.getRecentReports();
			expect(reports.length).toBe(0);
		});
	});

	describe("Default Config", () => {
		it("should have correct event filter defaults", () => {
			expect(DEFAULT_EVENT_FILTER.exclude_actions).toContain("idle");
			expect(DEFAULT_EVENT_FILTER.include_events).toContain("combat");
			expect(DEFAULT_EVENT_FILTER.include_events).toContain("death");
		});

		it("should have correct report config defaults", () => {
			expect(DEFAULT_REPORT_CONFIG.frequency).toBe("1h");
			expect(DEFAULT_REPORT_CONFIG.format).toBe("narrative");
			expect(DEFAULT_REPORT_CONFIG.retention_days).toBe(30);
		});
	});
});

// tools/cyber_jianghu_report/aggregator.ts
// ============================================================================
// Report Aggregator
// ============================================================================
//
// Aggregates tick events into hourly reports with narrative summaries.
// Uses LLM to generate narrative descriptions of the agent's experiences.

import type { TickEvent, Report, ReportConfig } from "./types.js";
import { getEventQueue } from "./event_queue.js";

/**
 * Generate report ID based on timestamp
 */
function generateReportId(date: Date = new Date()): string {
	const yyyy = date.getFullYear();
	const mm = String(date.getMonth() + 1).padStart(2, "0");
	const dd = String(date.getDate()).padStart(2, "0");
	const hh = String(date.getHours()).padStart(2, "0");
	return `rpt-${yyyy}${mm}${dd}-${hh}00`;
}

/**
 * Format events into a prompt for LLM narrative generation
 */
function formatEventsForNarrative(events: TickEvent[]): string {
	if (events.length === 0) {
		return "无事件发生";
	}

	const lines: string[] = [];
	for (const event of events) {
		const time = event.created_at.toLocaleTimeString("zh-CN", { hour: "2-digit", minute: "2-digit" });
		const type = event.event_type;
		const desc = event.description || `事件类型: ${type}`;

		// Add relevant metadata
		let metadata = "";
		if (event.metadata) {
			if (event.metadata.action_type) {
				metadata += ` [动作: ${event.metadata.action_type}]`;
			}
			if (event.metadata.target_name) {
				metadata += ` [目标: ${event.metadata.target_name}]`;
			}
			if (event.metadata.attribute_changes) {
				const changes = event.metadata.attribute_changes as Record<string, number>;
				const changeStrs = Object.entries(changes)
					.map(([k, v]) => `${k}${v >= 0 ? "+" : ""}${v}`)
					.join(", ");
				if (changeStrs) metadata += ` [属性变化: ${changeStrs}]`;
			}
		}

		lines.push(`${time} - ${desc}${metadata}`);
	}

	return lines.join("\n");
}

/**
 * Generate narrative summary using template (no LLM required)
 * For production, this should call an LLM API
 */
function generateNarrativeSummary(events: TickEvent[], _format: ReportConfig["format"]): string {
	if (events.length === 0) {
		return "这个时辰里，你在江湖中安静地度过，没有发生什么特别的事情。";
	}

	// Simple template-based narrative (LLM integration would go here)
	const eventTypes = [...new Set(events.map((e) => e.event_type))];
	const locations = [...new Set(events.map((e) => e.metadata?.location).filter(Boolean))] as string[];

	// Build narrative based on events
	const parts: string[] = [];

	// Opening
	parts.push(`【江湖时报】\n`);

	// Event summary
	if (eventTypes.includes("combat")) {
		parts.push("本时辰经历了一场激烈的战斗，刀光剑影中你展现了不凡的武艺。");
	}
	if (eventTypes.includes("trade")) {
		parts.push("你与商贾往来，完成了一些交易，财富有所增减。");
	}
	if (eventTypes.includes("dialogue")) {
		parts.push("与江湖人士的交谈中，你获得了一些有用的信息。");
	}
	if (eventTypes.includes("discovery")) {
		parts.push("探索途中，你发现了一些有趣的事物。");
	}

	// Location context
	if (locations.length > 0) {
		parts.push(`\n足迹遍布: ${locations.join("、")}等地。`);
	}

	// Statistics
	parts.push(`\n【本时辰统计】`);
	parts.push(`- 发生事件: ${events.length} 件`);

	// Attribute changes summary
	const totalChanges: Record<string, number> = {};
	for (const event of events) {
		const changes = event.metadata?.attribute_changes as Record<string, number> | undefined;
		if (changes) {
			for (const [key, value] of Object.entries(changes)) {
				totalChanges[key] = (totalChanges[key] || 0) + value;
			}
		}
	}
	if (Object.keys(totalChanges).length > 0) {
		for (const [key, value] of Object.entries(totalChanges)) {
			const sign = value >= 0 ? "+" : "";
			parts.push(`- ${key}: ${sign}${value}`);
		}
	}

	return parts.join("\n");
}

/**
 * Generate hourly report for an agent
 */
export async function generateHourlyReport(
	agentId: string,
	config: ReportConfig,
): Promise<Report | null> {
	const queue = getEventQueue();
	const events = queue.getUnreportedEvents(agentId);

	if (events.length === 0) {
		console.log(`[report] No unreported events for agent ${agentId}`);
		return null;
	}

	// Determine report period
	const periodStart = events[0].created_at;
	const periodEnd = events[events.length - 1].created_at;

	// Generate narrative summary
	const summary = generateNarrativeSummary(events, config.format);

	// Create report
	const report: Report = {
		id: generateReportId(periodEnd),
		agent_id: agentId,
		period_start: periodStart,
		period_end: periodEnd,
		event_count: events.length,
		summary,
		webhook_status: config.webhook_url ? "pending" : "skipped",
		created_at: new Date(),
	};

	// Mark events as reported
	queue.markAsReported(events.map((e) => e.id));

	console.log(`[report] Generated report ${report.id} with ${events.length} events`);

	return report;
}

/**
 * Get report frequency in milliseconds
 */
export function getFrequencyMs(frequency: ReportConfig["frequency"]): number {
	switch (frequency) {
		case "30m":
			return 30 * 60 * 1000;
		case "1h":
			return 60 * 60 * 1000;
		case "2h":
			return 2 * 60 * 60 * 1000;
		default:
			return 60 * 60 * 1000;
	}
}

/**
 * Schedule hourly report generation
 */
export function scheduleReportGeneration(
	agentId: string,
	config: ReportConfig,
	onReport?: (report: Report) => void,
): ReturnType<typeof setInterval> {
	const intervalMs = getFrequencyMs(config.frequency);

	console.log(`[report] Scheduling report generation every ${config.frequency} for agent ${agentId}`);

	return setInterval(async () => {
		try {
			const report = await generateHourlyReport(agentId, config);
			if (report && onReport) {
				onReport(report);
			}
		} catch (e) {
			console.error("[report] Failed to generate report:", e);
		}
	}, intervalMs);
}

/**
 * Store for generated reports (in-memory, for demo)
 */
const reportStore: Map<string, Report[]> = new Map();

/**
 * Save report to store
 */
export function saveReport(report: Report): void {
	const agentReports = reportStore.get(report.agent_id) || [];
	agentReports.push(report);
	reportStore.set(report.agent_id, agentReports);
}

/**
 * Get reports for an agent
 */
export function getReports(agentId: string, limit: number = 10): Report[] {
	const reports = reportStore.get(agentId) || [];
	return reports.slice(-limit);
}

/**
 * Get latest report for an agent
 */
export function getLatestReport(agentId: string): Report | undefined {
	const reports = reportStore.get(agentId) || [];
	return reports[reports.length - 1];
}

// tools/cyber_jianghu_report/webhook.ts
// ============================================================================
// Webhook Push Module
// ============================================================================
//
// Pushes generated reports to configured webhook URLs.
// Supports retry mechanism and error handling.

import type { Report, WebhookPayload, ReportConfig } from "./types.js";

/**
 * Webhook push result
 */
export interface WebhookResult {
	success: boolean;
	statusCode?: number;
	error?: string;
	duration: number;
}

/**
 * Send webhook with retry mechanism
 */
export async function sendWebhook(
	webhookUrl: string,
	report: Report,
	maxRetries: number = 3,
): Promise<WebhookResult> {
	const payload: WebhookPayload = {
		report_id: report.id,
		agent_id: report.agent_id,
		period_start: report.period_start.toISOString(),
		period_end: report.period_end.toISOString(),
		event_count: report.event_count,
		summary: report.summary,
		timestamp: new Date().toISOString(),
	};

	let lastError: string | undefined;

	for (let attempt = 1; attempt <= maxRetries; attempt++) {
		const startTime = Date.now();

		try {
			console.log(`[webhook] Sending report ${report.id} to ${webhookUrl} (attempt ${attempt}/${maxRetries})`);

			const response = await fetch(webhookUrl, {
				method: "POST",
				headers: {
					"Content-Type": "application/json",
					"User-Agent": "Cyber-Jianghu-Report/1.0",
				},
				body: JSON.stringify(payload),
			});

			const duration = Date.now() - startTime;

			if (response.ok) {
				console.log(`[webhook] Report ${report.id} sent successfully (${duration}ms)`);
				return {
					success: true,
					statusCode: response.status,
					duration,
				};
			} else {
				lastError = `HTTP ${response.status}: ${response.statusText}`;
				console.warn(`[webhook] Attempt ${attempt} failed: ${lastError}`);
			}
		} catch (e) {
			lastError = e instanceof Error ? e.message : String(e);
			console.warn(`[webhook] Attempt ${attempt} failed: ${lastError}`);
		}

		// Wait before retry (exponential backoff)
		if (attempt < maxRetries) {
			const delay = Math.min(1000 * Math.pow(2, attempt - 1), 10000);
			await new Promise((resolve) => setTimeout(resolve, delay));
		}
	}

	console.error(`[webhook] All ${maxRetries} attempts failed for report ${report.id}`);
	return {
		success: false,
		error: lastError,
		duration: 0,
	};
}

/**
 * Push report via webhook if configured
 */
export async function pushReport(
	report: Report,
	config: ReportConfig,
): Promise<WebhookResult | null> {
	if (!config.webhook_url) {
		console.log(`[webhook] No webhook URL configured, skipping push for report ${report.id}`);
		report.webhook_status = "skipped";
		return null;
	}

	if (report.webhook_status === "sent") {
		console.log(`[webhook] Report ${report.id} already sent`);
		return null;
	}

	const result = await sendWebhook(config.webhook_url, report, config.max_retries);

	if (result.success) {
		report.webhook_status = "sent";
	} else {
		report.webhook_status = "failed";
	}

	return result;
}

/**
 * Push critical event in real-time
 */
export async function pushCriticalEvent(
	agentId: string,
	eventType: string,
	data: Record<string, unknown>,
	webhookUrl: string,
): Promise<WebhookResult> {
	const payload = {
		type: "critical_event",
		agent_id: agentId,
		event_type: eventType,
		data,
		timestamp: new Date().toISOString(),
	};

	const startTime = Date.now();

	try {
		const response = await fetch(webhookUrl, {
			method: "POST",
			headers: {
				"Content-Type": "application/json",
				"User-Agent": "Cyber-Jianghu-Critical/1.0",
			},
			body: JSON.stringify(payload),
		});

		const duration = Date.now() - startTime;

		if (response.ok) {
			return {
				success: true,
				statusCode: response.status,
				duration,
			};
		} else {
			return {
				success: false,
				statusCode: response.status,
				error: response.statusText,
				duration,
			};
		}
	} catch (e) {
		return {
			success: false,
			error: e instanceof Error ? e.message : String(e),
			duration: Date.now() - startTime,
		};
	}
}

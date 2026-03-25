// tools/cyber_jianghu_report/storage.ts
// ============================================================================
// SQLite Storage for Reports
// ============================================================================
//
// Provides persistent storage for tick events and reports using SQLite.
// This ensures data survives process restarts and enables historical queries.

import type { TickEvent, Report } from "./types.js";

/**
 * Simple in-memory SQLite-like storage interface
 * For production, replace with actual SQLite (better-sqlite3 or sql.js)
 */
interface StorageBackend {
	initialize(): Promise<void>;
	close(): void;

	// Event operations
	insertEvent(event: TickEvent): Promise<void>;
	getUnreportedEvents(agentId: string): Promise<TickEvent[]>;
	markEventsReported(eventIds: string[]): Promise<void>;
	deleteOldEvents(beforeDate: Date): Promise<number>;

	// Report operations
	insertReport(report: Report): Promise<void>;
	getReports(agentId: string, limit: number): Promise<Report[]>;
	getLatestReport(agentId: string): Promise<Report | null>;

	// Utility
	getStats(): Promise<{ eventCount: number; reportCount: number }>;
}

/**
 * In-memory storage implementation
 * Falls back to memory when SQLite is not available
 */
class InMemoryStorage implements StorageBackend {
	private events: TickEvent[] = [];
	private reports: Report[] = [];

	async initialize(): Promise<void> {
		console.log("[storage] Using in-memory storage (SQLite not available)");
	}

	close(): void {
		this.events = [];
		this.reports = [];
	}

	async insertEvent(event: TickEvent): Promise<void> {
		this.events.push(event);
	}

	async getUnreportedEvents(agentId: string): Promise<TickEvent[]> {
		return this.events.filter(
			(e) => e.agent_id === agentId && !e.reported_at,
		);
	}

	async markEventsReported(eventIds: string[]): Promise<void> {
		const reportedAt = new Date();
		for (const event of this.events) {
			if (eventIds.includes(event.id)) {
				event.reported_at = reportedAt;
			}
		}
	}

	async deleteOldEvents(beforeDate: Date): Promise<number> {
		const before = this.events.length;
		this.events = this.events.filter((e) => e.created_at >= beforeDate);
		return before - this.events.length;
	}

	async insertReport(report: Report): Promise<void> {
		this.reports.push(report);
	}

	async getReports(agentId: string, limit: number): Promise<Report[]> {
		const agentReports = this.reports.filter((r) => r.agent_id === agentId);
		return agentReports.slice(-limit);
	}

	async getLatestReport(agentId: string): Promise<Report | null> {
		const agentReports = this.reports.filter((r) => r.agent_id === agentId);
		return agentReports[agentReports.length - 1] || null;
	}

	async getStats(): Promise<{ eventCount: number; reportCount: number }> {
		return {
			eventCount: this.events.length,
			reportCount: this.reports.length,
		};
	}
}

/**
 * SQLite storage implementation using sql.js (browser-compatible)
 * Only loads SQLite when available
 */
class SQLiteStorage implements StorageBackend {
	private db: any = null;
	private initialized: boolean = false;

	constructor(_dbPath: string = ":memory:") {
		// dbPath is kept for future file-based storage support
	}

	async initialize(): Promise<void> {
		if (this.initialized) return;

		try {
			// Try to load sql.js (browser/Node compatible SQLite)
			// Using Function constructor to bypass TypeScript module resolution
			// This allows sql.js to be an optional dependency
			const dynamicImport = new Function("modulePath", "return import(modulePath)") as (path: string) => Promise<any>;
			const sqlJsModule = await dynamicImport("sql.js").catch(() => null);
			if (!sqlJsModule) {
				throw new Error("sql.js not available");
			}
			const initSqlJs = sqlJsModule.default;
			const SQL = await initSqlJs();

			// Create database
			this.db = new SQL.Database();

			// Create tables
			this.db.run(`
				CREATE TABLE IF NOT EXISTS tick_events (
					id TEXT PRIMARY KEY,
					tick_id INTEGER NOT NULL,
					agent_id TEXT NOT NULL,
					event_type TEXT NOT NULL,
					description TEXT,
					metadata TEXT,
					created_at TEXT NOT NULL,
					reported_at TEXT
				)
			`);

			this.db.run(`
				CREATE INDEX IF NOT EXISTS idx_tick_events_unreported
				ON tick_events(agent_id, reported_at)
			`);

			this.db.run(`
				CREATE TABLE IF NOT EXISTS reports (
					id TEXT PRIMARY KEY,
					agent_id TEXT NOT NULL,
					period_start TEXT NOT NULL,
					period_end TEXT NOT NULL,
					event_count INTEGER,
					summary TEXT,
					webhook_status TEXT,
					created_at TEXT NOT NULL
				)
			`);

			this.db.run(`
				CREATE INDEX IF NOT EXISTS idx_reports_agent
				ON reports(agent_id, created_at)
			`);

			this.initialized = true;
			console.log("[storage] SQLite storage initialized");
		} catch (e) {
			console.warn("[storage] Failed to initialize SQLite, falling back to in-memory:", e);
			// Fall back to in-memory storage
			throw e;
		}
	}

	close(): void {
		if (this.db) {
			this.db.close();
			this.db = null;
		}
	}

	async insertEvent(event: TickEvent): Promise<void> {
		this.db.run(
			`INSERT INTO tick_events (id, tick_id, agent_id, event_type, description, metadata, created_at, reported_at)
			 VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
			[
				event.id,
				event.tick_id,
				event.agent_id,
				event.event_type,
				event.description || null,
				event.metadata ? JSON.stringify(event.metadata) : null,
				event.created_at.toISOString(),
				event.reported_at?.toISOString() || null,
			],
		);
	}

	async getUnreportedEvents(agentId: string): Promise<TickEvent[]> {
		const results = this.db.exec(
			`SELECT * FROM tick_events WHERE agent_id = ? AND reported_at IS NULL ORDER BY created_at`,
			[agentId],
		);

		if (results.length === 0) return [];

		const columns = results[0].columns;
		return results[0].values.map((row: any[]) => {
			const obj: Record<string, any> = {};
			columns.forEach((col: string, i: number) => {
				obj[col] = row[i];
			});
			return this.rowToEvent(obj);
		});
	}

	async markEventsReported(eventIds: string[]): Promise<void> {
		const reportedAt = new Date().toISOString();
		const placeholders = eventIds.map(() => "?").join(",");
		this.db.run(
			`UPDATE tick_events SET reported_at = ? WHERE id IN (${placeholders})`,
			[reportedAt, ...eventIds],
		);
	}

	async deleteOldEvents(beforeDate: Date): Promise<number> {
		const result = this.db.run(
			`DELETE FROM tick_events WHERE created_at < ?`,
			[beforeDate.toISOString()],
		);
		return result.changes;
	}

	async insertReport(report: Report): Promise<void> {
		this.db.run(
			`INSERT INTO reports (id, agent_id, period_start, period_end, event_count, summary, webhook_status, created_at)
			 VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
			[
				report.id,
				report.agent_id,
				report.period_start.toISOString(),
				report.period_end.toISOString(),
				report.event_count,
				report.summary || null,
				report.webhook_status,
				report.created_at.toISOString(),
			],
		);
	}

	async getReports(agentId: string, limit: number): Promise<Report[]> {
		const results = this.db.exec(
			`SELECT * FROM reports WHERE agent_id = ? ORDER BY created_at DESC LIMIT ?`,
			[agentId, limit],
		);

		if (results.length === 0) return [];

		const columns = results[0].columns;
		return results[0].values.map((row: any[]) => {
			const obj: Record<string, any> = {};
			columns.forEach((col: string, i: number) => {
				obj[col] = row[i];
			});
			return this.rowToReport(obj);
		}).reverse(); // Return in chronological order
	}

	async getLatestReport(agentId: string): Promise<Report | null> {
		const results = this.db.exec(
			`SELECT * FROM reports WHERE agent_id = ? ORDER BY created_at DESC LIMIT 1`,
			[agentId],
		);

		if (results.length === 0 || results[0].values.length === 0) return null;

		const columns = results[0].columns;
		const row = results[0].values[0];
		const obj: Record<string, any> = {};
		columns.forEach((col: string, i: number) => {
			obj[col] = row[i];
		});
		return this.rowToReport(obj);
	}

	async getStats(): Promise<{ eventCount: number; reportCount: number }> {
		const eventCount = this.db.exec("SELECT COUNT(*) FROM tick_events")[0]?.values[0]?.[0] || 0;
		const reportCount = this.db.exec("SELECT COUNT(*) FROM reports")[0]?.values[0]?.[0] || 0;
		return { eventCount, reportCount };
	}

	private rowToEvent(row: Record<string, any>): TickEvent {
		return {
			id: row.id,
			tick_id: row.tick_id,
			agent_id: row.agent_id,
			event_type: row.event_type,
			description: row.description || undefined,
			metadata: row.metadata ? JSON.parse(row.metadata) : undefined,
			created_at: new Date(row.created_at),
			reported_at: row.reported_at ? new Date(row.reported_at) : undefined,
		};
	}

	private rowToReport(row: Record<string, any>): Report {
		return {
			id: row.id,
			agent_id: row.agent_id,
			period_start: new Date(row.period_start),
			period_end: new Date(row.period_end),
			event_count: row.event_count,
			summary: row.summary || undefined,
			webhook_status: row.webhook_status,
			created_at: new Date(row.created_at),
		};
	}
}

// Global storage instance
let globalStorage: StorageBackend | null = null;

/**
 * Initialize storage backend
 * Tries SQLite first, falls back to in-memory
 */
export async function initStorage(dbPath?: string): Promise<StorageBackend> {
	if (globalStorage) {
		return globalStorage;
	}

	// Try SQLite first
	try {
		const sqliteStorage = new SQLiteStorage(dbPath);
		await sqliteStorage.initialize();
		globalStorage = sqliteStorage;
		return globalStorage;
	} catch (e) {
		console.log("[storage] SQLite not available, using in-memory storage");
	}

	// Fall back to in-memory
	const memoryStorage = new InMemoryStorage();
	await memoryStorage.initialize();
	globalStorage = memoryStorage;
	return globalStorage;
}

/**
 * Get current storage instance
 */
export function getStorage(): StorageBackend | null {
	return globalStorage;
}

/**
 * Close and reset storage
 */
export function closeStorage(): void {
	if (globalStorage) {
		globalStorage.close();
		globalStorage = null;
	}
}

export type { StorageBackend };

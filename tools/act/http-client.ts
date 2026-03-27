// tools/act/http-client.ts
// ============================================================================
// Simplified HTTP Client for Cyber-Jianghu-Openclaw Plugin
// ============================================================================
//
// Communicates with the local Rust Agent's HTTP API.
//
// Port auto-discovery: scans 23340-23349, probes /api/v1/health.
// Endpoints used by this plugin:
//   GET  /api/v1/health                  — health check / port discovery
//   GET  /api/v1/character               — character info for bootstrap
//   POST /api/v1/character/register      — registration
//   POST /api/v1/character/dream         — dream injection
//   GET  /api/v1/character/experiences   — report data source
//   GET  /api/v1/relationship/{id}       — dialogue name resolution

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------

export interface HttpClientConfig {
	/** Port range to scan for the agent */
	portRange: { min: number; max: number };
	/** Timeout per port probe during discovery (ms) */
	discoveryTimeoutMs: number;
	/** Timeout for regular HTTP requests (ms) */
	requestTimeoutMs: number;
	/** Default hostname */
	defaultHost: string;
}

const DEFAULT_CONFIG: HttpClientConfig = {
	portRange: { min: 23340, max: 23349 },
	discoveryTimeoutMs: 500,
	requestTimeoutMs: 5000,
	defaultHost: "127.0.0.1",
};

// ---------------------------------------------------------------------------
// Agent info cache
// ---------------------------------------------------------------------------

export interface AgentInfo {
	agentId: string;
	apiPort: number;
}

let cachedAgentInfo: AgentInfo | null = null;

// ---------------------------------------------------------------------------
// Port auto-discovery
// ---------------------------------------------------------------------------

/**
 * Scan the configured port range and return the first port that responds to
 * a health check with `{ status: "ok" }`.
 */
async function discoverPort(
	host: string,
	config: HttpClientConfig,
): Promise<number | null> {
	for (let port = config.portRange.min; port <= config.portRange.max; port++) {
		try {
			const response = await fetch(
				`http://${host}:${port}/api/v1/health`,
				{
					method: "GET",
					signal: AbortSignal.timeout(config.discoveryTimeoutMs),
				},
			);
			if (response.ok) {
				const data = (await response.json()) as { status?: string };
				if (data.status === "ok") {
					console.log(`[http-client] Discovered agent at ${host}:${port}`);
					return port;
				}
			}
		} catch {
			// Port unreachable — continue scanning
		}
	}
	return null;
}

// ---------------------------------------------------------------------------
// HttpClient
// ---------------------------------------------------------------------------

export class HttpClient {
	private readonly baseUrl: string;
	private readonly timeoutMs: number;

	constructor(port: number, host: string, timeoutMs: number) {
		this.baseUrl = `http://${host}:${port}`;
		this.timeoutMs = timeoutMs;
	}

	/** GET request, returns parsed JSON. */
	async get<T = unknown>(path: string): Promise<T> {
		const controller = new AbortController();
		const timer = setTimeout(() => controller.abort(), this.timeoutMs);
		try {
			const res = await fetch(`${this.baseUrl}${path}`, {
				method: "GET",
				headers: { Accept: "application/json" },
				signal: controller.signal,
			});
			if (!res.ok) {
				throw new Error(`HTTP ${res.status}: ${res.statusText}`);
			}
			return (await res.json()) as T;
		} finally {
			clearTimeout(timer);
		}
	}

	/** POST request with JSON body, returns parsed JSON (or empty object). */
	async post<T = unknown>(path: string, body: unknown): Promise<T> {
		const controller = new AbortController();
		const timer = setTimeout(() => controller.abort(), this.timeoutMs);
		try {
			const res = await fetch(`${this.baseUrl}${path}`, {
				method: "POST",
				headers: {
					"Content-Type": "application/json",
					Accept: "application/json",
				},
				body: JSON.stringify(body),
				signal: controller.signal,
			});
			if (!res.ok) {
				const text = await res.text();
				throw new Error(`HTTP ${res.status}: ${text}`);
			}
			const text = await res.text();
			if (!text) return {} as T;
			return JSON.parse(text) as T;
		} finally {
			clearTimeout(timer);
		}
	}

	/** Expose the base URL for debugging / logging. */
	getBaseUrl(): string {
		return this.baseUrl;
	}
}

// ---------------------------------------------------------------------------
// Singleton factory
// ---------------------------------------------------------------------------

let singletonClient: HttpClient | null = null;

/**
 * Get (or create) the singleton `HttpClient`.
 *
 * On the first call the client performs port auto-discovery unless a port
 * was already cached.  Subsequent calls return the cached instance.
 *
 * An optional partial `HttpClientConfig` overrides defaults.
 */
export async function getHttpClient(
	config?: Partial<HttpClientConfig>,
): Promise<HttpClient> {
	if (singletonClient) return singletonClient;

	const cfg = { ...DEFAULT_CONFIG, ...config };
	const host =
		(typeof process !== 'undefined' && process.env?.DOCKER_AGENT_HOST) || cfg.defaultHost;

	// Use cached agent info if available
	if (cachedAgentInfo) {
		singletonClient = new HttpClient(
			cachedAgentInfo.apiPort,
			host,
			cfg.requestTimeoutMs,
		);
		return singletonClient;
	}

	// Discover agent port
	const port = await discoverPort(host, cfg);
	if (port === null) {
		throw new Error(
			`No agent HTTP API found on ${host} in port range ${cfg.portRange.min}-${cfg.portRange.max}`,
		);
	}

	cachedAgentInfo = { agentId: `agent-${port}`, apiPort: port };
	singletonClient = new HttpClient(port, host, cfg.requestTimeoutMs);
	return singletonClient;
}

/**
 * Return the cached `AgentInfo` (available after the first successful
 * `getHttpClient()` call).
 */
export function getAgentInfo(): AgentInfo | null {
	return cachedAgentInfo;
}

/**
 * Reset the singleton and cached info (useful for tests or reconnection).
 */
export function resetHttpClient(): void {
	singletonClient = null;
	cachedAgentInfo = null;
}

// integration/openclaw/tools/jianghu_act/http-client.ts
// ============================================================================
// Generic HTTP Client for crates/agent Local API
// ============================================================================
//
// 设计原则：
// - 不定义具体接口，只提供通用 HTTP 方法
// - 所有接口以 crates/agent 实际披露的为准
// - 端口范围: 23340-23349 (避免与服务器端口 23333 冲突)
// - 所有默认值可被 HttpClientConfig 覆盖（数据驱动）
//
// 使用方式：
// - getHttpClientAsync(port) - 异步版本，支持端口自动发现
// - 推荐在所有场景使用异步版本

/**
 * HTTP 客户端配置（数据驱动）
 *
 * 可通过 OpenClaw config.http 覆盖默认值
 */
export interface HttpClientConfig {
	/** 端口范围 */
	portRange: { min: number; max: number };
	/** 端口发现超时（毫秒） */
	discoveryTimeoutMs: number;
	/** 请求超时（毫秒） */
	requestTimeoutMs: number;
	/** 默认主机 */
	defaultHost: string;
}

/**
 * 默认 HTTP 客户端配置
 */
export const DEFAULT_HTTP_CONFIG: HttpClientConfig = {
	portRange: { min: 23340, max: 23349 },
	discoveryTimeoutMs: 500,
	requestTimeoutMs: 5000,
	defaultHost: "127.0.0.1",
};

/** Agent HTTP API 端口范围 */
export const PORT_RANGE = DEFAULT_HTTP_CONFIG.portRange;

/**
 * 自动发现 Agent HTTP API 端口
 *
 * 扫描配置的端口范围，返回第一个响应健康检查的端口
 */
export async function discoverPort(
	host?: string,
	config?: Partial<HttpClientConfig>,
): Promise<number | null> {
	const cfg = { ...DEFAULT_HTTP_CONFIG, ...config };
	const targetHost = host || cfg.defaultHost;
	const timeoutMs = cfg.discoveryTimeoutMs;

	for (let port = cfg.portRange.min; port <= cfg.portRange.max; port++) {
		try {
			const response = await fetch(`http://${targetHost}:${port}/api/v1/health`, {
				method: "GET",
				signal: AbortSignal.timeout(timeoutMs),
			});
			if (response.ok) {
				const data = await response.json();
				if (data.status === "ok") {
					console.log(`[http-client] Discovered agent at port ${port}`);
					return port;
				}
			}
		} catch {
			// Port not available, continue scanning
		}
	}
	return null;
}

/**
 * Generic HTTP Client for crates/agent API
 *
 * 提供通用的 HTTP 方法，不定义具体的接口。
 * 调用者需要根据 crates/agent 的实际 API 使用。
 */
export class HttpClient {
	private baseUrl: string;
	private timeoutMs: number;

	constructor(
		port: number,
		host?: string,
		timeoutMs?: number,
	) {
		const cfg = DEFAULT_HTTP_CONFIG;
		this.baseUrl = `http://${host || cfg.defaultHost}:${port}`;
		this.timeoutMs = timeoutMs ?? cfg.requestTimeoutMs;
	}

	/**
	 * Make HTTP GET request
	 */
	async get<T = unknown>(path: string): Promise<T> {
		const controller = new AbortController();
		const timeoutId = setTimeout(() => controller.abort(), this.timeoutMs);

		try {
			const response = await fetch(`${this.baseUrl}${path}`, {
				method: "GET",
				headers: { Accept: "application/json" },
				signal: controller.signal,
			});

			if (!response.ok) {
				throw new Error(`HTTP ${response.status}: ${response.statusText}`);
			}

			return await response.json();
		} finally {
			clearTimeout(timeoutId);
		}
	}

	/**
	 * Make HTTP POST request
	 */
	async post<T = unknown>(path: string, body: unknown): Promise<T> {
		const controller = new AbortController();
		const timeoutId = setTimeout(() => controller.abort(), this.timeoutMs);

		try {
			const response = await fetch(`${this.baseUrl}${path}`, {
				method: "POST",
				headers: {
					"Content-Type": "application/json",
					Accept: "application/json",
				},
				body: JSON.stringify(body),
				signal: controller.signal,
			});

			if (!response.ok) {
				const errorText = await response.text();
				throw new Error(`HTTP ${response.status}: ${errorText}`);
			}

			// Handle empty response
			const text = await response.text();
			if (!text) {
				return {} as T;
			}
			return JSON.parse(text) as T;
		} finally {
			clearTimeout(timeoutId);
		}
	}

	/**
	 * Get base URL for debugging
	 */
	getBaseUrl(): string {
		return this.baseUrl;
	}
}

// Global HTTP client cache
const clientCache: Map<string, HttpClient> = new Map();
let discoveredPort: number | null = null;

/**
 * Get or create HTTP client (async version)
 *
 * 如果 port 为 0，会自动在配置的端口范围内发现可用端口
 * 这是推荐的唯一获取客户端的方式
 */
export async function getHttpClientAsync(
	port: number = 0,
	host?: string,
	config?: Partial<HttpClientConfig>,
): Promise<HttpClient> {
	const cfg = { ...DEFAULT_HTTP_CONFIG, ...config };
	const targetHost = host || cfg.defaultHost;

	// 如果 port 为 0，自动发现端口
	if (port === 0) {
		if (discoveredPort === null) {
			discoveredPort = await discoverPort(targetHost, cfg);
			if (discoveredPort === null) {
				throw new Error(
					`No agent HTTP API found in port range ${cfg.portRange.min}-${cfg.portRange.max}`
				);
			}
		}
		port = discoveredPort;
	}

	const key = `${targetHost}:${port}`;

	if (!clientCache.has(key)) {
		console.log(`[http-client] Creating new HTTP client for ${key}`);
		clientCache.set(key, new HttpClient(port, targetHost, cfg.requestTimeoutMs));
	}

	return clientCache.get(key)!;
}

/**
 * Reset discovered port (useful for testing)
 */
export function resetDiscovery(): void {
	discoveredPort = null;
}

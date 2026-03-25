// tests/ws-client.test.ts
// ============================================================================
// WebSocket Client Tests
// ============================================================================

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { WsClient } from "../tools/cyber_jianghu_act/ws-client.js";

describe("WebSocket Client", () => {
	describe("Configuration", () => {
		it("should use default config values via constructor", () => {
			const client = new WsClient();
			const config = (client as any).config;
			expect(config.host).toBe("127.0.0.1");
			expect(config.port).toBe(23340);
			expect(config.connectTimeoutMs).toBe(5000);
			expect(config.reconnectDelayMs).toBe(5000);
			expect(config.maxReconnectAttempts).toBe(3);
		});

		it("should have heartbeat config", () => {
			const client = new WsClient();
			const config = (client as any).config;
			expect(config.pingIntervalMs).toBe(30000);
			expect(config.pongTimeoutMs).toBe(10000);
			expect(config.idleTimeoutMs).toBe(50000);
		});

		it("should merge custom config with defaults", () => {
			const client = new WsClient({ port: 23341 });
			const config = (client as any).config;
			expect(config.port).toBe(23341);
			expect(config.host).toBe("127.0.0.1");
		});
	});

	describe("Connection State", () => {
		let client: WsClient;

		beforeEach(() => {
			client = new WsClient();
		});

		afterEach(() => {
			client.disconnect();
		});

		it("should start disconnected", () => {
			expect(client.isConnected()).toBe(false);
		});

		it("should allow setting handlers", () => {
			const tickHandler = vi.fn();
			const errorHandler = vi.fn();
			const connectHandler = vi.fn();
			const disconnectHandler = vi.fn();

			client.onTick(tickHandler);
			client.onError(errorHandler);
			client.onConnect(connectHandler);
			client.onDisconnect(disconnectHandler);

			// Handlers should be set without error
			expect(true).toBe(true);
		});
	});

	describe("Message Sending", () => {
		let client: WsClient;

		beforeEach(() => {
			client = new WsClient();
		});

		afterEach(() => {
			client.disconnect();
		});

		it("should not send when disconnected", () => {
			const consoleSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

			client.sendIntent(1, "idle");
			expect(consoleSpy).toHaveBeenCalledWith(
				"[ws-client] Not connected, cannot send message",
			);

			consoleSpy.mockRestore();
		});

		it("should format intent message correctly", () => {
			// Mock WebSocket
			const mockWs = {
				readyState: 1, // OPEN
				send: vi.fn(),
			};

			(client as any).ws = mockWs;

			client.sendIntent(1, "speak", "Hello", "Thinking...");

			expect(mockWs.send).toHaveBeenCalledWith(
				JSON.stringify({
					type: "intent",
					tick_id: 1,
					action_type: "speak",
					action_data: "Hello",
					thought_log: "Thinking...",
				}),
			);
		});

		it("should format review result message correctly", () => {
			const mockWs = {
				readyState: 1, // OPEN
				send: vi.fn(),
			};

			(client as any).ws = mockWs;

			client.sendReviewResult(1, "approved", "Good action", "Narrative text");

			expect(mockWs.send).toHaveBeenCalledWith(
				JSON.stringify({
					type: "review_result",
					tick_id: 1,
					decision: "approved",
					reason: "Good action",
					narrative: "Narrative text",
				}),
			);
		});
	});
});

import { describe, expect, it } from "vitest";
import { iceMessagesApi, streamSimple } from "../src/compat.ts";
import { DEFAULT_RADIUS_GATEWAY } from "../src/providers/radius-config.ts";
import type { Model } from "../src/types.ts";

describe("ice message protocol", () => {
	it("keeps the existing external gateway", () => {
		expect(DEFAULT_RADIUS_GATEWAY).toBe("https://radius.pi.dev");
		expect(typeof iceMessagesApi).toBe("function");
	});

	it("streams ice-messages text and tools", async () => {
		const model: Model<"ice-messages"> = {
			id: "fixture",
			name: "Fixture",
			api: "ice-messages",
			provider: "fixture",
			baseUrl: "https://fixture.invalid/v1",
			reasoning: false,
			input: ["text"],
			cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
			contextWindow: 8192,
			maxTokens: 1024,
		};
		const usage = {
			input: 1,
			output: 2,
			cacheRead: 0,
			cacheWrite: 0,
			totalTokens: 3,
			cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 },
		};
		let calls = 0;
		const mockFetch: typeof fetch = async (url, init) => {
			calls++;
			expect(String(url)).toBe("https://fixture.invalid/v1/messages");
			expect(JSON.parse(String(init?.body))).toMatchObject({
				model: "fixture",
				options: { sessionId: "original-session" },
			});
			const events = [
				{ type: "start" },
				{ type: "text_start", contentIndex: 0 },
				{ type: "text_delta", contentIndex: 0, delta: "same" },
				{ type: "text_end", contentIndex: 0, content: "same" },
				{ type: "toolcall_start", contentIndex: 1, id: "call_1", toolName: "read" },
				{
					type: "toolcall_end",
					contentIndex: 1,
					toolCall: { type: "toolCall", id: "call_1", name: "read", arguments: { path: "a.txt" } },
				},
				{ type: "done", reason: "toolUse", usage, responseId: "response-1" },
			];
			return new Response(events.map((event) => `data: ${JSON.stringify(event)}\n\n`).join(""), {
				headers: { "content-type": "text/event-stream" },
			});
		};
		const result = await streamSimple(
			model,
			{ messages: [] },
			{ apiKey: "fixture-only", fetch: mockFetch, sessionId: "original-session" },
		).result();
		expect(calls).toBe(1);
		expect(result).toMatchObject({
			api: "ice-messages",
			stopReason: "toolUse",
			responseId: "response-1",
			usage,
			content: [
				{ type: "text", text: "same" },
				{ type: "toolCall", id: "call_1", name: "read", arguments: { path: "a.txt" } },
			],
		});
	});
});

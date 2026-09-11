import { describe, expect, it } from "vitest";
import {
	adjustMaxTokensForThinking,
	buildBaseOptions,
	clampMaxTokensToHardLimit,
	enforceHardMaxTokensInRecord,
} from "../src/api/simple-options.ts";
import type { Context, Model } from "../src/types.ts";

function model(): Model<"openai-responses"> {
	return {
		id: "test-model",
		name: "test-model",
		api: "openai-responses",
		provider: "openai",
		baseUrl: "https://example.invalid/v1",
		reasoning: true,
		input: ["text"],
		cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
		contextWindow: 128_000,
		maxTokens: 16_384,
	};
}

const context: Context = { messages: [] };

describe("simple provider options", () => {
	it("preserves ordinary defaults when no hard authority is supplied", () => {
		const options = buildBaseOptions(model(), context, { maxTokens: 2_000 });
		expect(options.maxTokens).toBe(2_000);
		expect(options.hardMaxOutputTokens).toBeUndefined();
		expect(options.toolChoice).toBeUndefined();
	});

	it("clamps output to the runtime hard authority", () => {
		expect(clampMaxTokensToHardLimit(10_000, 4_096)).toBe(4_096);
		const options = buildBaseOptions(model(), context, {
			maxTokens: 10_000,
			hardMaxOutputTokens: 4_096,
			toolChoice: "none",
		});
		expect(options.maxTokens).toBe(4_096);
		expect(options.hardMaxOutputTokens).toBe(4_096);
		expect(options.toolChoice).toBe("none");
	});

	it("does not let thinking adjustment re-expand the hard ceiling", () => {
		const adjusted = adjustMaxTokensForThinking(2_000, 16_384, "high", undefined, 4_096);
		expect(adjusted.maxTokens).toBe(4_096);
		expect(adjusted.maxTokens).toBeLessThanOrEqual(4_096);
		expect(() => clampMaxTokensToHardLimit(100, 0)).toThrow(/positive/);
	});

	it("reapplies the hard ceiling after payload customization", () => {
		const payload: Record<string, unknown> = { max_output_tokens: 50_000 };
		enforceHardMaxTokensInRecord(payload, "max_output_tokens", 4_096);
		expect(payload.max_output_tokens).toBe(4_096);
		delete payload.max_output_tokens;
		enforceHardMaxTokensInRecord(payload, "max_output_tokens", 2_048);
		expect(payload.max_output_tokens).toBe(2_048);
	});
});

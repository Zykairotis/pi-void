import { describe, expect, it } from "vitest";
import { modelAwareReserveTokens } from "../src/core/compaction/compaction.ts";
import { mapEndpointModels } from "../src/piv-provider.ts";

describe("piv provider model mapping", () => {
	it("maps endpoint limits and capabilities exactly", () => {
		expect(
			mapEndpointModels({
				data: [
					{
						id: "vendor/model",
						capabilities: { vision: true, reasoning: true, contextWindow: 400000, maxOutput: 128000 },
					},
				],
			}),
		).toMatchObject([
			{
				id: "vendor/model",
				reasoning: true,
				input: ["text", "image"],
				contextWindow: 400000,
				maxTokens: 128000,
			},
		]);
	});

	it("rejects incomplete limits instead of guessing", () => {
		expect(() => mapEndpointModels({ data: [{ id: "broken", capabilities: {} }] })).toThrow("contextWindow");
	});
});

describe("piv compaction reserve", () => {
	it("uses advertised max output without consuming more than half the context", () => {
		expect(modelAwareReserveTokens(400000, 128000)).toBe(128000);
		expect(modelAwareReserveTokens(1000000, 512000)).toBe(500000);
	});
});

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
						capabilities: {
							vision: true,
							reasoning: true,
							contextWindow: 400000,
							maxOutput: 128000,
							thinkingFormat: "openai",
							thinkingCanDisable: true,
							thinkingLevelMap: { ultra: "native-ultra" },
						},
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
				thinkingLevelMap: { ultra: "native-ultra" },
				compat: {
					thinkingFormat: "openai",
					supportsReasoningEffort: true,
					thinkingCanDisable: true,
				},
			},
		]);
	});

	it("infers only verified current route mappings", () => {
		const models = mapEndpointModels({
			data: [
				{
					id: "cmc/deepseek/deepseek-v4-pro",
					capabilities: {
						reasoning: true,
						contextWindow: 1000000,
						maxOutput: 384000,
						thinkingFormat: "deepseek",
					},
				},
				{
					id: "cx/gpt-5.6-luna",
					capabilities: {
						reasoning: true,
						contextWindow: 272000,
						maxOutput: 128000,
						thinkingFormat: "openai",
					},
				},
			],
		});

		expect(models[0]?.thinkingLevelMap).toEqual({
			minimal: null,
			low: null,
			medium: null,
			high: "high",
			xhigh: null,
			max: "max",
		});
		expect(models[1]?.thinkingLevelMap).toEqual({ xhigh: "xhigh", max: "max" });
		expect(models[1]?.thinkingLevelMap?.ultra).toBeUndefined();
		expect(models[0]?.api).toBe("openai-completions");
		expect(models[0]?.serviceTiers).toBeUndefined();
		expect(models[1]?.api).toBe("openai-responses");
		expect(models[1]?.serviceTiers).toEqual(["priority"]);
	});

	it("preserves explicit service tiers and only enables priority for the verified route", () => {
		const models = mapEndpointModels({
			data: [
				{
					id: "cx/gpt-5.6-review",
					capabilities: {
						reasoning: true,
						contextWindow: 272000,
						maxOutput: 128000,
						thinkingFormat: "openai",
						serviceTiers: ["default", "priority"],
					},
				},
				{
					id: "other/gpt-5.6",
					capabilities: {
						reasoning: true,
						contextWindow: 272000,
						maxOutput: 128000,
						thinkingFormat: "openai",
						serviceTiers: ["priority"],
					},
				},
			],
		});

		expect(models[0]?.api).toBe("openai-responses");
		expect(models[0]?.serviceTiers).toEqual(["default", "priority"]);
		expect(models[1]?.api).toBe("openai-completions");
		expect(models[1]?.serviceTiers).toEqual(["priority"]);
	});

	it("preserves supported endpoint thinking formats", () => {
		const [model] = mapEndpointModels({
			data: [
				{
					id: "custom/qwen",
					capabilities: {
						reasoning: true,
						contextWindow: 128000,
						maxOutput: 8192,
						thinkingFormat: "qwen",
					},
				},
			],
		});

		expect(model?.compat).toEqual({ thinkingFormat: "qwen", supportsReasoningEffort: true });
	});

	it("accepts every native thinking format exposed by the local endpoint", () => {
		const formats = [
			"claude-adaptive",
			"claude-budget",
			"gemini-level",
			"gemini-budget",
			"kimi",
			"minimax",
			"hunyuan",
			"step",
		] as const;

		const models = mapEndpointModels({
			data: formats.map((thinkingFormat, index) => ({
				id: `vendor/${thinkingFormat}-${index}`,
				capabilities: { reasoning: true, contextWindow: 128000, maxOutput: 8192, thinkingFormat },
			})),
		});

		expect(models.map((model) => model.compat?.thinkingFormat)).toEqual(formats);
		expect(models.every((model) => model.compat?.supportsReasoningEffort === true)).toBe(true);
	});

	it("accepts nullable optional capability metadata", () => {
		const [model] = mapEndpointModels({
			data: [
				{
					id: "vendor/plain",
					capabilities: {
						contextWindow: 128000,
						maxOutput: 8192,
						thinkingFormat: null,
						thinkingLevelMap: null,
						serviceTiers: null,
					},
				},
			],
		});

		expect(model?.compat).toBeUndefined();
		expect(model?.thinkingLevelMap).toBeUndefined();
		expect(model?.serviceTiers).toBeUndefined();
	});

	it("preserves a new endpoint thinking format without invalidating the catalog", () => {
		const [model] = mapEndpointModels({
			data: [
				{
					id: "vendor/future-reasoning",
					capabilities: {
						reasoning: true,
						contextWindow: 128000,
						maxOutput: 8192,
						thinkingFormat: "future-native-format",
					},
				},
			],
		});

		expect(model?.compat).toMatchObject({ thinkingFormat: "future-native-format", supportsReasoningEffort: true });
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

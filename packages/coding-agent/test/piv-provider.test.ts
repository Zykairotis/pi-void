import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { modelAwareReserveTokens } from "../src/core/compaction/compaction.ts";
import { mapEndpointModels, refreshLocalModelsForStartup } from "../src/piv-provider.ts";

const tempDirs: string[] = [];
const originalLocalApiKey = process.env.PIV_LOCAL_API_KEY;

afterEach(() => {
	for (const path of tempDirs.splice(0)) rmSync(path, { recursive: true, force: true });
	if (originalLocalApiKey === undefined) delete process.env.PIV_LOCAL_API_KEY;
	else process.env.PIV_LOCAL_API_KEY = originalLocalApiKey;
});

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

describe("piv startup model refresh", () => {
	it("refreshes in the background when a cached local catalog exists", async () => {
		const agentDir = mkdtempSync(join(tmpdir(), "piv-provider-cached-"));
		tempDirs.push(agentDir);
		delete process.env.PIV_LOCAL_API_KEY;
		writeFileSync(join(agentDir, "auth.json"), JSON.stringify({ local: { type: "api_key", key: "cached-secret" } }));
		writeFileSync(join(agentDir, "models.json"), JSON.stringify({ providers: { local: { models: [{}] } } }));
		let resolveRefresh: ((result: { updated: boolean; count?: number; error?: string }) => void) | undefined;
		const refresh = vi.fn(
			() =>
				new Promise<{ updated: boolean; count?: number; error?: string }>((resolve) => {
					resolveRefresh = resolve;
				}),
		);
		const onFailure = vi.fn();

		await expect(refreshLocalModelsForStartup(agentDir, { refresh, onFailure })).resolves.toBeUndefined();
		expect(refresh).toHaveBeenCalledOnce();
		expect(process.env.PIV_LOCAL_API_KEY).toBe("cached-secret");
		expect(onFailure).not.toHaveBeenCalled();

		resolveRefresh?.({ updated: false, error: "endpoint unavailable" });
		await vi.waitFor(() => expect(onFailure).toHaveBeenCalledWith("endpoint unavailable"));
	});

	it("waits for refresh when no cached local catalog exists", async () => {
		const agentDir = mkdtempSync(join(tmpdir(), "piv-provider-cold-"));
		tempDirs.push(agentDir);
		let resolveRefresh: ((result: { updated: boolean; count?: number; error?: string }) => void) | undefined;
		const refresh = vi.fn(
			() =>
				new Promise<{ updated: boolean; count?: number; error?: string }>((resolve) => {
					resolveRefresh = resolve;
				}),
		);
		let ready = false;
		const startup = refreshLocalModelsForStartup(agentDir, { refresh, onFailure: vi.fn() }).then(() => {
			ready = true;
		});

		await new Promise((resolve) => setTimeout(resolve, 10));
		expect(ready).toBe(false);
		resolveRefresh?.({ updated: true, count: 1 });
		await startup;
		expect(ready).toBe(true);
	});

	it("does not refresh in explicit offline mode but keeps cached auth usable", async () => {
		const agentDir = mkdtempSync(join(tmpdir(), "piv-provider-offline-"));
		tempDirs.push(agentDir);
		delete process.env.PIV_LOCAL_API_KEY;
		writeFileSync(join(agentDir, "auth.json"), JSON.stringify({ local: { type: "api_key", key: "offline-secret" } }));
		const refresh = vi.fn(async () => ({ updated: true, count: 1 }));

		await refreshLocalModelsForStartup(agentDir, { skip: true, refresh, onFailure: vi.fn() });

		expect(refresh).not.toHaveBeenCalled();
		expect(process.env.PIV_LOCAL_API_KEY).toBe("offline-secret");
	});

	it("reports unexpected refresh failures without rejecting startup", async () => {
		const agentDir = mkdtempSync(join(tmpdir(), "piv-provider-failure-"));
		tempDirs.push(agentDir);
		const onFailure = vi.fn();

		await refreshLocalModelsForStartup(agentDir, {
			refresh: () => Promise.reject(new Error("refresh crashed")),
			onFailure,
		});

		expect(onFailure).toHaveBeenCalledWith("refresh crashed");
	});
});

describe("piv compaction reserve", () => {
	it("uses advertised max output without consuming more than half the context", () => {
		expect(modelAwareReserveTokens(400000, 128000)).toBe(128000);
		expect(modelAwareReserveTokens(1000000, 512000)).toBe(500000);
	});
});

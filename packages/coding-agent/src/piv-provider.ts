import { readFile, rename, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import type { OpenAICompletionsCompat, ThinkingLevelMap } from "@earendil-works/pi-ai";

const PROVIDER = "local";
const BASE_URL = "http://127.0.0.1:20128/v1";
const REQUEST_TIMEOUT_MS = 10000;

interface EndpointModel {
	id: unknown;
	capabilities?: {
		vision?: unknown;
		reasoning?: unknown;
		contextWindow?: unknown;
		maxOutput?: unknown;
		thinkingFormat?: unknown;
		thinkingCanDisable?: unknown;
		thinkingLevelMap?: unknown;
		serviceTiers?: unknown;
	};
}

interface ModelsResponse {
	data?: EndpointModel[];
}

interface AuthFile {
	[provider: string]: { type?: string; key?: string } | undefined;
}

interface ModelsFile {
	providers?: Record<string, unknown>;
}

function positiveInteger(value: unknown, field: string, model: string): number {
	if (!Number.isSafeInteger(value) || (value as number) <= 0) {
		throw new Error(`${model}: invalid ${field}`);
	}
	return value as number;
}

const THINKING_LEVEL_KEYS = ["off", "minimal", "low", "medium", "high", "xhigh", "max", "ultra"] as const;
function parseThinkingLevelMap(value: unknown): ThinkingLevelMap | undefined {
	if (value === undefined || value === null) return undefined;
	if (typeof value !== "object" || value === null || Array.isArray(value)) {
		throw new Error("endpoint returned invalid thinkingLevelMap");
	}

	const map: ThinkingLevelMap = {};
	for (const [key, mapped] of Object.entries(value)) {
		if (
			!(THINKING_LEVEL_KEYS as readonly string[]).includes(key) ||
			(typeof mapped !== "string" && mapped !== null)
		) {
			throw new Error("endpoint returned invalid thinkingLevelMap");
		}
		map[key as (typeof THINKING_LEVEL_KEYS)[number]] = mapped;
	}
	return map;
}

function inferThinkingLevelMap(id: string, thinkingFormat: unknown): ThinkingLevelMap | undefined {
	const normalizedId = id.toLowerCase();
	if (thinkingFormat === "deepseek" && normalizedId.includes("deepseek-v4")) {
		return { minimal: null, low: null, medium: null, high: "high", xhigh: null, max: "max" };
	}
	if (thinkingFormat === "openai" && normalizedId.includes("gpt-5.6")) {
		return { xhigh: "xhigh", max: "max" };
	}
	switch (thinkingFormat) {
		case "claude-adaptive":
			return { minimal: null, xhigh: null, max: "max" };
		case "claude-budget":
			return { xhigh: "xhigh", max: "max" };
		case "gemini-level":
			return { minimal: "minimal", xhigh: null, max: null };
		case "gemini-budget":
			return { minimal: null, xhigh: null, max: null };
		case "kimi":
			return { minimal: null, xhigh: null, max: "max" };
		case "minimax":
			return { minimal: null, low: null, medium: null, high: "high", xhigh: null, max: null };
		case "hunyuan":
		case "step":
			return { minimal: null, xhigh: null, max: null };
		case "zai":
			return { minimal: null, low: null, medium: null, high: "high", xhigh: null, max: null };
		default:
			return undefined;
	}
}

function parseThinkingFormat(value: unknown): OpenAICompletionsCompat["thinkingFormat"] | undefined {
	if (value === undefined || value === null) return undefined;
	if (typeof value !== "string" || value.length === 0) {
		throw new Error("endpoint returned invalid thinkingFormat");
	}
	return value;
}

function parseServiceTiers(value: unknown): string[] | undefined {
	if (value === undefined || value === null) return undefined;
	if (!Array.isArray(value) || value.some((tier) => typeof tier !== "string" || tier.length === 0)) {
		throw new Error("endpoint returned invalid serviceTiers");
	}
	return [...value];
}

function isLocalCodexResponsesModel(id: string): boolean {
	return /^cx\/gpt-5\.6(?:-|$)/i.test(id);
}

export function mapEndpointModels(response: ModelsResponse) {
	if (!Array.isArray(response.data) || response.data.length === 0) throw new Error("endpoint returned no models");

	const ids = new Set<string>();
	return response.data.map((entry) => {
		if (typeof entry.id !== "string" || entry.id.length === 0 || ids.has(entry.id)) {
			throw new Error("endpoint returned invalid or duplicate model ID");
		}
		ids.add(entry.id);
		const capabilities = entry.capabilities ?? {};
		const thinkingFormat = parseThinkingFormat(capabilities.thinkingFormat);
		const serviceTiers = parseServiceTiers(capabilities.serviceTiers);
		const fastCapable =
			isLocalCodexResponsesModel(entry.id) && (serviceTiers === undefined || serviceTiers.includes("priority"));
		const thinkingLevelMap =
			parseThinkingLevelMap(capabilities.thinkingLevelMap) ?? inferThinkingLevelMap(entry.id, thinkingFormat);
		const compat: OpenAICompletionsCompat | undefined = thinkingFormat
			? {
					thinkingFormat,
					// The local OpenAI-compatible endpoint accepts reasoning_effort
					// and 9router translates it to the advertised native format.
					supportsReasoningEffort: true,
					...(typeof capabilities.thinkingCanDisable === "boolean"
						? { thinkingCanDisable: capabilities.thinkingCanDisable }
						: {}),
				}
			: undefined;
		return {
			id: entry.id,
			name: entry.id,
			api: fastCapable ? "openai-responses" : "openai-completions",
			reasoning: capabilities.reasoning === true,
			input: capabilities.vision === true ? ["text", "image"] : ["text"],
			contextWindow: positiveInteger(capabilities.contextWindow, "contextWindow", entry.id),
			maxTokens: positiveInteger(capabilities.maxOutput, "maxOutput", entry.id),
			...(serviceTiers ? { serviceTiers } : fastCapable ? { serviceTiers: ["priority"] } : {}),
			...(thinkingLevelMap ? { thinkingLevelMap } : {}),
			...(compat ? { compat } : {}),
			cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
		};
	});
}

export async function refreshLocalModels(
	agentDir: string,
): Promise<{ updated: boolean; count?: number; error?: string }> {
	try {
		const authPath = join(agentDir, "auth.json");
		const modelsPath = join(agentDir, "models.json");
		const auth = JSON.parse(await readFile(authPath, "utf8")) as AuthFile;
		const apiKey = auth[PROVIDER]?.key;
		if (!apiKey) throw new Error(`missing ${PROVIDER} API key in ${authPath}`);

		const response = await fetch(`${BASE_URL}/models`, {
			headers: { Authorization: `Bearer ${apiKey}` },
			signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
		});
		if (!response.ok) throw new Error(`model endpoint returned HTTP ${response.status}`);
		const models = mapEndpointModels((await response.json()) as ModelsResponse);

		let config: ModelsFile = {};
		try {
			config = JSON.parse(await readFile(modelsPath, "utf8")) as ModelsFile;
		} catch (error) {
			if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
		}
		config.providers ??= {};
		config.providers[PROVIDER] = {
			baseUrl: BASE_URL,
			api: "openai-completions",
			apiKey: "PIV_LOCAL_API_KEY",
			authHeader: true,
			models,
		};

		process.env.PIV_LOCAL_API_KEY = apiKey;
		const temporaryPath = join(dirname(modelsPath), `.models.json.piv-${process.pid}`);
		await writeFile(temporaryPath, `${JSON.stringify(config, null, 2)}\n`, { mode: 0o600 });
		await rename(temporaryPath, modelsPath);
		return { updated: true, count: models.length };
	} catch (error) {
		return { updated: false, error: error instanceof Error ? error.message : String(error) };
	}
}

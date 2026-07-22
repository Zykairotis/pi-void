import { readFile, rename, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";

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

export function mapEndpointModels(response: ModelsResponse) {
	if (!Array.isArray(response.data) || response.data.length === 0) throw new Error("endpoint returned no models");

	const ids = new Set<string>();
	return response.data.map((entry) => {
		if (typeof entry.id !== "string" || entry.id.length === 0 || ids.has(entry.id)) {
			throw new Error("endpoint returned invalid or duplicate model ID");
		}
		ids.add(entry.id);
		const capabilities = entry.capabilities ?? {};
		return {
			id: entry.id,
			name: entry.id,
			reasoning: capabilities.reasoning === true,
			input: capabilities.vision === true ? ["text", "image"] : ["text"],
			contextWindow: positiveInteger(capabilities.contextWindow, "contextWindow", entry.id),
			maxTokens: positiveInteger(capabilities.maxOutput, "maxOutput", entry.id),
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

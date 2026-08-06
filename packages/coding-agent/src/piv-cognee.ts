import { createHash, randomUUID } from "node:crypto";
import { chmod, mkdir, readdir, readFile, rename, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import type { CogneeClientConfig } from "./piv-cognee-client.ts";

export type AutoRememberMode = "off" | "compaction";

export interface PivCogneeConfig extends Omit<CogneeClientConfig, "maxResponseChars"> {
	enabled: boolean;
	autoRecall: boolean;
	autoRemember: AutoRememberMode;
	recallMaxChars: number;
	rememberMaxChars: number;
	queueLimit: number;
	maxResponseChars: number;
}

export const DEFAULT_PIV_COGNEE_CONFIG: PivCogneeConfig = {
	enabled: true,
	autoRecall: true,
	autoRemember: "compaction",
	baseUrl: "http://127.0.0.1:8211",
	dataset: "pi-void",
	recallBudgetMs: 1500,
	recallMaxChars: 6000,
	rememberMaxChars: 12000,
	queueLimit: 64,
	maxResponseChars: 6000,
};

export interface PendingRemember {
	operationId: string;
	contentHash: string;
	dataset: string;
	nodeSet: string;
	createdAt: number;
	state: "pending" | "uncertain";
	text: string;
}

export interface CircuitState {
	failures: number;
	openUntil: number;
	lastError?: string;
}

const CIRCUIT_FAILURE_LIMIT = 3;
const CIRCUIT_COOLDOWN_MS = 30_000;

function isRecord(value: unknown): value is Record<string, unknown> {
	return value !== null && typeof value === "object";
}

function parseBoolean(value: unknown, name: string): boolean | undefined {
	if (value === undefined) return undefined;
	if (typeof value === "boolean") return value;
	if (value === "1" || value === "true") return true;
	if (value === "0" || value === "false") return false;
	throw new Error(`${name} must be true, false, 1, or 0`);
}

function parsePositiveInteger(value: unknown, name: string, minimum: number, maximum: number): number | undefined {
	if (value === undefined) return undefined;
	const parsed = typeof value === "number" ? value : Number(value);
	if (!Number.isInteger(parsed) || parsed < minimum || parsed > maximum) {
		throw new Error(`${name} must be an integer from ${minimum} to ${maximum}`);
	}
	return parsed;
}

function parseUrl(value: unknown, name: string): string | undefined {
	if (value === undefined) return undefined;
	if (typeof value !== "string" || value.trim() === "") throw new Error(`${name} must be a nonempty URL`);
	try {
		const url = new URL(value);
		if (url.protocol !== "http:" && url.protocol !== "https:") throw new Error("unsupported protocol");
	} catch {
		throw new Error(`${name} must be an HTTP or HTTPS URL`);
	}
	return value.trim().replace(/\/$/, "");
}

function parseDataset(value: unknown, name: string): string | undefined {
	if (value === undefined) return undefined;
	if (typeof value !== "string" || !/^[A-Za-z0-9._-]{1,128}$/.test(value.trim())) {
		throw new Error(`${name} must contain 1-128 letters, numbers, dots, underscores, or hyphens`);
	}
	return value.trim();
}

export function resolvePivCogneeConfig(stored: unknown, env: NodeJS.ProcessEnv = process.env): PivCogneeConfig {
	const source = isRecord(stored) ? stored : {};
	const enabled = parseBoolean(env.PI_COGNEE_ENABLED, "PI_COGNEE_ENABLED") ?? parseBoolean(source.enabled, "enabled");
	const autoRecall =
		parseBoolean(env.PI_COGNEE_RECALL, "PI_COGNEE_RECALL") ?? parseBoolean(source.autoRecall, "autoRecall");
	const rememberValue = env.PI_COGNEE_REMEMBER ?? source.autoRemember;
	const autoRemember =
		rememberValue === undefined
			? undefined
			: rememberValue === "off" || rememberValue === "compaction"
				? rememberValue
				: undefined;
	if (rememberValue !== undefined && autoRemember === undefined) {
		throw new Error("PI_COGNEE_REMEMBER must be off or compaction");
	}

	const baseUrl = parseUrl(env.PI_COGNEE_BASE_URL ?? env.COGNEE_BASE_URL ?? source.baseUrl, "PI_COGNEE_BASE_URL");
	const dataset = parseDataset(env.PI_COGNEE_DATASET ?? source.dataset, "PI_COGNEE_DATASET");
	const recallBudgetMs = parsePositiveInteger(source.recallBudgetMs, "recallBudgetMs", 100, 30_000);
	const recallMaxChars = parsePositiveInteger(source.recallMaxChars, "recallMaxChars", 256, 100_000);
	const rememberMaxChars = parsePositiveInteger(source.rememberMaxChars, "rememberMaxChars", 256, 200_000);
	const queueLimit = parsePositiveInteger(source.queueLimit, "queueLimit", 1, 10_000);

	return {
		...DEFAULT_PIV_COGNEE_CONFIG,
		...(enabled === undefined ? {} : { enabled }),
		...(autoRecall === undefined ? {} : { autoRecall }),
		...(autoRemember === undefined ? {} : { autoRemember }),
		...(baseUrl === undefined ? {} : { baseUrl }),
		...(dataset === undefined ? {} : { dataset }),
		...(recallBudgetMs === undefined ? {} : { recallBudgetMs }),
		...(recallMaxChars === undefined ? {} : { recallMaxChars, maxResponseChars: recallMaxChars }),
		...(rememberMaxChars === undefined ? {} : { rememberMaxChars }),
		...(queueLimit === undefined ? {} : { queueLimit }),
	};
}

export function resolveCogneeApiKey(
	env: NodeJS.ProcessEnv,
	cachedText?: string,
	expectedBaseUrl?: string,
): string | undefined {
	const environmentKey = env.COGNEE_API_KEY?.trim();
	if (environmentKey) return environmentKey;
	if (!cachedText) return undefined;
	try {
		const parsed: unknown = JSON.parse(cachedText);
		if (!isRecord(parsed) || typeof parsed.api_key !== "string" || parsed.api_key.trim() === "") return undefined;
		if (expectedBaseUrl && typeof parsed.base_url === "string") {
			if (new URL(parsed.base_url).origin !== new URL(expectedBaseUrl).origin) return undefined;
		}
		return parsed.api_key.trim();
	} catch {
		return undefined;
	}
}

export function redactMemoryText(text: string, maxChars: number): string {
	if (maxChars <= 0) return "";
	const redacted = text
		.replace(/Bearer\s+[^\s"'`]+/gi, "Bearer [REDACTED]")
		.replace(/(api[_-]?key|token|secret|password|authorization)\s*[:=]\s*["']?[^\s"'`]+/gi, "$1=[REDACTED]");
	return redacted.slice(0, maxChars);
}

export function createPendingRemember(
	text: string,
	dataset: string,
	nodeSet: string,
	createdAt = Date.now(),
): PendingRemember {
	const contentHash = createHash("sha256").update(text).digest("hex");
	return {
		operationId: `${createdAt}-${contentHash.slice(0, 16)}`,
		contentHash,
		dataset,
		nodeSet,
		createdAt,
		state: "pending",
		text,
	};
}

export async function enqueuePendingRemember(
	directory: string,
	record: PendingRemember,
	limit: number,
): Promise<boolean> {
	await mkdir(directory, { recursive: true, mode: 0o700 });
	await chmod(directory, 0o700);
	const files = await readdir(directory);
	const filename = `${record.operationId}.json`;
	if (files.includes(filename)) return true;
	if (files.filter((file) => file.endsWith(".json")).length >= limit) return false;
	const target = join(directory, filename);
	const temporary = `${target}.${randomUUID()}.tmp`;
	await writeFile(temporary, `${JSON.stringify(record)}\n`, { mode: 0o600 });
	await chmod(temporary, 0o600);
	await rename(temporary, target);
	return true;
}

export async function readPendingRemember(directory: string): Promise<PendingRemember[]> {
	let files: string[];
	try {
		files = await readdir(directory);
	} catch {
		return [];
	}
	const records: PendingRemember[] = [];
	for (const file of files.filter((name) => name.endsWith(".json")).sort()) {
		try {
			const parsed: unknown = JSON.parse(await readFile(join(directory, file), "utf8"));
			if (
				isRecord(parsed) &&
				typeof parsed.operationId === "string" &&
				typeof parsed.contentHash === "string" &&
				typeof parsed.dataset === "string" &&
				typeof parsed.nodeSet === "string" &&
				typeof parsed.createdAt === "number" &&
				(parsed.state === "pending" || parsed.state === "uncertain") &&
				typeof parsed.text === "string"
			) {
				records.push(parsed as unknown as PendingRemember);
			}
		} catch {}
	}
	return records;
}

export async function loadPivCogneeConfig(
	configPath: string,
	env: NodeJS.ProcessEnv = process.env,
): Promise<PivCogneeConfig> {
	let stored: unknown;
	try {
		stored = JSON.parse(await readFile(configPath, "utf8")) as unknown;
	} catch {
		stored = undefined;
	}
	return resolvePivCogneeConfig(stored, env);
}

export async function savePivCogneeConfig(configPath: string, config: PivCogneeConfig): Promise<void> {
	await mkdir(dirname(configPath), { recursive: true, mode: 0o700 });
	await chmod(dirname(configPath), 0o700);
	const persisted = {
		enabled: config.enabled,
		autoRecall: config.autoRecall,
		autoRemember: config.autoRemember,
		baseUrl: config.baseUrl,
		dataset: config.dataset,
		recallBudgetMs: config.recallBudgetMs,
		recallMaxChars: config.recallMaxChars,
		rememberMaxChars: config.rememberMaxChars,
		queueLimit: config.queueLimit,
	};
	const temporary = `${configPath}.${randomUUID()}.tmp`;
	await writeFile(temporary, `${JSON.stringify(persisted, null, 2)}\n`, { mode: 0o600 });
	await chmod(temporary, 0o600);
	await rename(temporary, configPath);
}

export function createCircuitState(): CircuitState {
	return { failures: 0, openUntil: 0 };
}

export function canAttemptCircuit(state: CircuitState, now = Date.now()): boolean {
	return state.openUntil <= now;
}

export function noteCircuitFailure(state: CircuitState, error: string, now = Date.now()): CircuitState {
	const failures = state.failures + 1;
	return {
		failures,
		openUntil: failures >= CIRCUIT_FAILURE_LIMIT ? now + CIRCUIT_COOLDOWN_MS : state.openUntil,
		lastError: error,
	};
}

export function resetCircuitState(): CircuitState {
	return createCircuitState();
}

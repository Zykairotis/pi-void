import { mkdir, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { BENCHMARK_TARGET_IDS, type BenchmarkTargetId } from "./manifest.ts";

export interface BenchmarkResult {
	schemaVersion: 1;
	runId: string;
	implementation: BenchmarkTargetId;
	resolvedCommit: string;
	provider: string;
	model: string;
	scenarioId: string;
	repeatIndex: number;
	startedAt: string;
	wallMs: number;
	success: boolean;
	verificationStatus?: string;
	failureCode?: string;
	attempts?: number;
	observedOutputBytes?: number;
	inputTokens?: number;
	outputTokens?: number;
	cost?: number;
}

const FULL_SHA_PATTERN = /^[0-9a-f]{40}$/;
const SAFE_ID_PATTERN = /^[A-Za-z0-9._-]+$/;
const ROUTE_PATTERN = /^[A-Za-z0-9._:/-]+$/;
const MAX_ID_LENGTH = 200;
const MAX_STATUS_LENGTH = 128;

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null;
}

function requireString(value: unknown, field: string, maxLength: number): string {
	if (typeof value !== "string" || value.length === 0 || value.length > maxLength) {
		throw new Error(`${field} must be a non-empty bounded string`);
	}
	return value;
}

function optionalString(value: unknown, field: string): string | undefined {
	if (value === undefined) return undefined;
	return requireString(value, field, MAX_STATUS_LENGTH);
}

function requireNonNegativeNumber(value: unknown, field: string): number {
	if (typeof value !== "number" || !Number.isFinite(value) || value < 0) {
		throw new Error(`${field} must be a non-negative number`);
	}
	return value;
}

function optionalNonNegativeNumber(value: unknown, field: string): number | undefined {
	if (value === undefined) return undefined;
	return requireNonNegativeNumber(value, field);
}

function requireNonNegativeInteger(value: unknown, field: string): number {
	if (typeof value !== "number" || !Number.isInteger(value) || value < 0) {
		throw new Error(`${field} must be a non-negative integer`);
	}
	return value;
}

function optionalNonNegativeInteger(value: unknown, field: string): number | undefined {
	if (value === undefined) return undefined;
	return requireNonNegativeInteger(value, field);
}

function isTargetId(value: unknown): value is BenchmarkTargetId {
	return typeof value === "string" && BENCHMARK_TARGET_IDS.includes(value as BenchmarkTargetId);
}

export function normalizeBenchmarkResult(value: unknown): BenchmarkResult {
	if (!isRecord(value) || value.schemaVersion !== 1) throw new Error("invalid benchmark result schema");
	const runId = requireString(value.runId, "runId", MAX_ID_LENGTH);
	const scenarioId = requireString(value.scenarioId, "scenarioId", MAX_ID_LENGTH);
	if (!SAFE_ID_PATTERN.test(runId) || !SAFE_ID_PATTERN.test(scenarioId)) {
		throw new Error("runId and scenarioId contain unsupported characters");
	}
	if (!isTargetId(value.implementation)) throw new Error("invalid benchmark implementation");
	if (typeof value.resolvedCommit !== "string" || !FULL_SHA_PATTERN.test(value.resolvedCommit)) {
		throw new Error("resolvedCommit must be a full commit SHA");
	}
	const provider = requireString(value.provider, "provider", MAX_ID_LENGTH);
	const model = requireString(value.model, "model", MAX_ID_LENGTH);
	if (!ROUTE_PATTERN.test(provider) || !ROUTE_PATTERN.test(model)) throw new Error("provider and model contain unsupported characters");
	if (typeof value.repeatIndex !== "number" || !Number.isInteger(value.repeatIndex) || value.repeatIndex < 1) {
		throw new Error("repeatIndex must be a positive integer");
	}
	if (typeof value.startedAt !== "string" || !Number.isFinite(Date.parse(value.startedAt))) {
		throw new Error("startedAt must be an ISO timestamp");
	}
	const wallMs = requireNonNegativeNumber(value.wallMs, "wallMs");
	if (typeof value.success !== "boolean") throw new Error("success must be a boolean");
	const attempts = optionalNonNegativeInteger(value.attempts, "attempts");
	const observedOutputBytes = optionalNonNegativeInteger(value.observedOutputBytes, "observedOutputBytes");
	const inputTokens = optionalNonNegativeInteger(value.inputTokens, "inputTokens");
	const outputTokens = optionalNonNegativeInteger(value.outputTokens, "outputTokens");
	const cost = optionalNonNegativeNumber(value.cost, "cost");
	return {
		schemaVersion: 1,
		runId,
		implementation: value.implementation,
		resolvedCommit: value.resolvedCommit,
		provider,
		model,
		scenarioId,
		repeatIndex: value.repeatIndex,
		startedAt: value.startedAt,
		wallMs,
		success: value.success,
		verificationStatus: optionalString(value.verificationStatus, "verificationStatus"),
		failureCode: optionalString(value.failureCode, "failureCode"),
		attempts,
		observedOutputBytes,
		inputTokens,
		outputTokens,
		cost,
	};
}

export async function writeJsonl(filePath: string, results: readonly unknown[]): Promise<void> {
	const rows = results.map((result) => JSON.stringify(normalizeBenchmarkResult(result)));
	const outputPath = resolve(filePath);
	await mkdir(dirname(outputPath), { recursive: true });
	await writeFile(outputPath, rows.length === 0 ? "" : `${rows.join("\n")}\n`, "utf8");
}

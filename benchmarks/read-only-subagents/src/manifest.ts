import { readFileSync } from "node:fs";
import { resolve } from "node:path";

export const BENCHMARK_TARGET_IDS = ["pi-stock", "pi-native-example", "pi-subagents", "pi-void"] as const;
export type BenchmarkTargetId = (typeof BENCHMARK_TARGET_IDS)[number];

export const PENDING_EXTERNAL_BASELINE = "PENDING_EXTERNAL_BASELINE";
export const CURRENT_WORKSPACE = "CURRENT_WORKSPACE";

export type BenchmarkTargetStatus = "current_workspace" | "unavailable_until_pinned";

export interface BenchmarkTargetSource {
	repo?: string;
	commit: string;
	subdir?: string;
}

export interface BenchmarkTarget {
	id: BenchmarkTargetId;
	source: BenchmarkTargetSource;
	localPath?: string;
	status?: BenchmarkTargetStatus;
}

export interface BenchmarkExecutionConfig {
	provider: string;
	model: string;
	apiKeyEnv: string;
	baseUrl: string;
	api: "openai-completions" | "openai-responses";
	contextWindow: number;
	maxTokens: number;
	reasoning: boolean;
	input: readonly ("text" | "image")[];
}

export interface BenchmarkManifest {
	schemaVersion: 1;
	executions: BenchmarkExecutionConfig[];
	targets: BenchmarkTarget[];
}

const FULL_SHA_PATTERN = /^[0-9a-f]{40}$/;
const PROVIDER_PATTERN = /^[a-z0-9][a-z0-9-]*$/;
const MODEL_PATTERN = /^[A-Za-z0-9._:/-]+$/;
const API_KEY_ENV_PATTERN = /^[A-Z][A-Z0-9_]*$/;

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null;
}

function isTargetId(value: unknown): value is BenchmarkTargetId {
	return typeof value === "string" && BENCHMARK_TARGET_IDS.includes(value as BenchmarkTargetId);
}

function isStatus(value: unknown): value is BenchmarkTargetStatus {
	return value === "current_workspace" || value === "unavailable_until_pinned";
}

function validateExecution(value: unknown): BenchmarkExecutionConfig {
	if (!isRecord(value)) throw new Error("invalid benchmark execution configuration");
	if (typeof value.provider !== "string" || !PROVIDER_PATTERN.test(value.provider) || value.provider === "local") {
		throw new Error("invalid benchmark execution provider");
	}
	if (typeof value.model !== "string" || !MODEL_PATTERN.test(value.model)) {
		throw new Error("invalid benchmark execution model");
	}
	if (typeof value.apiKeyEnv !== "string" || !API_KEY_ENV_PATTERN.test(value.apiKeyEnv)) {
		throw new Error("invalid benchmark execution credential environment");
	}
	if (typeof value.baseUrl !== "string" || !/^https?:\/\//.test(value.baseUrl)) {
		throw new Error("invalid benchmark execution base URL");
	}
	if (value.api !== "openai-completions" && value.api !== "openai-responses") {
		throw new Error("invalid benchmark execution API");
	}
	if (
		typeof value.contextWindow !== "number" || !Number.isInteger(value.contextWindow) || value.contextWindow < 1 ||
		typeof value.maxTokens !== "number" || !Number.isInteger(value.maxTokens) || value.maxTokens < 1 ||
		typeof value.reasoning !== "boolean" || !Array.isArray(value.input) || value.input.length === 0 ||
		value.input.some((input) => input !== "text" && input !== "image")
	) {
		throw new Error("invalid benchmark execution model metadata");
	}
	const input = value.input as ("text" | "image")[];
	return {
		provider: value.provider,
		model: value.model,
		apiKeyEnv: value.apiKeyEnv,
		baseUrl: value.baseUrl,
		api: value.api,
		contextWindow: value.contextWindow,
		maxTokens: value.maxTokens,
		reasoning: value.reasoning,
		input,
	};
}

function validateCommit(targetId: string, commit: unknown, status: BenchmarkTargetStatus | undefined): string {
	if (typeof commit !== "string") throw new Error(`invalid commit for ${targetId}`);
	if (commit === PENDING_EXTERNAL_BASELINE) {
		if (status !== "unavailable_until_pinned") {
			throw new Error(`pending baseline must be marked unavailable for ${targetId}`);
		}
		return commit;
	}
	if (FULL_SHA_PATTERN.test(commit) || commit === CURRENT_WORKSPACE) return commit;
	throw new Error(`invalid commit for ${targetId}`);
}

export function validateTarget(value: unknown): BenchmarkTarget {
	if (!isRecord(value) || !isTargetId(value.id) || !isRecord(value.source)) {
		throw new Error("invalid benchmark target");
	}
	const status = value.status;
	if (status !== undefined && !isStatus(status)) throw new Error(`invalid status for ${value.id}`);
	const commit = validateCommit(value.id, value.source.commit, status);
	if (commit === CURRENT_WORKSPACE && value.id !== "pi-void") {
		throw new Error(`current workspace sentinel is only valid for pi-void`);
	}
	if (value.id === "pi-void" && commit !== CURRENT_WORKSPACE) {
		throw new Error("pi-void must use the current workspace sentinel");
	}
	if (value.source.repo !== undefined && typeof value.source.repo !== "string") {
		throw new Error(`invalid repository for ${value.id}`);
	}
	if (value.source.subdir !== undefined && typeof value.source.subdir !== "string") {
		throw new Error(`invalid subdir for ${value.id}`);
	}
	if (value.localPath !== undefined && typeof value.localPath !== "string") {
		throw new Error(`invalid local path for ${value.id}`);
	}
	return {
		id: value.id,
		source: {
			repo: value.source.repo,
			commit,
			subdir: value.source.subdir,
		},
		localPath: value.localPath,
		status,
	};
}

export function validateManifest(value: unknown): BenchmarkManifest {
	if (!isRecord(value) || value.schemaVersion !== 1 || !Array.isArray(value.executions) || !Array.isArray(value.targets)) {
		throw new Error("invalid benchmark manifest");
	}
	if (value.executions.length === 0) throw new Error("benchmark manifest requires an execution route");
	const executions = value.executions.map(validateExecution);
	const seen = new Set<BenchmarkTargetId>();
	const targets = value.targets.map((target) => {
		const validated = validateTarget(target);
		if (seen.has(validated.id)) throw new Error(`duplicate target id: ${validated.id}`);
		seen.add(validated.id);
		return validated;
	});
	for (const id of BENCHMARK_TARGET_IDS) {
		if (!seen.has(id)) throw new Error(`missing target id: ${id}`);
	}
	return { schemaVersion: 1, executions, targets };
}

export function loadManifest(filePath: string): BenchmarkManifest {
	return validateManifest(JSON.parse(readFileSync(resolve(filePath), "utf8")));
}

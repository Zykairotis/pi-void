import { existsSync, realpathSync, statSync } from "node:fs";
import { isAbsolute, relative, resolve } from "node:path";
import {
	CURRENT_WORKSPACE,
	PENDING_EXTERNAL_BASELINE,
	type BenchmarkExecutionConfig,
	type BenchmarkTarget,
	type BenchmarkTargetId,
} from "./manifest.ts";
import { resolveGitHead } from "./git.ts";
import type { BenchmarkScenario } from "./scenarios.ts";

export interface BenchmarkContext {
	workspacePath: string;
	execution: BenchmarkExecutionConfig;
	externalCheckouts?: Partial<Record<BenchmarkTargetId, string>>;
	hostCheckoutPath?: string;
	hostCommit?: string;
}

export interface PreparedTarget {
	id: BenchmarkTargetId;
	checkoutPath: string;
	sourcePath: string;
	resolvedCommit: string;
	execution: BenchmarkExecutionConfig;
	runtimePath?: string;
}

export interface BenchmarkObservation {
	success: boolean;
	verificationStatus?: string;
	failureCode?: string;
	attempts?: number;
	observedOutputBytes?: number;
	inputTokens?: number;
	outputTokens?: number;
	cost?: number;
}

export interface BenchmarkTargetAdapter {
	id: BenchmarkTargetId;

	prepare(context: BenchmarkContext, target: BenchmarkTarget): Promise<PreparedTarget>;

	run(target: PreparedTarget, scenario: BenchmarkScenario): Promise<BenchmarkObservation>;
}

export class BenchmarkTargetUnavailableError extends Error {
	readonly code = "target_unavailable";
	readonly targetId: BenchmarkTargetId;
	readonly expectedCommit: string;

	constructor(targetId: BenchmarkTargetId, expectedCommit: string) {
		super(`benchmark target ${targetId}@${expectedCommit} unavailable`);
		this.name = "BenchmarkTargetUnavailableError";
		this.targetId = targetId;
		this.expectedCommit = expectedCommit;
	}
}

function targetUnavailable(target: BenchmarkTarget): BenchmarkTargetUnavailableError {
	return new BenchmarkTargetUnavailableError(target.id, target.source.commit);
}

function getCheckoutPath(context: BenchmarkContext, target: BenchmarkTarget): string {
	if (target.id === "ice") return resolve(context.workspacePath);
	const candidate = target.localPath ?? context.externalCheckouts?.[target.id];
	if (candidate === undefined) throw targetUnavailable(target);
	return resolve(context.workspacePath, candidate);
}

function resolveSourcePath(checkoutPath: string, subdir: string | undefined, target: BenchmarkTarget): string {
	const rootPath = resolve(checkoutPath);
	const sourcePath = resolve(rootPath, subdir ?? ".");
	const relativePath = relative(rootPath, sourcePath);
	if (
		isAbsolute(relativePath) ||
		relativePath === ".." ||
		relativePath.startsWith(`..${"/"}`) ||
		relativePath.startsWith(`..${"\\"}`)
	) {
		throw targetUnavailable(target);
	}
	if (!existsSync(sourcePath) || !statSync(sourcePath).isDirectory()) throw targetUnavailable(target);
	let realRootPath: string;
	let realSourcePath: string;
	try {
		realRootPath = realpathSync(rootPath);
		realSourcePath = realpathSync(sourcePath);
	} catch {
		throw targetUnavailable(target);
	}
	const realRelativePath = relative(realRootPath, realSourcePath);
	if (
		isAbsolute(realRelativePath) ||
		realRelativePath === ".." ||
		realRelativePath.startsWith(`..${"/"}`) ||
		realRelativePath.startsWith(`..${"\\"}`)
	) {
		throw targetUnavailable(target);
	}
	return realSourcePath;
}

async function prepareResolvedTarget(context: BenchmarkContext, target: BenchmarkTarget): Promise<PreparedTarget> {
	if (target.source.commit === PENDING_EXTERNAL_BASELINE) throw targetUnavailable(target);
	const checkoutPath = getCheckoutPath(context, target);
	if (!existsSync(checkoutPath) || !statSync(checkoutPath).isDirectory()) throw targetUnavailable(target);
	let resolvedCommit: string;
	try {
		resolvedCommit = resolveGitHead(checkoutPath);
	} catch {
		throw targetUnavailable(target);
	}
	if (target.source.commit !== CURRENT_WORKSPACE && target.source.commit !== resolvedCommit) {
		throw targetUnavailable(target);
	}
	return {
		id: target.id,
		checkoutPath,
		sourcePath: resolveSourcePath(checkoutPath, target.source.subdir, target),
		resolvedCommit,
		execution: context.execution,
	};
}

export function createUnavailableAdapter(id: BenchmarkTargetId): BenchmarkTargetAdapter {
	return {
		id,
		prepare: prepareResolvedTarget,
		run: async () => ({
			success: false,
			verificationStatus: "not_run",
			failureCode: "adapter_unavailable",
		}),
	};
}

export async function prepareTarget(target: BenchmarkTarget, context: BenchmarkContext): Promise<PreparedTarget> {
	return prepareResolvedTarget(context, target);
}

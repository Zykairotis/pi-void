import { execFileSync, spawn } from "node:child_process";
import { createHash, randomUUID } from "node:crypto";
import { mkdir, readdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { performance } from "node:perf_hooks";
import { fileURLToPath } from "node:url";
import {
	createFixtureWorkspace,
	removeFixtureWorkspace,
	runNativeFixture,
	syntheticTrace,
} from "./fixture.ts";
import {
	type Backend,
	type BenchmarkKind,
	canonicalTrace,
	type FixtureResult,
	type ResourceSnapshot,
	type RunManifest,
	type RunMode,
	type SampleRecord,
	type WorkloadId,
} from "./types.ts";

const artifactRoot = resolve(process.cwd(), ".artifacts", "m12");
const workerPath = join(dirname(fileURLToPath(import.meta.url)), "worker.ts");
const KNOWN_CHECK =
	"packages/ai/test/openai-completions-tool-choice.test.ts:1410 maxTokensField";

function currentGitSha(): string {
	return execFileSync("git", ["rev-parse", "HEAD"], {
		encoding: "utf8",
	}).trim();
}

function currentDirty(): boolean {
	return (
		execFileSync("git", ["status", "--porcelain=v1", "-uall"], {
			encoding: "utf8",
		}).trim().length > 0
	);
}

interface WorkerEnvelope {
	result: FixtureResult;
	endRssBytes: number | null;
	cancelLatencyMs?: number;
}

interface BackendExecution {
	result: FixtureResult;
	startupMs: number;
	endRssBytes: number | null;
	resourceBefore: ResourceSnapshot;
	resourceAfter: ResourceSnapshot;
	orphanProcessCount: number;
	orphanTaskCount: number;
	cancelLatencyMs?: number;
}

async function settleResources(): Promise<void> {
	for (let index = 0; index < 3; index += 1) {
		await new Promise<void>((resolveExit) => setImmediate(resolveExit));
		await new Promise<void>((resolveExit) => setTimeout(resolveExit, 0));
	}
}

async function resourceSnapshot(): Promise<ResourceSnapshot> {
	let processCount = 1;
	try {
		processCount = (await readdir("/proc")).filter((entry) =>
			/^\d+$/.test(entry),
		).length;
	} catch {
		// Non-Linux hosts do not expose /proc; the active-resource check still applies.
	}
	return {
		rssBytes: process.memoryUsage().rss,
		heapUsedBytes: process.memoryUsage().heapUsed,
		heapTotalBytes: process.memoryUsage().heapTotal,
		externalBytes: process.memoryUsage().external,
		activeResources: process.getActiveResourcesInfo?.() ?? [],
		processCount,
	};
}

function extraResourceCount(
	after: readonly string[],
	before: readonly string[],
): number {
	const counts = new Map<string, number>();
	for (const resource of before)
		counts.set(resource, (counts.get(resource) ?? 0) + 1);
	let extra = 0;
	for (const resource of after) {
		const count = counts.get(resource) ?? 0;
		if (count > 0) counts.set(resource, count - 1);
		else extra += 1;
	}
	return extra;
}

export interface BenchmarkOptions {
	kind: BenchmarkKind;
	mode: RunMode;
	repetitions: number;
	warmups: number;
	workloads: readonly WorkloadId[];
	seed: number;
}

function hashJson(value: unknown): string {
	return createHash("sha256").update(JSON.stringify(value)).digest("hex");
}

function isCancellation(workload: WorkloadId): boolean {
	return (
		workload === "cancel-before-tool-settle" ||
		workload === "cancel-during-tool"
	);
}

function isBeforeCancellation(workload: WorkloadId): boolean {
	return workload === "cancel-before-tool-settle";
}

function parseWorkerOutput(output: string): WorkerEnvelope {
	const line = output.trim().split("\n").at(-1);
	if (!line) throw new Error("subprocess returned no result");
	const parsed = JSON.parse(line) as WorkerEnvelope;
	if (
		!parsed.result ||
		(typeof parsed.endRssBytes !== "number" && parsed.endRssBytes !== null)
	) {
		throw new Error("subprocess returned malformed result");
	}
	return parsed;
}

async function runSubprocess(
	workload: WorkloadId,
	cwd: string,
): Promise<{
	result: FixtureResult;
	endRssBytes: number | null;
	startupMs: number;
	orphanProcessCount: number;
	cancelLatencyMs?: number;
}> {
	const started = performance.now();
	let firstOutputAt: number | undefined;
	const child = spawn(
		process.execPath,
		["--experimental-strip-types", workerPath, workload],
		{
			cwd,
			stdio: ["ignore", "pipe", "pipe"],
		},
	);
	let stdout = "";
	let stderr = "";
	let childClosed = false;
	child.stdout.setEncoding("utf8");
	child.stderr.setEncoding("utf8");
	child.stdout.on("data", (chunk: string) => {
		firstOutputAt ??= performance.now();
		stdout += chunk;
	});
	child.stderr.on("data", (chunk: string) => {
		stderr += chunk;
	});
	let cancelRequestedAt: number | undefined;
	const cancelTimer = isBeforeCancellation(workload)
		? setTimeout(() => {
				cancelRequestedAt = performance.now();
				child.kill("SIGTERM");
			}, 5)
		: undefined;
	const exit = await new Promise<{
		code: number | null;
		signal: NodeJS.Signals | null;
	}>((resolveExit, reject) => {
		child.once("error", reject);
		child.once("close", (code, signal) => {
			childClosed = true;
			resolveExit({ code, signal });
		});
	});
	if (cancelTimer) clearTimeout(cancelTimer);
	const startupMs = Math.max(0, (firstOutputAt ?? performance.now()) - started);
	if (isCancellation(workload) && exit.signal !== null) {
		return {
			result: {
				workload,
				status: "cancelled",
				events: syntheticTrace("subprocess", "cancelled"),
				result: JSON.stringify({ status: "cancelled" }),
			},
			endRssBytes: null,
			startupMs,
			orphanProcessCount: childClosed ? 0 : 1,
			...(cancelRequestedAt !== undefined
				? {
						cancelLatencyMs: Math.max(0, performance.now() - cancelRequestedAt),
					}
				: {}),
		};
	}
	if (workload === "process-fatal" && exit.code === 97) {
		return {
			result: {
				workload,
				status: "fatal",
				events: syntheticTrace("subprocess", "failed", true),
				result: JSON.stringify({ status: "fatal" }),
			},
			endRssBytes: null,
			startupMs,
			orphanProcessCount: childClosed ? 0 : 1,
		};
	}
	if (exit.code !== 0)
		throw new Error(
			stderr.trim() || `subprocess exited ${exit.code ?? exit.signal}`,
		);
	const envelope = parseWorkerOutput(stdout);
	return {
		...envelope,
		startupMs,
		orphanProcessCount: childClosed ? 0 : 1,
		...(envelope.cancelLatencyMs !== undefined
			? { cancelLatencyMs: envelope.cancelLatencyMs }
			: {}),
	};
}

async function runBackend(
	backend: Backend,
	workload: WorkloadId,
	cwd: string,
): Promise<BackendExecution> {
	await settleResources();
	const resourceBefore = await resourceSnapshot();
	const execution =
		backend === "subprocess"
			? await runSubprocess(workload, cwd)
			: await runNativeBackend(workload, cwd);
	await settleResources();
	const resourceAfter = await resourceSnapshot();
	return {
		...execution,
		resourceBefore,
		resourceAfter,
		orphanProcessCount: execution.orphanProcessCount,
		orphanTaskCount: extraResourceCount(
			resourceAfter.activeResources,
			resourceBefore.activeResources,
		),
	};
}

async function runNativeBackend(
	workload: WorkloadId,
	cwd: string,
): Promise<{
	result: FixtureResult;
	startupMs: number;
	endRssBytes: number;
	orphanProcessCount: number;
	cancelLatencyMs?: number;
}> {
	const controller = new AbortController();
	const started = performance.now();
	const cancelTimer = isBeforeCancellation(workload)
		? setTimeout(() => controller.abort(), 5)
		: undefined;
	let firstEventAt: number | undefined;
	let duringCancelTimer: NodeJS.Timeout | undefined;
	const result = await runNativeFixture(
		workload,
		cwd,
		controller.signal,
		() => {
			firstEventAt ??= performance.now();
			if (workload === "cancel-during-tool" && !duringCancelTimer)
				duringCancelTimer = setTimeout(() => controller.abort(), 5);
		},
		"native",
	);
	if (cancelTimer) clearTimeout(cancelTimer);
	if (duringCancelTimer) clearTimeout(duringCancelTimer);
	return {
		result,
		startupMs: Math.max(0, (firstEventAt ?? performance.now()) - started),
		endRssBytes: process.memoryUsage().rss,
		orphanProcessCount: 0,
		...(result.cancelLatencyMs !== undefined
			? { cancelLatencyMs: result.cancelLatencyMs }
			: {}),
	};
}

function sampleRecord(
	runId: string,
	backend: Backend,
	mode: RunMode,
	workload: WorkloadId,
	sample: number,
	started: number,
	execution: BackendExecution,
): SampleRecord {
	return {
		schemaVersion: 1,
		runId,
		backend,
		mode,
		workload,
		sample,
		...(execution.result.contract
			? { contract: execution.result.contract }
			: {}),
		elapsedMs: Math.max(0, performance.now() - started),
		startupMs: execution.startupMs,
		endRssBytes: execution.endRssBytes,
		childRssAvailable: execution.endRssBytes !== null,
		resultHash: hashJson(execution.result.result),
		traceHash: hashJson(canonicalTrace(execution.result.events)),
		status: execution.result.status,
		eventCount: execution.result.events.length,
		terminalEventCount: execution.result.events.filter(
			(event) => event.type === "terminal",
		).length,
		postTerminalEventCount: Math.max(
			0,
			execution.result.events.length -
				(execution.result.events.findIndex(
					(event) => event.type === "terminal",
				) +
					1),
		),
		tracePath: join("traces", `${workload}-${backend}-${sample}.json`),
		resourceBefore: execution.resourceBefore,
		resourceAfter: execution.resourceAfter,
		resourceDelta: {
			rssBytes:
				execution.resourceAfter.rssBytes - execution.resourceBefore.rssBytes,
			heapUsedBytes:
				execution.resourceAfter.heapUsedBytes -
				execution.resourceBefore.heapUsedBytes,
			heapTotalBytes:
				execution.resourceAfter.heapTotalBytes -
				execution.resourceBefore.heapTotalBytes,
			externalBytes:
				execution.resourceAfter.externalBytes -
				execution.resourceBefore.externalBytes,
			activeResources:
				execution.resourceAfter.activeResources.length -
				execution.resourceBefore.activeResources.length,
			processCount:
				execution.resourceAfter.processCount -
				execution.resourceBefore.processCount,
		},
		orphanProcessCount: execution.orphanProcessCount,
		orphanTaskCount: execution.orphanTaskCount,
		...(execution.cancelLatencyMs !== undefined
			? { cancelLatencyMs: execution.cancelLatencyMs }
			: {}),
		cleanup:
			execution.orphanProcessCount === 0 && execution.orphanTaskCount === 0
				? "clean"
				: "not_applicable",
		...(execution.result.error ? { error: execution.result.error } : {}),
	};
}

async function writeJson(path: string, value: unknown): Promise<void> {
	await mkdir(dirname(path), { recursive: true });
	await writeFile(path, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

async function writeJsonl(
	path: string,
	rows: readonly unknown[],
): Promise<void> {
	await mkdir(dirname(path), { recursive: true });
	await writeFile(
		path,
		`${rows.map((row) => JSON.stringify(row)).join("\n")}\n`,
		"utf8",
	);
}

function pairedOrder(seed: number, sample: number): readonly Backend[] {
	return (seed + sample) % 2 === 0
		? ["native", "subprocess"]
		: ["subprocess", "native"];
}

export async function runBenchmark(
	options: BenchmarkOptions,
): Promise<{ runId: string; records: SampleRecord[] }> {
	const runId = randomUUID();
	const manifest: RunManifest = {
		schemaVersion: 2,
		runId,
		gitSha: currentGitSha(),
		dirty: currentDirty(),
		kind: options.kind,
		seed: options.seed,
		mode: options.mode,
		repetitions: options.repetitions,
		warmups: options.warmups,
		workloads: options.workloads,
		backends: ["native", "subprocess"],
		knownCheck: KNOWN_CHECK,
	};
	const records: SampleRecord[] = [];
	const runDir = join(artifactRoot, runId);
	await writeJson(join(runDir, "manifest.json"), manifest);
	const totalSamples =
		options.mode === "warm"
			? options.warmups + options.repetitions
			: options.repetitions;
	for (const workload of options.workloads) {
		for (let sample = 1; sample <= totalSamples; sample += 1) {
			const cwd = await createFixtureWorkspace();
			try {
				for (const backend of pairedOrder(options.seed, sample)) {
					const started = performance.now();
					const execution = await runBackend(backend, workload, cwd);
					const record = sampleRecord(
						runId,
						backend,
						options.mode,
						workload,
						sample,
						started,
						execution,
					);
					await writeJson(
						join(runDir, record.tracePath),
						execution.result.events,
					);
					records.push(record);
				}
			} finally {
				await removeFixtureWorkspace(cwd);
			}
		}
	}
	await writeJsonl(join(runDir, "raw-performance.jsonl"), records);
	await writeJson(
		join(runDir, "resources", "results.json"),
		records.map((record) => ({
			runId: record.runId,
			backend: record.backend,
			workload: record.workload,
			sample: record.sample,
			before: record.resourceBefore,
			after: record.resourceAfter,
			delta: record.resourceDelta,
			orphanProcessCount: record.orphanProcessCount,
			orphanTaskCount: record.orphanTaskCount,
		})),
	);
	await writeJsonl(
		join(runDir, "resources", "process-before.jsonl"),
		records.map((record) => ({
			runId: record.runId,
			backend: record.backend,
			workload: record.workload,
			sample: record.sample,
			snapshot: record.resourceBefore,
		})),
	);
	await writeJsonl(
		join(runDir, "resources", "process-after.jsonl"),
		records.map((record) => ({
			runId: record.runId,
			backend: record.backend,
			workload: record.workload,
			sample: record.sample,
			snapshot: record.resourceAfter,
		})),
	);
	await writeJson(join(artifactRoot, "latest.json"), { runId });
	return { runId, records };
}

export async function readLatestRecords(
	runId?: string,
): Promise<{ manifest: RunManifest; records: SampleRecord[]; runDir: string }> {
	const pointer = runId
		? { runId }
		: (JSON.parse(
				await readFile(join(artifactRoot, "latest.json"), "utf8"),
			) as { runId: string });
	const runDir = join(artifactRoot, pointer.runId);
	const manifest = JSON.parse(
		await readFile(join(runDir, "manifest.json"), "utf8"),
	) as RunManifest;
	const lines = (await readFile(join(runDir, "raw-performance.jsonl"), "utf8"))
		.trim()
		.split("\n")
		.filter(Boolean);
	const records = lines.map((line) => JSON.parse(line) as SampleRecord);
	return { manifest, records, runDir };
}

export { KNOWN_CHECK, artifactRoot, hashJson };

import { strict as assert } from "node:assert";
import { execFileSync, spawnSync } from "node:child_process";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import {
	assertIceSubagentBackendPolicy,
	ICE_SUBAGENT_BACKEND_POLICY,
} from "../../../packages/coding-agent/src/ice-subagents.ts";
import {
	artifactRoot,
	KNOWN_CHECK,
	readLatestRecords,
	runBenchmark,
} from "./runner.ts";
import { pairedSummary, summarizeSamples } from "./stats.ts";
import {
	REQUIRED_CONTRACT_CHECKS,
	type RunMode,
	type SampleRecord,
	WORKLOADS,
	type WorkloadId,
} from "./types.ts";

const SEED = 1213;
const performanceWorkloads: readonly WorkloadId[] = [
	"bootstrap-exit",
	"single-result",
	"tool-roundtrip",
	"multi-event",
];
const safetyWorkloads: readonly WorkloadId[] = [
	"cancel-before-tool-settle",
	"cancel-during-tool",
	"execution-exception",
	"process-fatal",
];
const compatibilityWorkloads: readonly WorkloadId[] = [
	"resource-loader-matrix",
	"cli-contract-matrix",
];
const m12Workloads: Record<
	"performance" | "safety" | "compatibility",
	readonly WorkloadId[]
> = {
	performance: performanceWorkloads,
	safety: safetyWorkloads,
	compatibility: compatibilityWorkloads,
};
type NumericMetric = "elapsedMs" | "startupMs" | "endRssBytes";

function metricValue(
	record: SampleRecord,
	metric: NumericMetric,
): number | undefined {
	const value = record[metric];
	return typeof value === "number" ? value : undefined;
}

function summarizeMetric(
	records: readonly SampleRecord[],
	metric: NumericMetric,
): ReturnType<typeof summarizeSamples> | null {
	const values = records
		.map((record) => metricValue(record, metric))
		.filter((value): value is number => value !== undefined);
	return values.length > 0 ? summarizeSamples(values) : null;
}

function pairedMetric(
	nativeRecords: readonly SampleRecord[],
	subprocessRecords: readonly SampleRecord[],
	metric: NumericMetric,
): ReturnType<typeof pairedSummary> | null {
	const nativeValues: number[] = [];
	const subprocessValues: number[] = [];
	for (const native of nativeRecords) {
		const subprocess = subprocessRecords.find(
			(candidate) => candidate.sample === native.sample,
		);
		const nativeValue = metricValue(native, metric);
		const subprocessValue = subprocess
			? metricValue(subprocess, metric)
			: undefined;
		if (nativeValue !== undefined && subprocessValue !== undefined) {
			nativeValues.push(nativeValue);
			subprocessValues.push(subprocessValue);
		}
	}
	return nativeValues.length > 0
		? pairedSummary(nativeValues, subprocessValues, 10_000, SEED)
		: null;
}

function hasRequiredContract(
	record: SampleRecord,
	kind: keyof typeof REQUIRED_CONTRACT_CHECKS,
): boolean {
	return (
		record.contract?.kind === kind &&
		REQUIRED_CONTRACT_CHECKS[kind].every((check) =>
			record.contract?.checks.includes(check),
		)
	);
}

export interface AcceptanceTestEvidence {
	command: string;
	passed: number;
	total: number;
	exitCode: number;
}

export function parseVitestSummary(
	output: string,
	command: string,
	exitCode: number,
): AcceptanceTestEvidence {
	const match = output.match(
		/Tests\s+(?:(\d+)\s+failed\s+\|\s+)?(\d+)\s+passed\s+\((\d+)\)/,
	);
	return {
		command,
		passed: match ? Number(match[2]) : 0,
		total: match ? Number(match[3]) : 0,
		exitCode,
	};
}

const acceptanceCommands = {
	c1: [
		"test/ice-subagents.test.ts",
		"test/ice-subagents-adversarial.test.ts",
		"test/ice-safe-verify.test.ts",
		"test/ice-writer-w5.test.ts",
		"test/ice-subagent-jobs.test.ts",
		"test/ice-subagent-observatory.test.ts",
		"test/ice-delegate-mvp.test.ts",
	],
	c2: ["test/ice-subagents.test.ts", "test/ice-safe-verify.test.ts"],
	c3: ["test/ice-delegate-mvp.test.ts"],
} as const;

export function collectAcceptanceEvidence(): Record<
	keyof typeof acceptanceCommands,
	AcceptanceTestEvidence
> {
	const vitestPath = join(
		process.cwd(),
		"node_modules",
		"vitest",
		"dist",
		"cli.js",
	);
	const cwd = join(process.cwd(), "packages", "coding-agent");
	return Object.fromEntries(
		Object.entries(acceptanceCommands).map(([name, files]) => {
			const args = [vitestPath, "run", ...files, "--testTimeout=60000"];
			const command = `${process.execPath} ${args.join(" ")}`;
			const result = spawnSync(process.execPath, args, {
				cwd,
				encoding: "utf8",
			});
			return [
				name,
				parseVitestSummary(
					`${result.stdout}\n${result.stderr}`,
					command,
					result.status ?? 1,
				),
			];
		}),
	) as Record<keyof typeof acceptanceCommands, AcceptanceTestEvidence>;
}

function value(
	args: readonly string[],
	option: string,
	fallback: string,
): string {
	const index = args.indexOf(option);
	return index === -1
		? fallback
		: (args[index + 1] ??
				(() => {
					throw new Error(`missing value for ${option}`);
				})());
}

function integer(
	args: readonly string[],
	option: string,
	fallback: number,
): number {
	const parsed = Number(value(args, option, String(fallback)));
	if (!Number.isInteger(parsed) || parsed < 1)
		throw new Error(`${option} must be a positive integer`);
	return parsed;
}

function gitSha(): string {
	return execFileSync("git", ["rev-parse", "HEAD"], {
		encoding: "utf8",
	}).trim();
}

function dirty(): boolean {
	return (
		execFileSync("git", ["status", "--porcelain=v1", "-uall"], {
			encoding: "utf8",
		}).trim().length > 0
	);
}

async function preflight(): Promise<void> {
	const runId = `m12-preflight-${Date.now()}`;
	const dir = join(artifactRoot, runId);
	await mkdir(dir, { recursive: true });
	await writeFile(
		join(dir, "environment.json"),
		`${JSON.stringify(
			{
				schemaVersion: 1,
				runId,
				gitSha: gitSha(),
				dirty: dirty(),
				node: process.version,
				platform: process.platform,
				arch: process.arch,
				seed: SEED,
				workloads: WORKLOADS,
				knownCheck:
					"packages/ai/test/openai-completions-tool-choice.test.ts:1410 maxTokensField",
				w5b: "pending_external_certification",
			},
			null,
			2,
		)}\n`,
		"utf8",
	);
	console.log(`M12 preflight recorded: ${dir}`);
}

async function bench(args: readonly string[]): Promise<void> {
	const mode = value(args, "--mode", "cold") as RunMode;
	if (mode !== "cold" && mode !== "warm")
		throw new Error("--mode must be cold or warm");
	const repetitions = integer(
		args,
		"--repetitions",
		mode === "cold" ? 30 : 100,
	);
	const warmups = mode === "warm" ? integer(args, "--warmups", 5) : 0;
	const result = await runBenchmark({
		kind: "performance",
		mode,
		repetitions,
		warmups,
		workloads: performanceWorkloads,
		seed: SEED,
	});
	console.log(
		`M12 ${mode} benchmark recorded: ${result.runId} (${result.records.length} samples)`,
	);
}

async function safety(args: readonly string[]): Promise<void> {
	const repetitions = integer(args, "--repetitions", 50);
	const result = await runBenchmark({
		kind: "safety",
		mode: "cold",
		repetitions,
		warmups: 0,
		workloads: safetyWorkloads,
		seed: SEED,
	});
	console.log(
		`M12 safety benchmark recorded: ${result.runId} (${result.records.length} samples)`,
	);
}

async function compatibility(args: readonly string[]): Promise<void> {
	const repetitions = integer(args, "--repetitions", 3);
	const result = await runBenchmark({
		kind: "compatibility",
		mode: "cold",
		repetitions,
		warmups: 0,
		workloads: compatibilityWorkloads,
		seed: SEED,
	});
	console.log(
		`M12 compatibility matrix recorded: ${result.runId} (${result.records.length} samples)`,
	);
}

async function report(args: readonly string[]): Promise<void> {
	const requestedRunId = value(args, "--run-id", "");
	const { manifest, records, runDir } = await readLatestRecords(
		requestedRunId || undefined,
	);
	if (manifest.schemaVersion !== 2 || !(manifest.kind in m12Workloads))
		throw new Error("M12 manifest is missing its benchmark kind.");
	const expectedWorkloads = m12Workloads[manifest.kind];
	if (
		expectedWorkloads.length !== manifest.workloads.length ||
		expectedWorkloads.some((workload) => !manifest.workloads.includes(workload))
	) {
		throw new Error(
			`M12 ${manifest.kind} manifest has the wrong workload set.`,
		);
	}
	const nativeRecords = records.filter((record) => record.backend === "native");
	const parity =
		nativeRecords.length * 2 === records.length &&
		nativeRecords.every((native) => {
			const subprocess = records.find(
				(candidate) =>
					candidate.backend === "subprocess" &&
					candidate.workload === native.workload &&
					candidate.sample === native.sample,
			);
			return (
				subprocess !== undefined &&
				native.resultHash === subprocess.resultHash &&
				native.traceHash === subprocess.traceHash
			);
		});
	const expectedStatus: Record<WorkloadId, SampleRecord["status"]> = {
		"bootstrap-exit": "completed",
		"single-result": "completed",
		"tool-roundtrip": "completed",
		"multi-event": "completed",
		"cancel-before-tool-settle": "cancelled",
		"cancel-during-tool": "cancelled",
		"execution-exception": "failed",
		"process-fatal": "fatal",
		"resource-loader-matrix": "completed",
		"cli-contract-matrix": "completed",
	};
	const statusGate = records.every(
		(record) => record.status === expectedStatus[record.workload],
	);
	const terminalGate = records.every(
		(record) =>
			record.terminalEventCount === 1 && record.postTerminalEventCount === 0,
	);
	const compatibilityGate =
		manifest.kind !== "compatibility" ||
		records.every((record) =>
			record.workload === "resource-loader-matrix"
				? hasRequiredContract(record, "resource-loader")
				: record.workload === "cli-contract-matrix"
					? hasRequiredContract(record, "cli")
					: false,
		);
	const cancellationRows = records.filter(
		(record) =>
			(record.workload === "cancel-before-tool-settle" ||
				record.workload === "cancel-during-tool") &&
			(manifest.mode !== "warm" || record.sample > manifest.warmups),
	);
	const cancellationGate =
		cancellationRows.length === 0 ||
		["native", "subprocess"].every((backend) => {
			const rows = cancellationRows
				.filter((record) => record.backend === backend)
				.sort((a, b) => a.elapsedMs - b.elapsedMs);
			const latencies = rows
				.map((row) => row.cancelLatencyMs ?? Number.POSITIVE_INFINITY)
				.sort((a, b) => a - b);
			const p95 =
				latencies[Math.floor(latencies.length * 0.95)] ??
				Number.POSITIVE_INFINITY;
			const max = latencies.at(-1) ?? Number.POSITIVE_INFINITY;
			return rows.length > 0 && p95 <= 2000 && max <= 5000;
		});
	const performance = Object.fromEntries(
		[...new Set(records.map((record) => record.workload))].map((workload) => {
			const measured = records.filter(
				(record) =>
					record.workload === workload &&
					(manifest.mode !== "warm" || record.sample > manifest.warmups),
			);
			const native = measured
				.filter((record) => record.backend === "native")
				.sort((a, b) => a.sample - b.sample);
			const subprocess = measured
				.filter((record) => record.backend === "subprocess")
				.sort((a, b) => a.sample - b.sample);
			const metrics = Object.fromEntries(
				(["elapsedMs", "startupMs", "endRssBytes"] as const).map((metric) => [
					metric,
					{
						backends: Object.fromEntries(
							(
								[
									["native", native],
									["subprocess", subprocess],
								] as const
							).map(([backend, rows]) => [
								backend,
								{
									count: rows.filter(
										(row) => metricValue(row, metric) !== undefined,
									).length,
									summary: summarizeMetric(rows, metric),
								},
							]),
						),
						paired: pairedMetric(native, subprocess, metric),
					},
				]),
			);
			return [workload, { metrics }];
		}),
	);
	const resourceGate = records.every(
		(record) => record.orphanProcessCount === 0 && record.orphanTaskCount === 0,
	);
	const hardGate =
		parity &&
		statusGate &&
		terminalGate &&
		cancellationGate &&
		compatibilityGate &&
		resourceGate &&
		records.every((record) => record.cleanup === "clean");
	const decision = hardGate ? "native-only" : "BLOCKED";
	await writeFile(
		join(runDir, "aggregates.json"),
		`${JSON.stringify({ schemaVersion: 2, runId: manifest.runId, kind: manifest.kind, parity, statusGate, terminalGate, cancellationGate, compatibilityGate, resourceGate, hardGate, performance }, null, 2)}\n`,
		"utf8",
	);
	await mkdir(join(runDir, "performance"), { recursive: true });
	await mkdir(join(runDir, "cancellation"), { recursive: true });
	await writeFile(
		join(runDir, "cancellation", "cancellation-results.json"),
		`${JSON.stringify({ schemaVersion: 1, runId: manifest.runId, samples: cancellationRows.map((row) => ({ backend: row.backend, workload: row.workload, sample: row.sample, cancelLatencyMs: row.cancelLatencyMs ?? null, terminalEventCount: row.terminalEventCount, postTerminalEventCount: row.postTerminalEventCount })) }, null, 2)}\n`,
		"utf8",
	);
	await writeFile(
		join(runDir, "performance", "results.json"),
		`${JSON.stringify({ schemaVersion: 2, runId: manifest.runId, bootstrapResamples: 10_000, confidence: 0.95, metrics: ["elapsedMs", "startupMs", "endRssBytes"], workloads: performance }, null, 2)}\n`,
		"utf8",
	);
	await writeFile(
		join(runDir, "decision.md"),
		`# M12 decision\n\nDecision: **${decision}**\n\nBenchmark kind: ${manifest.kind}\nParity: ${parity ? "pass" : "fail"}\nStatus gate: ${statusGate ? "pass" : "fail"}\nTerminal-event gate: ${terminalGate ? "pass" : "fail"}\nCancellation gate: ${cancellationGate ? "pass" : "fail"}\nCompatibility contract gate: ${compatibilityGate ? "pass" : "fail"}\nResource/orphan gate: ${resourceGate ? "pass" : "fail"}\nHard gates: ${hardGate ? "pass" : "fail"}\nMaintenance rationale: native keeps one production execution path; subprocess remains benchmark-only process-isolation evidence.\nW5B: pending external certification.\n`,
		"utf8",
	);
	console.log(`M12 decision: ${decision}`);
}

async function selfTest(): Promise<void> {
	const result = await runBenchmark({
		kind: "performance",
		mode: "cold",
		repetitions: 1,
		warmups: 0,
		workloads: ["single-result"],
		seed: SEED,
	});
	const native = result.records.find((record) => record.backend === "native");
	const subprocess = result.records.find(
		(record) => record.backend === "subprocess",
	);
	assert(native && subprocess);
	assert.equal(native.resultHash, subprocess.resultHash);
	assert.equal(native.traceHash, subprocess.traceHash);
	console.log("M12 self-test passed");
}

async function m13Verify(args: readonly string[]): Promise<void> {
	const runIds = value(args, "--run-ids", "")
		.split(",")
		.map((runId) => runId.trim())
		.filter(Boolean);
	if (runIds.length !== 4 || new Set(runIds).size !== runIds.length) {
		throw new Error(
			"M13 requires four unique M12 run IDs: cold, warm, safety, and compatibility evidence",
		);
	}
	assertIceSubagentBackendPolicy();
	const sources = await Promise.all(
		runIds.map(async (runId) => {
			const evidence = await readLatestRecords(runId);
			const decision = await readFile(
				join(evidence.runDir, "decision.md"),
				"utf8",
			);
			const aggregates = JSON.parse(
				await readFile(join(evidence.runDir, "aggregates.json"), "utf8"),
			) as Record<string, unknown>;
			const expectedWorkloads = m12Workloads[evidence.manifest.kind];
			const workloadSetMatches =
				evidence.manifest.schemaVersion === 2 &&
				expectedWorkloads !== undefined &&
				expectedWorkloads.length === evidence.manifest.workloads.length &&
				expectedWorkloads.every((workload) =>
					evidence.manifest.workloads.includes(workload),
				);
			const sampleBudgetMatches =
				evidence.manifest.kind === "performance"
					? evidence.manifest.mode === "cold"
						? evidence.manifest.repetitions >= 30
						: evidence.manifest.warmups >= 5 &&
							evidence.manifest.repetitions >= 100
					: evidence.manifest.kind === "safety"
						? evidence.manifest.repetitions >= 50
						: evidence.manifest.repetitions >= 3;
			const gates = [
				"parity",
				"statusGate",
				"terminalGate",
				"cancellationGate",
				"compatibilityGate",
				"resourceGate",
				"hardGate",
			];
			if (
				!workloadSetMatches ||
				!sampleBudgetMatches ||
				aggregates.schemaVersion !== 2 ||
				aggregates.kind !== evidence.manifest.kind ||
				!decision.includes("Decision: **native-only**") ||
				aggregates.runId !== evidence.manifest.runId ||
				gates.some((gate) => aggregates[gate] !== true)
			) {
				throw new Error(
					`M13 source ${runId} is blocked, incomplete, or has invalid gate evidence`,
				);
			}
			return {
				runId: evidence.manifest.runId,
				kind: evidence.manifest.kind,
				mode: evidence.manifest.mode,
			};
		}),
	);
	const requiredSources = [
		"performance:cold",
		"performance:warm",
		"safety:cold",
		"compatibility:cold",
	];
	const observedSources = sources.map(
		(source) => `${source.kind}:${source.mode}`,
	);
	if (requiredSources.some((source) => !observedSources.includes(source))) {
		throw new Error(`M13 requires ${requiredSources.join(", ")} M12 evidence`);
	}
	const acceptance = collectAcceptanceEvidence();
	if (
		Object.values(acceptance).some(
			(evidence) =>
				evidence.exitCode !== 0 ||
				evidence.total === 0 ||
				evidence.passed !== evidence.total,
		)
	) {
		throw new Error(
			"M13 acceptance tests did not produce a complete passing evidence set",
		);
	}
	const runId = `m13-${Date.now()}`;
	const dir = join(process.cwd(), ".artifacts", "m13", runId);
	await mkdir(dir, { recursive: true });
	await writeFile(
		join(dir, "policy.json"),
		`${JSON.stringify({ schemaVersion: 2, ...ICE_SUBAGENT_BACKEND_POLICY }, null, 2)}\n`,
		"utf8",
	);
	await writeFile(
		join(dir, "acceptance.json"),
		`${JSON.stringify({ schemaVersion: 2, gitSha: gitSha(), dirty: dirty(), sourceM12: sources, acceptance, w5b: "pending_external_certification", knownCheck: KNOWN_CHECK }, null, 2)}\n`,
		"utf8",
	);
	await writeFile(
		join(dir, "rollback.json"),
		`${JSON.stringify({ schemaVersion: 2, strategy: ICE_SUBAGENT_BACKEND_POLICY.rollback }, null, 2)}\n`,
		"utf8",
	);
	console.log(`M13 native-only policy verified: ${dir}`);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
	const [command, ...args] = process.argv.slice(2);
	if (command === "preflight") await preflight();
	else if (command === "bench") await bench(args);
	else if (command === "safety") await safety(args);
	else if (command === "compat") await compatibility(args);
	else if (command === "report") await report(args);
	else if (command === "self-test") await selfTest();
	else if (command === "m13:verify") await m13Verify(args);
	else
		throw new Error(
			"usage: preflight|bench|safety|compat|report|self-test|m13:verify",
		);
}

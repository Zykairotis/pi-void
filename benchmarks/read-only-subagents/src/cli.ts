import { randomUUID } from "node:crypto";
import { resolve } from "node:path";
import {
	BENCHMARK_TARGET_IDS,
	type BenchmarkTarget,
	type BenchmarkExecutionConfig,
	type BenchmarkTargetId,
	loadManifest,
} from "./manifest.ts";
import { getTargetAdapter } from "./adapters/index.ts";
import { writeJsonl, type BenchmarkResult } from "./results.ts";
import {
	assertRepeatAllowed,
	loadScenarioCatalog,
	PROVIDER_SMOKE_SCENARIO,
	type BenchmarkScenario,
	type BenchmarkScenarioClass,
} from "./scenarios.ts";
import {
	BenchmarkTargetUnavailableError,
	type BenchmarkContext,
	type BenchmarkObservation,
	type PreparedTarget,
} from "./targets.ts";

export interface CliArguments {
	mode: "target" | "matrix" | "smoke";
	targetId?: BenchmarkTargetId;
	model?: string;
	scenarioClass?: BenchmarkScenarioClass;
	scenarioId?: string;
	repeat: number;
}

export interface CliRuntimeOptions {
	workspacePath?: string;
	manifestPath?: string;
	scenariosPath?: string;
	outputPath?: string;
	externalCheckouts?: BenchmarkContext["externalCheckouts"];
	runObservation?: (target: PreparedTarget, scenario: BenchmarkScenario) => Promise<BenchmarkObservation>;
	stdout?: (line: string) => void;
	stderr?: (line: string) => void;
}

function parseTargetId(value: string): BenchmarkTargetId {
	if (!BENCHMARK_TARGET_IDS.includes(value as BenchmarkTargetId)) throw new Error(`invalid target: ${value}`);
	return value as BenchmarkTargetId;
}

function requireProviderCredential(execution: BenchmarkExecutionConfig): void {
	const credential = process.env[execution.apiKeyEnv];
	if (typeof credential !== "string" || credential.trim().length === 0) {
		throw new Error(`benchmark provider credential ${execution.apiKeyEnv} unavailable`);
	}
}

function requireValue(args: readonly string[], index: number, option: string): string {
	const value = args[index + 1];
	if (value === undefined || value.startsWith("--")) throw new Error(`missing value for ${option}`);
	return value;
}

function parseScenarioClass(value: string): BenchmarkScenarioClass {
	if (value !== "deterministic" && value !== "model_quality") throw new Error(`invalid scenario class: ${value}`);
	return value;
}

export function parseArgs(args: readonly string[]): CliArguments {
	let mode: CliArguments["mode"] | undefined;
	let targetId: BenchmarkTargetId | undefined;
	let model: string | undefined;
	let scenarioClass: BenchmarkScenarioClass | undefined;
	let scenarioId: string | undefined;
	let repeat = 1;
	for (let index = 0; index < args.length; index += 1) {
		const arg = args[index];
		switch (arg) {
			case "--target":
				if (mode !== undefined) throw new Error("only one of --target or --matrix is allowed");
				mode = "target";
				targetId = parseTargetId(requireValue(args, index, arg));
				index += 1;
				break;
			case "--matrix":
				if (mode !== undefined) throw new Error("only one benchmark mode is allowed");
				mode = "matrix";
				break;
			case "--smoke":
				if (mode !== undefined) throw new Error("only one benchmark mode is allowed");
				mode = "smoke";
				break;
			case "--model":
				model = requireValue(args, index, arg);
				index += 1;
				break;
			case "--class":
				scenarioClass = parseScenarioClass(requireValue(args, index, arg));
				index += 1;
				break;
			case "--scenario":
				scenarioId = requireValue(args, index, arg);
				index += 1;
				break;
			case "--repeat": {
				const value = requireValue(args, index, arg);
				repeat = Number(value);
				if (!Number.isInteger(repeat) || repeat < 1) throw new Error("repeat must be a positive integer");
				index += 1;
				break;
			}
			default:
				throw new Error(`unknown option: ${arg}`);
		}
	}
	if (mode === undefined) throw new Error("one of --target, --matrix, or --smoke is required");
	if ((mode === "smoke" || mode === "matrix") && model === undefined) {
		throw new Error("--model is required for --matrix and --smoke");
	}
	if (mode === "smoke" && (scenarioClass !== undefined || scenarioId !== undefined)) {
		throw new Error("--smoke does not accept scenario filters");
	}
	if (mode === "smoke" && repeat !== 1) throw new Error("--smoke does not accept --repeat");
	return { mode, targetId, model, scenarioClass, scenarioId, repeat };
}

function findTarget(targets: readonly BenchmarkTarget[], id: BenchmarkTargetId): BenchmarkTarget {
	const target = targets.find((candidate) => candidate.id === id);
	if (target === undefined) throw new Error(`manifest target missing: ${id}`);
	return target;
}

function findScenario(scenarios: readonly BenchmarkScenario[], id: string): BenchmarkScenario {
	const scenario = scenarios.find((candidate) => candidate.id === id);
	if (scenario === undefined) throw new Error(`scenario not found: ${id}`);
	return scenario;
}

function toResult(
	runId: string,
	target: PreparedTarget,
	scenario: BenchmarkScenario,
	repeatIndex: number,
	startedAt: string,
	wallMs: number,
	observation: BenchmarkObservation,
): BenchmarkResult {
	return {
		schemaVersion: 1,
		runId,
		implementation: target.id,
		resolvedCommit: target.resolvedCommit,
		provider: target.execution.provider,
		model: target.execution.model,
		scenarioId: scenario.id,
		repeatIndex,
		startedAt,
		wallMs,
		success: observation.success,
		verificationStatus: observation.verificationStatus,
		failureCode: observation.failureCode,
		attempts: observation.attempts,
		observedOutputBytes: observation.observedOutputBytes,
		inputTokens: observation.inputTokens,
		outputTokens: observation.outputTokens,
		cost: observation.cost,
	};
}

export async function runCli(args: readonly string[], options: CliRuntimeOptions = {}): Promise<number> {
	const stdout = options.stdout ?? console.log;
	const stderr = options.stderr ?? console.error;
	try {
		const parsed = parseArgs(args);
		const benchmarkRoot = resolve(process.cwd(), "benchmarks/read-only-subagents");
		const manifest = loadManifest(options.manifestPath ?? resolve(benchmarkRoot, "manifest.json"));
		const catalog = loadScenarioCatalog(options.scenariosPath ?? resolve(benchmarkRoot, "scenarios.json"));
		const scenarios =
			parsed.mode === "smoke"
				? [PROVIDER_SMOKE_SCENARIO]
				: parsed.scenarioId
					? [findScenario(catalog.scenarios, parsed.scenarioId)]
					: parsed.scenarioClass
						? catalog.scenarios.filter((scenario) => scenario.class === parsed.scenarioClass)
						: catalog.scenarios;
		if (scenarios.length === 0) throw new Error(`no scenarios found for class ${parsed.scenarioClass}`);
		for (const scenario of scenarios) assertRepeatAllowed(scenario, parsed.repeat);
		const targetIds = parsed.mode === "target" ? [parsed.targetId as BenchmarkTargetId] : BENCHMARK_TARGET_IDS;
		const executions = parsed.model
			? manifest.executions.filter((execution) => execution.model === parsed.model)
			: manifest.executions;
		if (executions.length === 0) throw new Error(`benchmark model route not found: ${parsed.model}`);
		for (const execution of executions) requireProviderCredential(execution);
		const workspacePath = options.workspacePath ?? process.cwd();
		const stockTarget = findTarget(manifest.targets, "pi-stock");
		const hostCheckoutPath = stockTarget.localPath
			? resolve(workspacePath, stockTarget.localPath)
			: options.externalCheckouts?.["pi-stock"];
		const runId = randomUUID();
		const results: BenchmarkResult[] = [];
		for (const execution of executions) {
			const context: BenchmarkContext = {
				workspacePath,
				execution,
				externalCheckouts: options.externalCheckouts,
				hostCheckoutPath,
				hostCommit: stockTarget.source.commit,
			};
			const preparedTargets: PreparedTarget[] = [];
			for (const targetId of targetIds) {
				const target = findTarget(manifest.targets, targetId);
				preparedTargets.push(await getTargetAdapter(targetId).prepare(context, target));
			}
			for (const prepared of preparedTargets) {
				const adapter = getTargetAdapter(prepared.id);
				for (const scenario of scenarios) {
					for (let repeatIndex = 1; repeatIndex <= parsed.repeat; repeatIndex += 1) {
						const startedAt = new Date().toISOString();
						const start = Date.now();
						let observation: BenchmarkObservation;
						try {
							observation = options.runObservation
								? await options.runObservation(prepared, scenario)
								: await adapter.run(prepared, scenario);
						} catch {
							observation = {
								success: false,
								verificationStatus: "not_run",
								failureCode: "adapter_error",
							};
						}
						results.push(toResult(runId, prepared, scenario, repeatIndex, startedAt, Date.now() - start, observation));
					}
				}
			}
		}
		const outputPath = options.outputPath ?? resolve(benchmarkRoot, "results", `${runId}.jsonl`);
		await writeJsonl(outputPath, results);
		if (parsed.mode === "smoke") {
			const failed = results.filter((result) => !result.success || result.observedOutputBytes === undefined || result.observedOutputBytes === 0);
			if (failed.length > 0) {
				stderr(`benchmark provider smoke failed for ${failed.length} of ${results.length} routes`);
				return 2;
			}
			stdout(`benchmark provider smoke passed for ${results.length} routes`);
		}
		stdout(`wrote ${results.length} benchmark result${results.length === 1 ? "" : "s"} to ${outputPath}`);
		return 0;
	} catch (error) {
		if (error instanceof BenchmarkTargetUnavailableError) {
			stderr(error.message);
			return 2;
		}
		stderr(error instanceof Error ? error.message : "benchmark failed");
		return 2;
	}
}

if (process.argv[1]?.endsWith("/cli.ts")) {
	const exitCode = await runCli(process.argv.slice(2));
	if (exitCode !== 0) process.exitCode = exitCode;
}

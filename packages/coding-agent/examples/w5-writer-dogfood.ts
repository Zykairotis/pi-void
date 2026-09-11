#!/usr/bin/env node
import { execFile } from "node:child_process";
import { appendFile, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { promisify } from "node:util";
import type { Api, Model } from "@zykairotis/ice-ai/compat";
import { getAgentDir } from "../src/config.ts";
import { AuthStorage } from "../src/core/auth-storage.ts";
import type { ExtensionAPI, ExtensionContext, ToolDefinition } from "../src/core/extensions/types.ts";
import { ModelRegistry } from "../src/core/model-registry.ts";
import { ModelRuntime } from "../src/core/model-runtime.ts";
import iceSubagents, { type WriterPatchArtifact, type WriterResult } from "../src/ice-subagents.ts";

const execFileAsync = promisify(execFile);
const LIVE_ROUTES = ["cx/gpt-5.6-luna", "cx/deepseek/deepseek-v4-flash"] as const;
type LiveRoute = (typeof LIVE_ROUTES)[number];
type ExpectedStatus = "integrated" | "verification_failed" | "integration_conflict";

interface Scenario {
	id: string;
	task: string;
	expected: ExpectedStatus;
	verifierExit: 0 | 7;
	prepare?: (cwd: string) => Promise<void>;
	rejectBeforeIntegrate?: boolean;
}

interface LiveToolResult {
	isError?: boolean;
	details: unknown;
}

interface LiveTool {
	execute: (...args: unknown[]) => Promise<LiveToolResult>;
}

interface LiveTools {
	get(name: string): LiveTool;
}

interface DogfoodRecord {
	schemaVersion: 1;
	route: LiveRoute;
	scenario: string;
	outcome: "passed" | "failed";
	writerStatus?: WriterResult["status"];
	workflowStatus?: string;
	verification?: string;
	changedPaths?: string[];
	changedFileCount?: number;
	patchBytes?: number;
	usage?: WriterResult["usage"];
	elapsedMs: number;
	operatorIntervention: boolean;
	errorType?: string;
}

const SCENARIOS: readonly Scenario[] = [
	{
		id: "one-file-change",
		task: "Add packages/coding-agent/examples/w5-live-one-file.ts exporting a small function named w5LiveOneFile that returns the string ok. Do not edit any other file.",
		expected: "integrated",
		verifierExit: 0,
	},
	{
		id: "add-test",
		task: "Add packages/coding-agent/test/w5-live-smoke.test.ts with one deterministic test that asserts 1 + 1 equals 2. Do not edit any other file.",
		expected: "integrated",
		verifierExit: 0,
	},
	{
		id: "multi-file-refactor",
		task: "Add packages/coding-agent/examples/w5-live-refactor-a.ts and packages/coding-agent/examples/w5-live-refactor-b.ts. Export one small function from each and keep both files consistent with the repository TypeScript style.",
		expected: "integrated",
		verifierExit: 0,
	},
	{
		id: "deliberately-bad-implementation",
		task: "Add packages/coding-agent/examples/w5-live-bad.ts with a deliberately incorrect implementation of a function named w5LiveBad. This is an intentional verifier-failure exercise.",
		expected: "verification_failed",
		verifierExit: 7,
	},
	{
		id: "deliberately-failing-verification",
		task: "Add packages/coding-agent/examples/w5-live-verifier-failure.ts exporting a function named w5LiveVerifierFailure. The implementation can be minimal; the configured verifier intentionally fails.",
		expected: "verification_failed",
		verifierExit: 7,
	},
	{
		id: "stale-conflicting-proposal",
		task: "Add packages/coding-agent/examples/w5-live-conflict.ts exporting a function named w5LiveConflict. The parent will change concurrently before integration, so produce only the requested file.",
		expected: "integration_conflict",
		verifierExit: 0,
		prepare: async (cwd) => writeFile(join(cwd, "w5-live-parent-change.txt"), "concurrent operator change\n"),
	},
	{
		id: "reject-and-reuse",
		task: "Add packages/coding-agent/examples/w5-live-reuse.ts exporting a function named w5LiveReuse that returns the string reused. Do not edit any other file.",
		expected: "integrated",
		verifierExit: 0,
		rejectBeforeIntegrate: true,
	},
];

function usage(): never {
	throw new Error(
		"W5 live dogfood is opt-in. Set W5_LIVE=1 and W5_LIVE_ROOT=/path/to/a/clean/ice, then pass cx/gpt-5.6-luna or cx/deepseek/deepseek-v4-flash.",
	);
}

function parseRoute(value: string | undefined): LiveRoute {
	if (!value || !LIVE_ROUTES.includes(value as LiveRoute)) usage();
	return value as LiveRoute;
}

async function git(cwd: string, ...args: string[]): Promise<string> {
	const result = await execFileAsync("git", args, { cwd, encoding: "utf8" });
	return result.stdout;
}

function verifier(exitCode: 0 | 7): string {
	return JSON.stringify([process.execPath, "-e", `process.exit(${exitCode})`]);
}

function toolContext(cwd: string, modelRegistry: ModelRegistry, model: Model<Api>): ExtensionContext {
	return {
		cwd,
		model,
		modelRegistry,
		isProjectTrusted: () => true,
		sessionManager: { getSessionId: () => `w5-live-${Date.now()}` },
	} as unknown as ExtensionContext;
}

function registerTools(verifierFlag: string): LiveTools {
	const registered = new Map<string, LiveTool>();
	iceSubagents({
		getActiveTools: () => [
			"delegate_write",
			"read",
			"grep",
			"find",
			"ls",
			"write",
			"edit",
			"inspect_writer_patch",
			"reject_writer_patch",
			"integrate_writer_patch",
		],
		getFlag: (name: string) => (name === "ice-verify" ? verifierFlag : undefined),
		registerTool: (tool: ToolDefinition) => registered.set(tool.name, tool as unknown as LiveTool),
	} as unknown as ExtensionAPI);
	return {
		get(name: string): LiveTool {
			const tool = registered.get(name);
			if (!tool) throw new Error(`W5 tool was not registered: ${name}`);
			return tool;
		},
	};
}

function routeModel(modelRegistry: ModelRegistry, route: LiveRoute): Model<Api> {
	const slash = route.indexOf("/");
	const model = modelRegistry.find(route.slice(0, slash), route.slice(slash + 1));
	if (!model) throw new Error(`Model ${route} is unavailable in the configured catalog.`);
	if (!modelRegistry.hasConfiguredAuth(model)) throw new Error(`Model ${route} has no configured authentication.`);
	return model;
}

function recordResult(
	route: LiveRoute,
	scenario: Scenario,
	startedAt: number,
	record: Omit<DogfoodRecord, "schemaVersion" | "route" | "scenario" | "elapsedMs" | "operatorIntervention">,
): DogfoodRecord {
	return {
		schemaVersion: 1,
		route,
		scenario: scenario.id,
		elapsedMs: Date.now() - startedAt,
		operatorIntervention: process.env.W5_LIVE_OPERATOR_INTERVENTION === "1",
		...record,
	};
}

async function runScenario(
	sourceRoot: string,
	head: string,
	route: LiveRoute,
	modelRegistry: ModelRegistry,
	model: Model<Api>,
	scenario: Scenario,
): Promise<DogfoodRecord> {
	const startedAt = Date.now();
	const worktree = await mkdtemp(join(tmpdir(), "ice-w5-live-worktree-"));
	await rm(worktree, { recursive: true, force: true });
	const agentDir = await mkdtemp(join(tmpdir(), "ice-w5-live-agent-"));
	const previousAgentDir = process.env.ICE_CODING_AGENT_DIR;
	try {
		await git(sourceRoot, "worktree", "add", "--detach", worktree, head);
		process.env.ICE_CODING_AGENT_DIR = agentDir;
		const tools = registerTools(verifier(scenario.verifierExit));
		const context = toolContext(worktree, modelRegistry, model);
		const delegated = await tools
			.get("delegate_write")!
			.execute(
				`w5-live-${scenario.id}`,
				{ task: scenario.task, baseCommit: head, scope: { roots: ["."] } },
				undefined,
				undefined,
				context,
			);
		const writerResult = (delegated.details as { result?: WriterResult } | undefined)?.result;
		const artifact = writerResult?.patchArtifact as WriterPatchArtifact | undefined;
		if (!writerResult || !artifact) {
			return recordResult(route, scenario, startedAt, {
				outcome: "failed",
				writerStatus: writerResult?.status,
				errorType: "writer_produced_no_proposal",
			});
		}
		const inspected = await tools
			.get("inspect_writer_patch")!
			.execute(`w5-live-inspect-${scenario.id}`, { artifact }, undefined, undefined, context);
		if (inspected.isError) {
			return recordResult(route, scenario, startedAt, {
				outcome: "failed",
				writerStatus: writerResult.status,
				errorType: "inspection_failed",
			});
		}
		if (scenario.rejectBeforeIntegrate) {
			for (const suffix of ["first", "second"]) {
				const rejected = await tools
					.get("reject_writer_patch")!
					.execute(`w5-live-reject-${suffix}-${scenario.id}`, { artifact }, undefined, undefined, context);
				if (rejected.isError) {
					return recordResult(route, scenario, startedAt, {
						outcome: "failed",
						writerStatus: writerResult.status,
						errorType: "rejection_failed",
					});
				}
			}
		}
		if (scenario.prepare) await scenario.prepare(worktree);
		const integrated = await tools
			.get("integrate_writer_patch")!
			.execute(`w5-live-integrate-${scenario.id}`, { artifact }, undefined, undefined, context);
		const details = integrated.details as
			| {
					status?: string;
					verification?: { status?: string };
					changedPaths?: readonly string[];
			  }
			| undefined;
		const workflowStatus = details?.status;
		const passed = workflowStatus === scenario.expected;
		return recordResult(route, scenario, startedAt, {
			outcome: passed ? "passed" : "failed",
			writerStatus: writerResult.status,
			workflowStatus,
			verification: details?.verification?.status,
			changedPaths: artifact.files.map((file) => file.path),
			changedFileCount: artifact.changedFileCount,
			patchBytes: artifact.patchBytes,
			usage: writerResult.usage,
			errorType: passed ? undefined : "unexpected_workflow_status",
		});
	} catch (error) {
		return recordResult(route, scenario, startedAt, {
			outcome: "failed",
			errorType: error instanceof Error ? error.name : "unknown_error",
		});
	} finally {
		if (previousAgentDir === undefined) delete process.env.ICE_CODING_AGENT_DIR;
		else process.env.ICE_CODING_AGENT_DIR = previousAgentDir;
		try {
			await git(sourceRoot, "worktree", "remove", "--force", worktree);
		} catch {
			await rm(worktree, { recursive: true, force: true });
		}
		await rm(agentDir, { recursive: true, force: true });
	}
}

async function main(): Promise<void> {
	if (process.env.W5_LIVE !== "1") usage();
	const route = parseRoute(process.argv[2]);
	const sourceRoot = resolve(process.env.W5_LIVE_ROOT ?? usage());
	const status = await git(sourceRoot, "status", "--porcelain=v1", "-uall");
	if (status !== "") throw new Error("W5_LIVE_ROOT must be a clean Git worktree.");
	const head = (await git(sourceRoot, "rev-parse", "HEAD")).trim();
	const agentDir = getAgentDir();
	const authStorage = AuthStorage.create(join(agentDir, "auth.json"));
	const modelRuntime = await ModelRuntime.create({
		credentials: authStorage,
		authPath: join(agentDir, "auth.json"),
		modelsPath: join(agentDir, "models.json"),
	});
	const modelRegistry = new ModelRegistry(modelRuntime);
	const model = routeModel(modelRegistry, route);
	const selectedIds = process.env.W5_LIVE_SCENARIOS?.split(",")
		.map((value) => value.trim())
		.filter(Boolean);
	const scenarios = selectedIds ? SCENARIOS.filter((scenario) => selectedIds.includes(scenario.id)) : SCENARIOS;
	if (scenarios.length === 0) throw new Error("W5_LIVE_SCENARIOS selected no known scenarios.");
	const outputPath = resolve(process.env.W5_LIVE_OUTPUT ?? join(tmpdir(), `ice-w5-live-${Date.now()}.jsonl`));
	await appendFile(outputPath, "");
	const results: DogfoodRecord[] = [];
	for (const scenario of scenarios) {
		const result = await runScenario(sourceRoot, head, route, modelRegistry, model, scenario);
		results.push(result);
		await appendFile(outputPath, `${JSON.stringify(result)}\n`);
		console.log(JSON.stringify(result));
	}
	console.error(`W5 live results: ${outputPath}`);
	if (results.some((result) => result.outcome !== "passed")) process.exitCode = 1;
}

await main();

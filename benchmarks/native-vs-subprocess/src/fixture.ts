import { spawnSync } from "node:child_process";
import { createHash, randomUUID } from "node:crypto";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, dirname, join, resolve } from "node:path";
import { performance } from "node:perf_hooks";
import { fileURLToPath } from "node:url";
import {
	fauxAssistantMessage,
	fauxToolCall,
	registerFauxProvider,
} from "@zykairotis/ice-ai/compat";
import { AuthStorage } from "../../../packages/coding-agent/src/core/auth-storage.ts";
import { ModelRuntime } from "../../../packages/coding-agent/src/core/model-runtime.ts";
import type {
	CreateAgentSessionOptions,
	CreateAgentSessionResult,
} from "../../../packages/coding-agent/src/core/sdk.ts";
import {
	createNativeSubagentSession,
	NativeSubagentRunner,
	normalizeSubagentRequest,
	resolveSubagentResources,
	type SubagentEvent,
	type SubagentRequest,
	type SubagentResourceSelection,
} from "../../../packages/coding-agent/src/ice-subagents.ts";
import {
	assertTrace,
	type Backend,
	type ContractEvidence,
	type FixtureResult,
	type TraceEvent,
	type TraceEventType,
	type WorkloadId,
} from "./types.ts";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../../../");

function report(workload: WorkloadId): string {
	return JSON.stringify({
		summary: `fixture:${workload}`,
		evidence: { paths: ["src"] },
	});
}

async function prepareResourceLoaderFixture(cwd: string): Promise<string> {
	const agentDir = join(cwd, ".m12-agent");
	await mkdir(join(agentDir, "skills", "selected-skill"), { recursive: true });
	await mkdir(join(agentDir, "skills", "sibling-skill"), { recursive: true });
	await mkdir(join(agentDir, "prompts"), { recursive: true });
	await mkdir(join(agentDir, "context"), { recursive: true });
	await mkdir(join(cwd, ".ice", "skills", "project-only"), { recursive: true });
	await writeFile(
		join(agentDir, "skills", "selected-skill", "SKILL.md"),
		"---\nname: selected-skill\ndescription: Selected skill.\n---\nSelected skill.\n",
		"utf8",
	);
	await writeFile(
		join(agentDir, "skills", "sibling-skill", "SKILL.md"),
		"---\nname: sibling-skill\ndescription: Sibling skill.\n---\nSibling skill.\n",
		"utf8",
	);
	await writeFile(
		join(agentDir, "prompts", "selected-prompt.md"),
		"Selected prompt.\n",
		"utf8",
	);
	await writeFile(
		join(agentDir, "prompts", "sibling-prompt.md"),
		"Sibling prompt.\n",
		"utf8",
	);
	await writeFile(
		join(agentDir, "context", "selected-context.md"),
		"Selected context.\n",
		"utf8",
	);
	await writeFile(
		join(cwd, ".ice", "skills", "project-only", "SKILL.md"),
		"---\nname: project-only\ndescription: Project-only skill.\n---\nProject-only skill.\n",
		"utf8",
	);
	return agentDir;
}

async function captureResourceLoader(
	cwd: string,
	agentDir: string,
	selection?: SubagentResourceSelection,
): Promise<{
	skills: string[];
	prompts: string[];
	context: string[];
	extensions: number;
	themes: number;
	prompt: string;
}> {
	const normalized = normalizeSubagentRequest(
		{
			parentSessionId: "m12-parent",
			role: "explore",
			task: "Inspect the resource contract.",
			scope: { roots: ["src"] },
			cwd,
			resources: selection,
		},
		cwd,
		{ agentDir, projectTrusted: true },
	);
	let captured: CreateAgentSessionOptions | undefined;
	const fakeSession = {
		sessionId: "m12-resource-contract",
	} as unknown as CreateAgentSessionResult["session"];
	const created = await createNativeSubagentSession(
		{
			request: normalized,
			parentActiveTools: ["delegate", "read", "grep", "find", "ls"],
			agentDir,
		},
		async (options) => {
			captured = options;
			return { session: fakeSession } as CreateAgentSessionResult;
		},
	);
	const loader = captured?.resourceLoader;
	if (!loader)
		throw new Error("resource-loader contract did not create a loader");
	return {
		skills: loader.getSkills().skills.map((skill) => skill.name),
		prompts: loader.getPrompts().prompts.map((prompt) => prompt.name),
		context: loader
			.getAgentsFiles()
			.agentsFiles.map((file) => basename(file.path)),
		extensions: loader.getExtensions().extensions.length,
		themes: loader.getThemes().themes.length,
		prompt: created.prompt,
	};
}

async function resourceLoaderContract(
	cwd: string,
	agentDir: string,
): Promise<ContractEvidence> {
	const defaultLoader = await captureResourceLoader(cwd, agentDir);
	const selectedLoader = await captureResourceLoader(cwd, agentDir, {
		skills: ["selected-skill"],
		prompts: ["selected-prompt"],
		context: ["selected-context.md"],
	});
	let untrustedProjectResourceRejected = false;
	try {
		resolveSubagentResources(
			{ skills: ["project-only"] },
			{ cwd, agentDir, projectTrusted: false },
		);
	} catch {
		untrustedProjectResourceRejected = true;
	}
	let outsideResourceRejected = false;
	try {
		resolveSubagentResources(
			{ context: ["../outside-context.md"] },
			{ cwd, agentDir, projectTrusted: true },
		);
	} catch {
		outsideResourceRejected = true;
	}
	const checks: string[] = [];
	if (defaultLoader.extensions === 0)
		checks.push("default_loader_has_no_extensions");
	if (defaultLoader.skills.length === 0)
		checks.push("default_loader_has_no_skills");
	if (defaultLoader.prompts.length === 0)
		checks.push("default_loader_has_no_prompts");
	if (defaultLoader.context.length === 0)
		checks.push("default_loader_has_no_context");
	if (selectedLoader.skills.includes("selected-skill"))
		checks.push("selected_skill_present");
	if (selectedLoader.prompts.includes("selected-prompt"))
		checks.push("selected_prompt_present");
	if (selectedLoader.prompt.includes("Selected prompt."))
		checks.push("selected_prompt_content_present");
	if (selectedLoader.context.includes("selected-context.md"))
		checks.push("selected_context_present");
	if (!selectedLoader.skills.includes("sibling-skill"))
		checks.push("unselected_skill_absent");
	if (!selectedLoader.prompts.includes("sibling-prompt"))
		checks.push("unselected_prompt_absent");
	if (untrustedProjectResourceRejected)
		checks.push("untrusted_project_resource_rejected");
	if (outsideResourceRejected) checks.push("outside_resource_rejected");
	return { kind: "resource-loader", checks: [...new Set(checks)] };
}

function runCli(
	entry: string,
	args: readonly string[],
): { status: number; stdout: string; stderr: string } {
	const result = spawnSync(
		process.execPath,
		["--experimental-strip-types", entry, ...args],
		{
			cwd: repoRoot,
			encoding: "utf8",
			env: { ...process.env, ICE_OFFLINE: "1", ICE_SKIP_VERSION_CHECK: "1" },
		},
	);
	return {
		status: result.status ?? 1,
		stdout: result.stdout,
		stderr: result.stderr,
	};
}

let cachedCliContract: ContractEvidence | undefined;

function cliContract(): ContractEvidence {
	if (cachedCliContract) return cachedCliContract;
	const ice = runCli(join(repoRoot, "packages/coding-agent/src/ice.ts"), [
		"--help",
	]);
	const stockIce = runCli(join(repoRoot, "packages/coding-agent/src/cli.ts"), [
		"--help",
	]);
	const iceInvalidBackend = runCli(
		join(repoRoot, "packages/coding-agent/src/ice.ts"),
		["--ice-backend", "subprocess"],
	);
	const checks: string[] = [];
	if (ice.status === 0) checks.push("ice_help");
	if (ice.stdout.includes("--sub-yolo")) checks.push("ice_exposes_sub_yolo");
	if (ice.stdout.includes("--ice-mode")) checks.push("ice_exposes_ice_mode");
	if (ice.stdout.includes("--ice-allow-bash"))
		checks.push("ice_exposes_ice_allow_bash");
	if (stockIce.status === 0) checks.push("stock_ice_help");
	if (!stockIce.stdout.includes("--sub-yolo"))
		checks.push("stock_ice_hides_sub_yolo");
	if (!stockIce.stdout.includes("--ice-mode"))
		checks.push("stock_ice_hides_ice_mode");
	if (!stockIce.stdout.includes("--ice-allow-bash"))
		checks.push("stock_ice_hides_ice_allow_bash");
	if (
		iceInvalidBackend.status !== 0 &&
		iceInvalidBackend.stderr.includes("Unknown option: --ice-backend")
	) {
		checks.push("ice_rejects_backend_selection");
	}
	cachedCliContract = { kind: "cli", checks };
	return cachedCliContract;
}

function responsesFor(
	workload: WorkloadId,
): Array<
	| ReturnType<typeof fauxAssistantMessage>
	| (() => Promise<ReturnType<typeof fauxAssistantMessage>>)
> {
	if (workload === "execution-exception" || workload === "process-fatal") {
		return [
			fauxAssistantMessage("fixture execution exception", {
				stopReason: "error",
				errorMessage: `fixture:${workload}`,
			}),
		];
	}
	if (
		workload === "cancel-before-tool-settle" ||
		workload === "cancel-during-tool"
	) {
		return [
			() =>
				new Promise((resolve) =>
					setTimeout(() => resolve(fauxAssistantMessage(report(workload))), 50),
				),
		];
	}
	if (workload === "tool-roundtrip") {
		return [
			fauxAssistantMessage(
				[fauxToolCall("read", { path: "src/fixture.txt" })],
				{ stopReason: "toolUse" },
			),
			fauxAssistantMessage(report(workload)),
		];
	}
	if (workload === "multi-event") {
		return [
			fauxAssistantMessage(
				[
					fauxToolCall("read", { path: "src/fixture.txt" }),
					fauxToolCall("read", { path: "src/fixture.txt" }),
				],
				{ stopReason: "toolUse" },
			),
			fauxAssistantMessage(report(workload)),
		];
	}
	return [fauxAssistantMessage(report(workload))];
}

async function createProductionRuntime(cwd: string, workload: WorkloadId) {
	const faux = registerFauxProvider({
		api: "m12-fixture",
		provider: "m12-fixture",
	});
	faux.setResponses(responsesFor(workload));
	const authStorage = AuthStorage.inMemory();
	await authStorage.modify(faux.getModel().provider, async () => ({
		type: "api_key",
		key: "m12-fixture",
	}));
	const modelRuntime = await ModelRuntime.create({
		credentials: authStorage,
		modelsPath: join(cwd, "models.json"),
	});
	const model = faux.getModel();
	modelRuntime.registerProvider(model.provider, {
		baseUrl: model.baseUrl,
		api: model.api,
		models: [model],
	});
	return { faux, model, modelRuntime };
}

function traceType(event: SubagentEvent): TraceEventType {
	if (event.type === "subagent_created") return "started";
	if (event.type === "subagent_started") return "status";
	if (event.type === "subagent_tool_start") return "tool_start";
	if (event.type === "subagent_tool_end") return "tool_end";
	if (event.type === "subagent_progress") return "progress";
	return "terminal";
}

function toTraceEvent(
	event: SubagentEvent,
	backend: Backend,
	executionId: string,
	sequence: number,
): TraceEvent {
	return {
		sequence,
		timestampNs: process.hrtime.bigint().toString(),
		executionId,
		backend,
		type: traceType(event),
		payloadHash: hashText(
			JSON.stringify({
				status: event.status,
				toolName: event.toolName,
				path: event.path,
			}),
		),
	};
}

export function syntheticTrace(
	backend: Backend,
	terminalStatus: "cancelled" | "failed",
	includeProgress = false,
): TraceEvent[] {
	const executionId = randomUUID();
	const types: TraceEventType[] = includeProgress
		? ["started", "status", "progress", "terminal"]
		: ["started", "status", "terminal"];
	if (terminalStatus === "cancelled")
		types.splice(types.length - 1, 0, "cancel_requested");
	const statuses = types.map((type) =>
		type === "started"
			? "created"
			: type === "terminal"
				? terminalStatus
				: "running",
	);
	return types.map((type, sequence) => ({
		sequence,
		timestampNs: process.hrtime.bigint().toString(),
		executionId,
		backend,
		type,
		payloadHash:
			type === "cancel_requested"
				? hashText("cancel_requested")
				: hashText(JSON.stringify({ status: statuses[sequence] })),
	}));
}

function addCancellationMarker(
	events: readonly TraceEvent[],
	backend: Backend,
	executionId: string,
): TraceEvent[] {
	const terminalIndex = events.findIndex((event) => event.type === "terminal");
	if (
		terminalIndex < 0 ||
		events.some((event) => event.type === "cancel_requested")
	)
		return [...events];
	const marker: TraceEvent = {
		sequence: terminalIndex,
		timestampNs: process.hrtime.bigint().toString(),
		executionId,
		backend,
		type: "cancel_requested",
		payloadHash: hashText("cancel_requested"),
	};
	return [
		...events.slice(0, terminalIndex),
		marker,
		...events.slice(terminalIndex),
	].map((event, sequence) => ({ ...event, sequence }));
}

function canonicalResult(result: {
	status: string;
	summary: string;
	diagnostics: readonly { code: string }[];
}): string {
	return JSON.stringify({
		status: result.status,
		summary: result.summary,
		diagnostics: result.diagnostics.map((item) => item.code),
	});
}

export function hashText(value: string): string {
	return createHash("sha256").update(value).digest("hex");
}

export async function createFixtureWorkspace(): Promise<string> {
	const cwd = await mkdtemp(join(tmpdir(), "ice-m12-"));
	await mkdir(join(cwd, "src"));
	await writeFile(join(cwd, "src", "fixture.txt"), "M12 fixture\n", "utf8");
	return cwd;
}

export async function removeFixtureWorkspace(cwd: string): Promise<void> {
	await rm(cwd, { recursive: true, force: true });
}

export async function runNativeFixture(
	workload: WorkloadId,
	cwd: string,
	signal?: AbortSignal,
	onFirstEvent?: () => void,
	backend: Backend = "native",
): Promise<FixtureResult> {
	const events: TraceEvent[] = [];
	const executionId = randomUUID();
	let cancelRequestedAt: number | undefined;
	const onAbort = () => {
		cancelRequestedAt ??= performance.now();
	};
	signal?.addEventListener("abort", onAbort, { once: true });
	const agentDir =
		workload === "resource-loader-matrix"
			? await prepareResourceLoaderFixture(cwd)
			: undefined;
	const request: SubagentRequest = {
		parentSessionId: "m12-parent",
		role: "explore",
		task: `m12:${workload}`,
		scope: { roots: ["src"] },
		cwd,
		timeoutMs: 5000,
		...(workload === "resource-loader-matrix"
			? {
					resources: {
						skills: ["selected-skill"],
						prompts: ["selected-prompt"],
						context: ["selected-context.md"],
					},
				}
			: {}),
	};
	const runtime = await createProductionRuntime(cwd, workload);
	try {
		const result = await new NativeSubagentRunner({ agentDir }).run(
			request,
			["delegate", "read", "grep", "find", "ls"],
			{
				model: runtime.model,
				modelRuntime: runtime.modelRuntime,
				projectTrusted: true,
				signal,
				onEvent: (event) => {
					onFirstEvent?.();
					events.push(toTraceEvent(event, backend, executionId, events.length));
				},
			},
		);
		const traceEvents =
			events.length === 0 && result.status === "cancelled"
				? syntheticTrace(backend, "cancelled")
				: result.status === "cancelled"
					? addCancellationMarker(events, backend, executionId)
					: events;
		assertTrace(traceEvents);
		const status =
			workload === "process-fatal"
				? "fatal"
				: result.status === "completed" || result.status === "cancelled"
					? result.status
					: "failed";
		let contract: ContractEvidence | undefined;
		if (workload === "resource-loader-matrix") {
			if (!agentDir)
				throw new Error("resource-loader fixture directory is missing");
			contract = await resourceLoaderContract(cwd, agentDir);
		} else if (workload === "cli-contract-matrix") {
			contract = cliContract();
		}
		const normalizedResult =
			status === "cancelled" || status === "fatal"
				? JSON.stringify({ status })
				: JSON.stringify({
						result: JSON.parse(canonicalResult(result)),
						...(contract ? { contract } : {}),
					});
		return {
			workload,
			status,
			events: traceEvents,
			result: normalizedResult,
			...(contract ? { contract } : {}),
			...(cancelRequestedAt !== undefined && status === "cancelled"
				? {
						cancelLatencyMs: Math.max(0, performance.now() - cancelRequestedAt),
					}
				: {}),
			...(result.diagnostics[0] ? { error: result.diagnostics[0].code } : {}),
		};
	} finally {
		signal?.removeEventListener("abort", onAbort);
		runtime.faux.unregister();
	}
}

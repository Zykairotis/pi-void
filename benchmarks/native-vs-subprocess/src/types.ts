export const WORKLOADS = [
	"bootstrap-exit",
	"single-result",
	"tool-roundtrip",
	"multi-event",
	"cancel-before-tool-settle",
	"cancel-during-tool",
	"execution-exception",
	"process-fatal",
	"resource-loader-matrix",
	"cli-contract-matrix",
] as const;

export type WorkloadId = (typeof WORKLOADS)[number];
export type Backend = "native" | "subprocess";
export type RunMode = "cold" | "warm";
export type BenchmarkKind = "performance" | "safety" | "compatibility";

export const REQUIRED_CONTRACT_CHECKS = {
	"resource-loader": [
		"default_loader_has_no_extensions",
		"default_loader_has_no_skills",
		"default_loader_has_no_prompts",
		"default_loader_has_no_context",
		"selected_skill_present",
		"selected_prompt_present",
		"selected_prompt_content_present",
		"selected_context_present",
		"unselected_skill_absent",
		"unselected_prompt_absent",
		"untrusted_project_resource_rejected",
		"outside_resource_rejected",
	],
	cli: [
		"piv_help",
		"piv_exposes_sub_yolo",
		"piv_exposes_piv_mode",
		"piv_exposes_piv_allow_bash",
		"stock_pi_help",
		"stock_pi_hides_sub_yolo",
		"stock_pi_hides_piv_mode",
		"stock_pi_hides_piv_allow_bash",
		"piv_rejects_backend_selection",
	],
} as const;

export type ContractKind = keyof typeof REQUIRED_CONTRACT_CHECKS;
export interface ContractEvidence {
	kind: ContractKind;
	checks: readonly string[];
}

export interface FixtureRequest {
	workload: WorkloadId;
	cwd: string;
	cancelAfterMs?: number;
}

export type TraceEventType =
	| "started"
	| "status"
	| "tool_start"
	| "tool_end"
	| "progress"
	| "cancel_requested"
	| "terminal";

export interface TraceEvent {
	sequence: number;
	timestampNs: string;
	executionId: string;
	backend: Backend;
	type: TraceEventType;
	payloadHash: string;
}

export function assertTrace(events: readonly TraceEvent[]): void {
	if (events.length === 0) throw new Error("trace is empty");
	events.forEach((event, index) => {
		if (event.sequence !== index)
			throw new Error(`trace sequence gap at ${index}`);
	});
	const terminalIndexes = events.flatMap((event, index) =>
		event.type === "terminal" ? [index] : [],
	);
	if (terminalIndexes.length !== 1)
		throw new Error(
			`trace terminal count is ${terminalIndexes.length}, expected 1`,
		);
	const terminalIndex = terminalIndexes[0];
	if (terminalIndex !== events.length - 1)
		throw new Error("trace contains post-terminal events");
}

export function canonicalTrace(
	events: readonly TraceEvent[],
): readonly Pick<TraceEvent, "sequence" | "type" | "payloadHash">[] {
	return events.map(({ sequence, type, payloadHash }) => ({
		sequence,
		type,
		payloadHash,
	}));
}

export interface FixtureResult {
	workload: WorkloadId;
	status: "completed" | "cancelled" | "failed" | "fatal";
	events: TraceEvent[];
	result: string;
	contract?: ContractEvidence;
	cancelLatencyMs?: number;
	error?: string;
}

export interface ResourceSnapshot {
	rssBytes: number;
	heapUsedBytes: number;
	heapTotalBytes: number;
	externalBytes: number;
	activeResources: readonly string[];
	processCount: number;
}

export interface ResourceDelta {
	rssBytes: number;
	heapUsedBytes: number;
	heapTotalBytes: number;
	externalBytes: number;
	activeResources: number;
	processCount: number;
}

export interface SampleRecord {
	schemaVersion: 1;
	runId: string;
	backend: Backend;
	mode: RunMode;
	workload: WorkloadId;
	sample: number;
	contract?: ContractEvidence;
	elapsedMs: number;
	startupMs: number;
	endRssBytes: number | null;
	childRssAvailable: boolean;
	resultHash: string;
	traceHash: string;
	status: FixtureResult["status"];
	eventCount: number;
	terminalEventCount: number;
	postTerminalEventCount: number;
	tracePath: string;
	resourceBefore: ResourceSnapshot;
	resourceAfter: ResourceSnapshot;
	resourceDelta: ResourceDelta;
	orphanProcessCount: number;
	orphanTaskCount: number;
	cancelLatencyMs?: number;
	cleanup: "clean" | "not_applicable";
	error?: string;
}

export interface RunManifest {
	schemaVersion: 2;
	runId: string;
	gitSha: string;
	dirty: boolean;
	kind: BenchmarkKind;
	seed: number;
	mode: RunMode;
	repetitions: number;
	warmups: number;
	workloads: readonly WorkloadId[];
	backends: readonly Backend[];
	knownCheck: string;
}

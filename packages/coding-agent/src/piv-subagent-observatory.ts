import { relative, resolve, sep } from "node:path";
import { stripTerminalSequences } from "@earendil-works/pi-tui";
import type {
	SubagentJobInspection,
	SubagentJobResultEnvelope,
	SubagentJobStatus,
	TerminalSubagentJobStatus,
} from "./piv-subagent-jobs.ts";
import { JOB_COMPLETION_MESSAGE_TYPE } from "./piv-subagent-jobs.ts";
import type { SubagentEvent, SubagentStatus, SubagentUsage } from "./piv-subagents.ts";
import { redactCredentialText } from "./utils/redact.ts";

export const OBSERVATORY_RECENT_LIMIT = 32;
export const OBSERVATORY_ACTIVITY_LIMIT = 12;
export const OBSERVATORY_PATH_MAX_BYTES = 512;
export const OBSERVATORY_SUMMARY_MAX_BYTES = 1024;
export const OBSERVATORY_DIAGNOSTIC_MAX_BYTES = 512;
const OBSERVATORY_ATTEMPT_LIMIT = 4;
const OBSERVATORY_DIAGNOSTIC_LIMIT = 8;

export const OBSERVATORY_TOOL_NAMES = [
	"delegate",
	"delegate_batch",
	"review_batch",
	"delegate_write",
	"inspect_writer_patch",
	"reject_writer_patch",
	"integrate_writer_patch",
] as const;
export type ObservatoryToolName = (typeof OBSERVATORY_TOOL_NAMES)[number];

export type WriterObservabilityPhase =
	| "preflight"
	| "workspace_created"
	| "running"
	| "tool_activity"
	| "collecting_artifact"
	| "cleanup"
	| "proposal_ready"
	| "inspecting"
	| "inspected"
	| "rejected"
	| "validating"
	| "applying"
	| "verifying"
	| "integrated"
	| "verification_failed"
	| "integration_conflict"
	| "rolling_back"
	| "rollback_conflict";

export type ObservatoryPhase =
	| WriterObservabilityPhase
	| "created"
	| "completed"
	| "failed"
	| "cancelled"
	| "timed_out";

export interface ObservatoryAttemptHistory {
	readonly attempt: 1 | 2;
	readonly runId: string;
	readonly status: SubagentStatus;
}

export interface ObservatoryActivity {
	readonly phase: ObservatoryPhase;
	readonly tool?: string;
	readonly path?: string;
}

export interface SubagentProgressSnapshot {
	readonly schemaVersion: 1;
	readonly streamKey: string;
	readonly toolName: ObservatoryToolName;
	readonly runId?: string;
	readonly batchId?: string;
	readonly taskId?: string;
	readonly role?: string;
	readonly model?: string;
	readonly status: string;
	readonly phase: ObservatoryPhase;
	readonly terminal: boolean;
	readonly startedAtMs: number;
	readonly elapsedMs: number;
	readonly currentTool?: string;
	readonly currentPath?: string;
	readonly attempt?: 1 | 2;
	readonly attemptHistory: readonly ObservatoryAttemptHistory[];
	readonly usage?: SubagentUsage;
	readonly evidenceCount?: number;
	readonly changedFileCount?: number;
	readonly artifactReady?: boolean;
	readonly artifactStatus?: string;
	readonly verifierStatus?: string;
	readonly rollbackStatus?: string;
	readonly summary?: string;
	readonly diagnostics: readonly string[];
	readonly activity: readonly ObservatoryActivity[];
}

export interface ObservatoryState {
	readonly active: readonly SubagentProgressSnapshot[];
	readonly recent: readonly SubagentProgressSnapshot[];
}

export interface ObservatoryRuntimeInput {
	readonly streamKey: string;
	readonly toolName: ObservatoryToolName;
	readonly event: SubagentEvent;
	readonly nowMs?: number;
	readonly cwd?: string;
	readonly model?: string;
	readonly taskId?: string;
	readonly attempt?: 1 | 2;
	readonly currentPath?: string;
	readonly usage?: SubagentUsage;
}

export interface ObservatoryWorkflowInput {
	readonly streamKey: string;
	readonly toolName: ObservatoryToolName;
	readonly runId?: string;
	readonly batchId?: string;
	readonly taskId?: string;
	readonly role?: string;
	readonly model?: string;
	readonly phase: ObservatoryPhase;
	readonly status: string;
	readonly nowMs?: number;
	readonly cwd?: string;
	readonly currentTool?: string;
	readonly currentPath?: string;
	readonly attempt?: 1 | 2;
	readonly usage?: SubagentUsage;
	readonly evidenceCount?: number;
	readonly changedFileCount?: number;
	readonly artifactReady?: boolean;
	readonly artifactStatus?: string;
	readonly verifierStatus?: string;
	readonly rollbackStatus?: string;
	readonly summary?: string;
	readonly diagnostics?: readonly string[];
}

export interface SubagentProgressDetails {
	readonly type: "subagent_progress";
	readonly snapshot: SubagentProgressSnapshot;
}

export interface DurableSubagentJobViewSnapshot {
	readonly schemaVersion: 1;
	readonly jobId: string;
	readonly status: SubagentJobStatus;
	readonly role: string;
	readonly model?: string;
	readonly queuePosition?: number;
	readonly plannedOutputBytes: number;
	readonly reservedOutputBytes: number;
	readonly ownerReservedOutputBytes: number;
	readonly ownerBudgetBytes: number;
	readonly createdAt: string;
	readonly startedAt?: string;
	readonly finishedAt?: string;
	readonly resultRef: string;
}

export const OBSERVATORY_COMPLETION_LIMIT = 32;

export interface SubagentCompletionInboxSessionEntry {
	readonly type?: unknown;
	readonly customType?: unknown;
	readonly timestamp?: unknown;
	readonly details?: unknown;
	readonly content?: unknown;
}

export interface SubagentCompletionInboxItem {
	readonly schemaVersion: 1;
	readonly jobId: string;
	readonly status: TerminalSubagentJobStatus;
	readonly role: string;
	readonly model?: string;
	readonly finishedAt?: string;
	readonly notifiedAt?: string;
	readonly resultRef: string;
}

export interface DurableSubagentJobFindingView {
	readonly severity: "low" | "medium" | "high";
	readonly category: string;
	readonly claim: string;
	readonly evidence: readonly string[];
}

export interface DurableSubagentJobResultView {
	readonly schemaVersion: 1;
	readonly jobId: string;
	readonly status: TerminalSubagentJobStatus;
	readonly role: string;
	readonly model?: string;
	readonly resultRef: string;
	readonly summary?: string;
	readonly verification?: {
		readonly verified: boolean;
		readonly reason?: string;
	};
	readonly evidence: readonly string[];
	readonly findings: readonly DurableSubagentJobFindingView[];
	readonly diagnostics: readonly string[];
}

function boundedByteCount(value: number | undefined): number {
	return typeof value === "number" && Number.isSafeInteger(value) && value >= 0 ? value : 0;
}

function boundedSingleLine(value: string | undefined, maxBytes: number): string | undefined {
	return boundedText(value, maxBytes)?.replace(/[\r\n\t]+/g, " ");
}

export function projectDurableSubagentJob(inspection: SubagentJobInspection): DurableSubagentJobViewSnapshot {
	const job = inspection.job;
	const budget = inspection.budget;
	const jobId = boundedText(job.jobId, 128) ?? "unknown";
	const model = job.model ? boundedSingleLine(job.model, OBSERVATORY_PATH_MAX_BYTES) : undefined;
	const startedAt = job.startedAt ? boundedSingleLine(job.startedAt, OBSERVATORY_PATH_MAX_BYTES) : undefined;
	const finishedAt = job.finishedAt ? boundedSingleLine(job.finishedAt, OBSERVATORY_PATH_MAX_BYTES) : undefined;
	return Object.freeze({
		schemaVersion: 1,
		jobId,
		status: job.status,
		role: boundedSingleLine(job.role, OBSERVATORY_PATH_MAX_BYTES) ?? "unknown",
		...(model ? { model } : {}),
		...(inspection.queuePosition !== undefined && inspection.queuePosition > 0
			? { queuePosition: inspection.queuePosition }
			: {}),
		plannedOutputBytes: boundedByteCount(budget?.plannedOutputBytes ?? job.plannedOutputBytes),
		reservedOutputBytes: boundedByteCount(budget?.reservedOutputBytes ?? job.reservedOutputBytes),
		ownerReservedOutputBytes: boundedByteCount(budget?.ownerReservedOutputBytes),
		ownerBudgetBytes: boundedByteCount(budget?.ownerBudgetBytes),
		createdAt: boundedSingleLine(job.createdAt, OBSERVATORY_PATH_MAX_BYTES) ?? "",
		...(startedAt ? { startedAt } : {}),
		...(finishedAt ? { finishedAt } : {}),
		resultRef: boundedSingleLine(job.resultRef, OBSERVATORY_PATH_MAX_BYTES) ?? `job:${jobId}`,
	});
}

export function isDurableJobInspectable(status: SubagentJobStatus): status is TerminalSubagentJobStatus {
	switch (status) {
		case "completed":
		case "failed":
		case "cancelled":
		case "timed_out":
		case "verification_failed":
		case "interrupted":
			return true;
		default:
			return false;
	}
}

function terminalSafeText(value: string): string {
	return stripTerminalSequences(value).replace(/[\u0000-\u001f\u007f-\u009f]/g, " ");
}

function sanitizeDetailText(value: string | undefined, maxBytes: number): string | undefined {
	const safe = value === undefined ? undefined : terminalSafeText(value);
	return boundedSingleLine(safe, maxBytes)?.replace(/(^|[\s=(])(?:[A-Za-z]:[\\/]|\\\\|\/)[^\s]*/g, "$1[path]");
}

function repoRelativeEvidencePath(value: string): string | undefined {
	const path = boundedSingleLine(terminalSafeText(value), OBSERVATORY_PATH_MAX_BYTES)?.replace(/\\/g, "/");
	if (
		!path ||
		path.startsWith("/") ||
		/^[A-Za-z]:\//.test(path) ||
		/^[A-Za-z][A-Za-z0-9+.-]*:/.test(path) ||
		path.split("/").includes("..")
	)
		return undefined;
	return path;
}

function asRecord(value: unknown): Readonly<Record<string, unknown>> | undefined {
	return typeof value === "object" && value !== null ? (value as Readonly<Record<string, unknown>>) : undefined;
}

function canonicalTimestamp(value: unknown): string | undefined {
	if (typeof value !== "string") return undefined;
	const parsed = Date.parse(value);
	return Number.isFinite(parsed) ? new Date(parsed).toISOString() : undefined;
}

function safeMetadataText(value: string | undefined, maxBytes: number): string | undefined {
	return boundedSingleLine(value === undefined ? undefined : terminalSafeText(value), maxBytes);
}

export function projectSubagentCompletionInbox(
	entries: readonly SubagentCompletionInboxSessionEntry[],
	jobs: readonly DurableSubagentJobViewSnapshot[],
): readonly SubagentCompletionInboxItem[] {
	const jobsById = new Map(jobs.map((job) => [job.jobId, job]));
	const seen = new Set<string>();
	const inbox: SubagentCompletionInboxItem[] = [];
	for (let index = entries.length - 1; index >= 0 && inbox.length < OBSERVATORY_COMPLETION_LIMIT; index--) {
		const entry = entries[index];
		if (entry?.type !== "custom_message" || entry.customType !== JOB_COMPLETION_MESSAGE_TYPE) continue;
		const details = asRecord(entry.details);
		if (!details) continue;
		const jobId = details.jobId;
		if (typeof jobId !== "string" || !/^[A-Za-z0-9][A-Za-z0-9_-]{0,127}$/.test(jobId) || seen.has(jobId)) continue;
		const job = jobsById.get(jobId);
		if (!job || !isDurableJobInspectable(job.status)) continue;
		if (details.status !== job.status || details.resultRef !== job.resultRef) continue;
		const role = safeMetadataText(job.role, OBSERVATORY_PATH_MAX_BYTES) ?? "unknown";
		const model = safeMetadataText(job.model, OBSERVATORY_PATH_MAX_BYTES);
		const finishedAt = canonicalTimestamp(job.finishedAt);
		const notifiedAt = canonicalTimestamp(entry.timestamp);
		const item = Object.freeze({
			schemaVersion: 1 as const,
			jobId,
			status: job.status,
			role,
			...(model ? { model } : {}),
			...(finishedAt ? { finishedAt } : {}),
			...(notifiedAt ? { notifiedAt } : {}),
			resultRef: safeMetadataText(job.resultRef, OBSERVATORY_PATH_MAX_BYTES) ?? `job:${jobId}`,
		});
		seen.add(jobId);
		inbox.push(item);
	}
	return Object.freeze(inbox);
}

export function formatCompletionInboxRows(inbox: readonly SubagentCompletionInboxItem[]): string[] {
	if (inbox.length === 0) return [];
	return [
		"COMPLETION INBOX",
		...inbox.map((item) => {
			const marker = item.status === "completed" ? "✓" : "✗";
			const model = item.model ? ` · model ${item.model}` : "";
			return ` ${marker} ${item.jobId.slice(0, 6)} ${item.role} ${item.status}${model}`;
		}),
	];
}

export function projectDurableSubagentJobResult(
	inspection: SubagentJobInspection,
): DurableSubagentJobResultView | undefined {
	if (!isDurableJobInspectable(inspection.job.status)) return undefined;
	const metadata = projectDurableSubagentJob(inspection);
	const result: SubagentJobResultEnvelope | undefined = inspection.result;
	const summary = sanitizeDetailText(result?.summary, OBSERVATORY_SUMMARY_MAX_BYTES);
	const evidence = Object.freeze(
		(result?.evidence?.paths ?? [])
			.map(repoRelativeEvidencePath)
			.filter((path): path is string => path !== undefined)
			.slice(0, 64),
	);
	const findings = Object.freeze(
		(result?.findings ?? [])
			.map((finding) => {
				const category = sanitizeDetailText(finding.category, 256);
				const claim = sanitizeDetailText(finding.claim, OBSERVATORY_SUMMARY_MAX_BYTES);
				const findingEvidence = finding.evidence
					.map((reference) => repoRelativeEvidencePath(reference.path))
					.filter((path): path is string => path !== undefined)
					.slice(0, 16);
				if (!category || !claim || findingEvidence.length === 0) return undefined;
				return Object.freeze({
					severity: finding.severity,
					category,
					claim,
					evidence: Object.freeze(findingEvidence),
				});
			})
			.filter((finding): finding is DurableSubagentJobFindingView => finding !== undefined)
			.slice(0, 32),
	);
	const verification = result?.verification
		? Object.freeze({
				verified: result.verification.verified,
				...(sanitizeDetailText(result.verification.reason, OBSERVATORY_SUMMARY_MAX_BYTES)
					? { reason: sanitizeDetailText(result.verification.reason, OBSERVATORY_SUMMARY_MAX_BYTES) }
					: {}),
			})
		: undefined;
	const diagnostics = Object.freeze(
		(result?.diagnostics ?? [])
			.map((diagnostic) => {
				const code = sanitizeDetailText(diagnostic.code, 128);
				if (!code) return undefined;
				const message = sanitizeDetailText(diagnostic.message, OBSERVATORY_DIAGNOSTIC_MAX_BYTES);
				return message ? `${code}: ${message}` : code;
			})
			.filter((diagnostic): diagnostic is string => diagnostic !== undefined)
			.slice(0, 8),
	);
	const jobId = sanitizeDetailText(metadata.jobId, 128) ?? "unknown";
	return Object.freeze({
		schemaVersion: 1,
		jobId,
		status: inspection.job.status,
		role: sanitizeDetailText(metadata.role, OBSERVATORY_PATH_MAX_BYTES) ?? "unknown",
		...(metadata.model ? { model: sanitizeDetailText(metadata.model, OBSERVATORY_PATH_MAX_BYTES) ?? "unknown" } : {}),
		resultRef: sanitizeDetailText(metadata.resultRef, OBSERVATORY_PATH_MAX_BYTES) ?? `job:${jobId}`,
		...(summary ? { summary } : {}),
		...(verification ? { verification } : {}),
		evidence,
		findings,
		diagnostics,
	});
}

export function formatDurableSubagentJobDetail(detail: DurableSubagentJobResultView): string[] {
	const rows = [
		`Background Job ${detail.jobId}`,
		`status: ${detail.status}`,
		`role: ${detail.role}`,
		...(detail.model ? [`model: ${detail.model}`] : []),
		`result ref: ${detail.resultRef}`,
		"",
	];
	let hasDetails = false;
	if (detail.summary) {
		rows.push("Summary", detail.summary, "");
		hasDetails = true;
	}
	if (detail.verification) {
		rows.push("Verification", detail.verification.verified ? "VERIFIED" : "VERIFICATION FAILED");
		if (detail.verification.reason) rows.push(detail.verification.reason);
		rows.push("");
		hasDetails = true;
	}
	if (detail.evidence.length > 0) {
		rows.push("Verified evidence", ...detail.evidence.map((path) => `- ${path}`), "");
		hasDetails = true;
	}
	if (detail.findings.length > 0) {
		rows.push(
			"Findings",
			...detail.findings.flatMap((finding) => [
				`- [${finding.severity}] ${finding.category}: ${finding.claim}`,
				...finding.evidence.map((path) => `  evidence: ${path}`),
			]),
			"",
		);
		hasDetails = true;
	}
	if (detail.diagnostics.length > 0) {
		rows.push("Diagnostics", ...detail.diagnostics.map((diagnostic) => `- ${diagnostic}`), "");
		hasDetails = true;
	}
	if (!hasDetails) rows.push("No durable result details.");
	return rows;
}

interface DurableJobSections {
	active: readonly DurableSubagentJobViewSnapshot[];
	queued: readonly DurableSubagentJobViewSnapshot[];
	recent: readonly DurableSubagentJobViewSnapshot[];
}

function compareDurableJobs(left: DurableSubagentJobViewSnapshot, right: DurableSubagentJobViewSnapshot): number {
	return left.createdAt.localeCompare(right.createdAt) || left.jobId.localeCompare(right.jobId);
}

function durableJobSections(jobs: readonly DurableSubagentJobViewSnapshot[]): DurableJobSections {
	const active = jobs
		.filter((job) => job.status === "created" || job.status === "running")
		.slice()
		.sort((left, right) => {
			const statusOrder = Number(left.status !== "running") - Number(right.status !== "running");
			return statusOrder || compareDurableJobs(left, right);
		});
	const queued = jobs
		.filter((job) => job.status === "queued")
		.slice()
		.sort(
			(left, right) =>
				(left.queuePosition ?? Number.MAX_SAFE_INTEGER) - (right.queuePosition ?? Number.MAX_SAFE_INTEGER) ||
				compareDurableJobs(left, right),
		);
	const recent = jobs
		.filter((job) => !["created", "queued", "running"].includes(job.status))
		.slice()
		.sort(
			(left, right) =>
				(right.finishedAt ?? right.createdAt).localeCompare(left.finishedAt ?? left.createdAt) ||
				left.jobId.localeCompare(right.jobId),
		);
	return { active, queued, recent };
}

export function durableJobEntryKeys(jobs: readonly DurableSubagentJobViewSnapshot[]): readonly string[] {
	const sections = durableJobSections(jobs);
	return Object.freeze([...sections.active, ...sections.queued, ...sections.recent].map((job) => job.jobId));
}

function formatDurableJobSnapshot(snapshot: DurableSubagentJobViewSnapshot): string {
	return [
		`${snapshot.status}${snapshot.model ? ` · model ${snapshot.model}` : ""}`,
		...(snapshot.queuePosition !== undefined ? [`queue position ${snapshot.queuePosition}`] : []),
		`reservation ${snapshot.reservedOutputBytes}/${snapshot.ownerBudgetBytes} bytes`,
		`created ${snapshot.createdAt}`,
		...(snapshot.startedAt ? [`started ${snapshot.startedAt}`] : []),
		...(snapshot.finishedAt ? [`finished ${snapshot.finishedAt}`] : []),
		`result ref ${snapshot.resultRef}`,
	].join("\n");
}

const TERMINAL_STATUSES = new Set(["completed", "failed", "cancelled", "timed_out", "verification_failed"]);
const TERMINAL_PHASES = new Set<ObservatoryPhase>([
	"proposal_ready",
	"inspected",
	"rejected",
	"integrated",
	"verification_failed",
	"integration_conflict",
	"rollback_conflict",
	"completed",
	"failed",
	"cancelled",
	"timed_out",
]);

function workflowIsTerminal(toolName: ObservatoryToolName, phase: ObservatoryPhase): boolean {
	return !(toolName === "integrate_writer_patch" && phase === "inspected") && TERMINAL_PHASES.has(phase);
}

function nowMs(value: number | undefined): number {
	return value ?? Date.now();
}

function boundedText(value: string | undefined, maxBytes: number): string | undefined {
	if (!value) return undefined;
	const redacted = redactCredentialText(value)
		.replace(/\u0000/g, "")
		.trim();
	if (!redacted) return undefined;
	if (Buffer.byteLength(redacted, "utf8") <= maxBytes) return redacted;
	let usedBytes = 0;
	let end = 0;
	for (const character of redacted) {
		const characterBytes = Buffer.byteLength(character, "utf8");
		if (usedBytes + characterBytes > maxBytes) break;
		usedBytes += characterBytes;
		end += character.length;
	}
	return redacted.slice(0, end);
}

export function normalizeProgressPath(cwd: string | undefined, value: string | undefined): string | undefined {
	if (!cwd || !value || value.includes("\u0000")) return undefined;
	const candidate = value.trim();
	if (!candidate) return undefined;
	const root = resolve(cwd);
	const target = resolve(root, candidate);
	const path = relative(root, target);
	if (path === "" || path === ".") return ".";
	if (path === ".." || path.startsWith(`..${sep}`) || path.startsWith(sep)) return undefined;
	const displayPath = path.split(sep).join("/");
	return boundedText(displayPath, OBSERVATORY_PATH_MAX_BYTES);
}

function phaseForRuntimeEvent(event: SubagentEvent): ObservatoryPhase {
	switch (event.type) {
		case "subagent_created":
			return "created";
		case "subagent_started":
			return "running";
		case "subagent_tool_start":
		case "subagent_tool_end":
		case "subagent_progress":
			return "tool_activity";
		case "subagent_completed":
			return "completed";
		case "subagent_failed":
			return "failed";
		case "subagent_cancelled":
			return "cancelled";
		case "subagent_timed_out":
			return "timed_out";
	}
}

function runtimeIsTerminal(event: SubagentEvent): boolean {
	return TERMINAL_STATUSES.has(event.status);
}

function createSnapshot(input: {
	streamKey: string;
	toolName: ObservatoryToolName;
	now: number;
	startedAt: number;
	phase: ObservatoryPhase;
	status: string;
	terminal: boolean;
	runId?: string;
	batchId?: string;
	taskId?: string;
	role?: string;
	model?: string;
	attempt?: 1 | 2;
	currentTool?: string;
	currentPath?: string;
	usage?: SubagentUsage;
	attemptHistory?: readonly ObservatoryAttemptHistory[];
	activity?: readonly ObservatoryActivity[];
	evidenceCount?: number;
	changedFileCount?: number;
	artifactReady?: boolean;
	artifactStatus?: string;
	verifierStatus?: string;
	rollbackStatus?: string;
	summary?: string;
	diagnostics?: readonly string[];
}): SubagentProgressSnapshot {
	return {
		schemaVersion: 1,
		streamKey: input.streamKey,
		toolName: input.toolName,
		...(input.runId ? { runId: input.runId } : {}),
		...(input.batchId ? { batchId: input.batchId } : {}),
		...(input.taskId ? { taskId: input.taskId } : {}),
		...(input.role ? { role: boundedText(input.role, OBSERVATORY_PATH_MAX_BYTES) } : {}),
		...(input.model ? { model: boundedText(input.model, OBSERVATORY_PATH_MAX_BYTES) } : {}),
		status: input.status,
		phase: input.phase,
		terminal: input.terminal,
		startedAtMs: input.startedAt,
		elapsedMs: Math.max(0, input.now - input.startedAt),
		...(input.currentTool ? { currentTool: boundedText(input.currentTool, OBSERVATORY_PATH_MAX_BYTES) } : {}),
		...(input.currentPath ? { currentPath: input.currentPath } : {}),
		...(input.attempt ? { attempt: input.attempt } : {}),
		attemptHistory: Object.freeze((input.attemptHistory ?? []).slice(-OBSERVATORY_ATTEMPT_LIMIT)),
		...(input.usage ? { usage: input.usage } : {}),
		...(input.evidenceCount !== undefined ? { evidenceCount: input.evidenceCount } : {}),
		...(input.changedFileCount !== undefined ? { changedFileCount: input.changedFileCount } : {}),
		...(input.artifactReady !== undefined ? { artifactReady: input.artifactReady } : {}),
		...(input.artifactStatus
			? { artifactStatus: boundedText(input.artifactStatus, OBSERVATORY_PATH_MAX_BYTES) }
			: {}),
		...(input.verifierStatus
			? { verifierStatus: boundedText(input.verifierStatus, OBSERVATORY_PATH_MAX_BYTES) }
			: {}),
		...(input.rollbackStatus
			? { rollbackStatus: boundedText(input.rollbackStatus, OBSERVATORY_PATH_MAX_BYTES) }
			: {}),
		...(input.summary ? { summary: boundedText(input.summary, OBSERVATORY_SUMMARY_MAX_BYTES) } : {}),
		diagnostics: Object.freeze(
			(input.diagnostics ?? [])
				.slice(0, OBSERVATORY_DIAGNOSTIC_LIMIT)
				.map((diagnostic) => boundedText(diagnostic, OBSERVATORY_DIAGNOSTIC_MAX_BYTES))
				.filter((diagnostic): diagnostic is string => diagnostic !== undefined),
		),
		activity: Object.freeze((input.activity ?? []).slice(-OBSERVATORY_ACTIVITY_LIMIT)),
	};
}

function activityFor(
	previous: SubagentProgressSnapshot | undefined,
	phase: ObservatoryPhase,
	tool: string | undefined,
	path: string | undefined,
): readonly ObservatoryActivity[] {
	const prior = previous?.activity ?? [];
	const next = {
		phase,
		...(tool ? { tool: boundedText(tool, OBSERVATORY_PATH_MAX_BYTES) } : {}),
		...(path ? { path: boundedText(path, OBSERVATORY_PATH_MAX_BYTES) } : {}),
	} satisfies ObservatoryActivity;
	const last = prior.at(-1);
	if (last && last.phase === next.phase && last.tool === next.tool && last.path === next.path) return prior;
	return [...prior, next].slice(-OBSERVATORY_ACTIVITY_LIMIT);
}

function replaceActive(state: ObservatoryState, snapshot: SubagentProgressSnapshot): ObservatoryState {
	return {
		active: Object.freeze([...state.active.filter((entry) => entry.streamKey !== snapshot.streamKey), snapshot]),
		recent: Object.freeze(state.recent.filter((entry) => entry.streamKey !== snapshot.streamKey)),
	};
}

function finishSnapshot(state: ObservatoryState, snapshot: SubagentProgressSnapshot): ObservatoryState {
	const recent = [...state.recent.filter((entry) => entry.streamKey !== snapshot.streamKey), snapshot].slice(
		-OBSERVATORY_RECENT_LIMIT,
	);
	return {
		active: Object.freeze(state.active.filter((entry) => entry.streamKey !== snapshot.streamKey)),
		recent: Object.freeze(recent),
	};
}

function findExisting(state: ObservatoryState, streamKey: string): SubagentProgressSnapshot | undefined {
	return (
		state.active.find((entry) => entry.streamKey === streamKey) ??
		state.recent.find((entry) => entry.streamKey === streamKey)
	);
}

function shouldIgnoreRuntimeEvent(
	existing: SubagentProgressSnapshot | undefined,
	input: ObservatoryRuntimeInput,
): boolean {
	if (!existing) return false;
	const attempt = input.attempt ?? existing.attempt ?? 1;
	if (existing.terminal && attempt <= (existing.attempt ?? 1)) return true;
	if (input.event.type === "subagent_created" && existing.runId === input.event.runId && attempt === existing.attempt)
		return true;
	return false;
}

export function createObservatoryState(): ObservatoryState {
	return { active: [], recent: [] };
}

export function reduceObservatoryEvent(state: ObservatoryState, input: ObservatoryRuntimeInput): ObservatoryState {
	const now = nowMs(input.nowMs);
	const existing = findExisting(state, input.streamKey);
	if (shouldIgnoreRuntimeEvent(existing, input)) return state;
	const attempt = input.attempt ?? existing?.attempt ?? 1;
	const attemptHistory =
		existing && attempt > (existing.attempt ?? 1) && existing.runId
			? [
					...existing.attemptHistory,
					{ attempt: existing.attempt ?? 1, runId: existing.runId, status: existing.status as SubagentStatus },
				]
			: (existing?.attemptHistory ?? []);
	const phase = phaseForRuntimeEvent(input.event);
	const currentPath = normalizeProgressPath(input.cwd, input.currentPath);
	const startedAt = existing?.startedAtMs ?? now;
	const snapshot = createSnapshot({
		streamKey: input.streamKey,
		toolName: input.toolName,
		now,
		startedAt,
		phase,
		status: input.event.status,
		terminal: runtimeIsTerminal(input.event),
		runId: input.event.runId,
		batchId: input.event.batchId,
		taskId: input.taskId,
		role: input.event.profile,
		model: input.model ?? existing?.model,
		attempt,
		currentTool: input.event.toolName ?? existing?.currentTool,
		currentPath: currentPath ?? existing?.currentPath,
		usage: input.usage ?? existing?.usage,
		attemptHistory,
		activity: activityFor(existing, phase, input.event.toolName, currentPath),
	});
	return snapshot.terminal ? finishSnapshot(state, snapshot) : replaceActive(state, snapshot);
}

export function reduceWorkflowProgress(state: ObservatoryState, input: ObservatoryWorkflowInput): ObservatoryState {
	const now = nowMs(input.nowMs);
	const existing = findExisting(state, input.streamKey);
	const attempt = input.attempt ?? existing?.attempt ?? 1;
	const terminalUpgrade =
		existing?.phase === "completed" &&
		(input.phase === "verification_failed" ||
			input.phase === "integration_conflict" ||
			input.phase === "rollback_conflict");
	if (
		existing?.terminal &&
		attempt <= (existing.attempt ?? 1) &&
		(input.phase !== existing.phase || input.status !== existing.status) &&
		!terminalUpgrade
	) {
		return state;
	}
	const attemptHistory =
		existing && attempt > (existing.attempt ?? 1) && existing.runId
			? [
					...existing.attemptHistory,
					{ attempt: existing.attempt ?? 1, runId: existing.runId, status: existing.status as SubagentStatus },
				]
			: (existing?.attemptHistory ?? []);
	const currentPath = normalizeProgressPath(input.cwd, input.currentPath);
	const snapshot = createSnapshot({
		streamKey: input.streamKey,
		toolName: input.toolName,
		now,
		startedAt: existing?.startedAtMs ?? now,
		phase: input.phase,
		status: input.status,
		terminal: workflowIsTerminal(input.toolName, input.phase),
		runId: input.runId ?? existing?.runId,
		batchId: input.batchId ?? existing?.batchId,
		taskId: input.taskId ?? existing?.taskId,
		role: input.role ?? existing?.role,
		model: input.model ?? existing?.model,
		attempt,
		currentTool: input.currentTool ?? existing?.currentTool,
		currentPath: currentPath ?? existing?.currentPath,
		usage: input.usage ?? existing?.usage,
		attemptHistory,
		activity: activityFor(existing, input.phase, existing?.currentTool, currentPath),
		evidenceCount: input.evidenceCount ?? existing?.evidenceCount,
		changedFileCount: input.changedFileCount ?? existing?.changedFileCount,
		artifactReady: input.artifactReady ?? existing?.artifactReady,
		artifactStatus: input.artifactStatus ?? existing?.artifactStatus,
		verifierStatus: input.verifierStatus ?? existing?.verifierStatus,
		rollbackStatus: input.rollbackStatus ?? existing?.rollbackStatus,
		summary: input.summary ?? existing?.summary,
		diagnostics: input.diagnostics ?? existing?.diagnostics,
	});
	return snapshot.terminal ? finishSnapshot(state, snapshot) : replaceActive(state, snapshot);
}

export class SubagentObservatoryStore {
	private state: ObservatoryState = createObservatoryState();
	private readonly listeners = new Set<(state: ObservatoryState) => void>();

	getState(): ObservatoryState {
		return this.state;
	}

	applyRuntime(input: ObservatoryRuntimeInput): SubagentProgressSnapshot | undefined {
		this.state = reduceObservatoryEvent(this.state, input);
		return this.publish(input.streamKey);
	}

	applyWorkflow(input: ObservatoryWorkflowInput): SubagentProgressSnapshot | undefined {
		this.state = reduceWorkflowProgress(this.state, input);
		return this.publish(input.streamKey);
	}

	subscribe(listener: (state: ObservatoryState) => void): () => void {
		this.listeners.add(listener);
		return () => this.listeners.delete(listener);
	}

	private publish(streamKey: string): SubagentProgressSnapshot | undefined {
		for (const listener of this.listeners) {
			try {
				listener(this.state);
			} catch {
				// Observability consumers are non-authoritative and must not affect execution.
			}
		}
		return findExisting(this.state, streamKey);
	}
}

export function progressDetails(snapshot: SubagentProgressSnapshot): SubagentProgressDetails {
	return { type: "subagent_progress", snapshot };
}

export function getProgressSnapshot(details: unknown): SubagentProgressSnapshot | undefined {
	if (!details || typeof details !== "object") return undefined;
	const candidate = details as { type?: unknown; snapshot?: unknown; progress?: unknown };
	if (candidate.type === "subagent_progress" && candidate.snapshot && typeof candidate.snapshot === "object") {
		return candidate.snapshot as SubagentProgressSnapshot;
	}
	if (candidate.progress && typeof candidate.progress === "object")
		return candidate.progress as SubagentProgressSnapshot;
	return undefined;
}

function formatDuration(milliseconds: number): string {
	const seconds = Math.max(0, Math.floor(milliseconds / 1_000));
	return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`;
}

export function formatProgressSnapshot(snapshot: SubagentProgressSnapshot): string {
	const lines = [
		`${snapshot.toolName}${snapshot.role ? ` ${snapshot.role}` : ""}${snapshot.runId ? ` ${snapshot.runId.slice(0, 6)}` : ""}`,
		`${snapshot.status} · ${snapshot.phase} · ${formatDuration(snapshot.elapsedMs)}`,
		...(snapshot.model ? [`model ${snapshot.model}`] : []),
		...(snapshot.attempt ? [`attempt ${snapshot.attempt}`] : []),
		...(snapshot.usage
			? [
					`usage in ${snapshot.usage.inputTokens} · out ${snapshot.usage.outputTokens} · cost ${snapshot.usage.cost.toFixed(4)}`,
				]
			: []),
		...(snapshot.currentTool || snapshot.currentPath
			? [`current ${snapshot.currentTool ?? "activity"}${snapshot.currentPath ? ` ${snapshot.currentPath}` : ""}`]
			: []),
		...(snapshot.changedFileCount !== undefined ? [`${snapshot.changedFileCount} files changed`] : []),
		...(snapshot.evidenceCount !== undefined ? [`evidence ${snapshot.evidenceCount} paths`] : []),
		...(snapshot.artifactReady !== undefined ? [`artifact ${snapshot.artifactReady ? "ready" : "not ready"}`] : []),
		...(snapshot.verifierStatus ? [`verifier ${snapshot.verifierStatus}`] : []),
		...(snapshot.rollbackStatus ? [`rollback ${snapshot.rollbackStatus}`] : []),
		...(snapshot.diagnostics ?? []).map((diagnostic) => `diagnostic ${diagnostic}`),
	];
	return redactCredentialText(lines.join("\n"));
}

export function formatToolCall(toolName: ObservatoryToolName, args: unknown): string {
	if (!args || typeof args !== "object") return toolName;
	const input = args as Record<string, unknown>;
	if (toolName === "delegate" && typeof input.role === "string") return `${toolName} ${input.role}`;
	if ((toolName === "delegate_batch" || toolName === "review_batch") && Array.isArray(input.tasks)) {
		return `${toolName} ${input.tasks.length} tasks`;
	}
	if (toolName === "delegate_write") return "delegate_write isolated worktree";
	if (toolName === "inspect_writer_patch") return "inspect_writer_patch artifact";
	if (toolName === "reject_writer_patch") return "reject_writer_patch proposal";
	if (toolName === "integrate_writer_patch") return "integrate_writer_patch proposal";
	return toolName;
}

export function formatObservatoryRows(
	state: ObservatoryState,
	selectedIndex = 0,
	expandedKeys: ReadonlySet<string> = new Set(),
	durableJobs: readonly DurableSubagentJobViewSnapshot[] = [],
	completionInbox: readonly SubagentCompletionInboxItem[] = [],
): string[] {
	const sections = durableJobSections(durableJobs);
	const foregroundEntries = [...state.active, ...state.recent];
	const hasEntries =
		foregroundEntries.length > 0 ||
		sections.active.length > 0 ||
		sections.queued.length > 0 ||
		sections.recent.length > 0 ||
		completionInbox.length > 0;
	const rows = ["Pi Void Subagents", ""];
	if (!hasEntries) return [...rows, "No active or recent subagents."];
	let index = 0;
	for (const section of ["ACTIVE", "RECENT"] as const) {
		const sectionEntries = section === "ACTIVE" ? state.active : state.recent;
		if (sectionEntries.length === 0) continue;
		rows.push(section);
		for (const snapshot of sectionEntries) {
			const marker = snapshot.terminal ? (snapshot.status === "completed" ? "✓" : "✗") : "●";
			const prefix = index === selectedIndex ? ">" : " ";
			rows.push(
				`${prefix}${marker} ${snapshot.runId?.slice(0, 6) ?? "------"} ${snapshot.toolName} ${snapshot.status} ${formatDuration(snapshot.elapsedMs)}`,
			);
			if (expandedKeys.has(snapshot.streamKey)) {
				for (const line of formatProgressSnapshot(snapshot).split("\n").slice(1)) rows.push(`  ${line}`);
			}
			index++;
		}
	}
	for (const [label, sectionEntries] of [
		["BACKGROUND ACTIVE", sections.active],
		["BACKGROUND QUEUED", sections.queued],
		["BACKGROUND RECENT", sections.recent],
	] as const) {
		if (sectionEntries.length === 0) continue;
		rows.push(label);
		for (const job of sectionEntries) {
			const marker =
				job.status === "completed"
					? "✓"
					: job.status === "queued"
						? "…"
						: ["created", "running"].includes(job.status)
							? "●"
							: "✗";
			const prefix = index === selectedIndex ? ">" : " ";
			const queue = job.queuePosition !== undefined ? ` q#${job.queuePosition}` : "";
			rows.push(`${prefix}${marker} ${job.jobId.slice(0, 6)} ${job.role} ${job.status}${queue}`);
			if (expandedKeys.has(job.jobId)) {
				for (const line of formatDurableJobSnapshot(job).split("\n")) rows.push(`  ${line}`);
			}
			index++;
		}
	}
	if (completionInbox.length > 0) rows.push(...formatCompletionInboxRows(completionInbox));
	return rows;
}

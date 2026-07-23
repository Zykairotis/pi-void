import { spawn } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, lstatSync, realpathSync } from "node:fs";
import { basename, dirname, isAbsolute, relative, resolve, sep } from "node:path";
import type {
	ExecOptions,
	ExecResult,
	ExtensionAPI,
	ExtensionContext,
	ToolCallEvent,
	ToolResultEvent,
} from "./core/extensions/types.ts";
import { killProcessTree, trackDetachedChildPid, untrackDetachedChildPid } from "./utils/shell.ts";

const STATE_TYPE = "piv-safe-verify-state";
const STATE_VERSION = 1;
const PLAN_TOOLS = ["read", "grep", "find", "ls"];
const BUILD_TOOLS = [...PLAN_TOOLS, "edit", "write"];
export const VERIFIER_TIMEOUT_MS = 120_000;
export const VERIFIER_OUTPUT_LIMIT_BYTES = 64 * 1024;
export const VERIFIER_TERMINATION_GRACE_MS = 5_000;
const MAX_VERIFY_ARGS = 64;
const MAX_VERIFY_ARG_BYTES = 4096;
const MAX_VERIFY_TOTAL_BYTES = 16 * 1024;

type PivMode = "plan" | "build";
type PivVerifierStatus =
	| "not-configured"
	| "pending"
	| "running"
	| "passed"
	| "failed"
	| "timed-out"
	| "spawn-error"
	| "cancelled"
	| "blocked-untrusted";

export interface PivGitBaseline {
	root: string;
	head?: string;
	branch?: string;
	statusPorcelain: string;
	capturedAt: string;
}

export interface PivVerifierState {
	status: PivVerifierStatus;
	generation?: number;
	commandHash?: string;
	exitCode?: number;
	signal?: string;
	durationMs?: number;
	stdout?: string;
	stderr?: string;
	truncated?: boolean;
	failureMessage?: string;
}

interface PivStateV1 {
	version: 1;
	mode: PivMode;
	guardRoot: string;
	rootSource: "git" | "cwd";
	baseline: PivGitBaseline;
	mutationGeneration: number;
	checkedGeneration: number;
	verifier: PivVerifierState;
	bashEnabledInRecordedProcess: boolean;
}

interface VerifierRunOptions {
	timeoutMs?: number;
	outputLimitBytes?: number;
	terminationGraceMs?: number;
	signal?: AbortSignal;
	exec?: (command: string, args: string[], options?: ExecOptions) => Promise<ExecResult>;
}

export function parsePivMode(value: unknown): PivMode {
	if (value === undefined) return "plan";
	if (value === "plan" || value === "build") return value;
	throw new Error(`Invalid --piv-mode value: ${String(value)}. Expected plan or build.`);
}

export function validatePivStartupArgs(args: string[]): void {
	for (let index = 0; index < args.length; index++) {
		const argument = args[index]!;
		if (argument === "--piv-mode") {
			if (args[index + 1] === undefined) throw new Error("--piv-mode requires plan or build");
			parsePivMode(args[++index]);
		} else if (argument.startsWith("--piv-mode=")) {
			parsePivMode(argument.slice("--piv-mode=".length));
		} else if (argument === "--piv-verify") {
			if (args[index + 1] === undefined) throw new Error("--piv-verify requires a JSON argv string");
			parseVerifierArgv(args[++index]);
		} else if (argument.startsWith("--piv-verify=")) {
			parseVerifierArgv(argument.slice("--piv-verify=".length));
		}
	}
}

export function parseVerifierArgv(value: boolean | string | undefined): string[] | undefined {
	if (value === undefined || value === false) return undefined;
	if (typeof value !== "string") throw new Error("--piv-verify requires a JSON argv string");
	if (Buffer.byteLength(value) > MAX_VERIFY_TOTAL_BYTES) {
		throw new Error(`--piv-verify must not exceed ${MAX_VERIFY_TOTAL_BYTES} bytes`);
	}
	let parsed: unknown;
	try {
		parsed = JSON.parse(value);
	} catch (error) {
		throw new Error("--piv-verify must be valid JSON", { cause: error });
	}
	if (!Array.isArray(parsed) || parsed.length === 0 || parsed.length > MAX_VERIFY_ARGS) {
		throw new Error(`--piv-verify must be a nonempty JSON string array with at most ${MAX_VERIFY_ARGS} items`);
	}
	if (
		parsed.some(
			(argument) =>
				typeof argument !== "string" ||
				argument.length === 0 ||
				argument.includes("\0") ||
				Buffer.byteLength(argument) > MAX_VERIFY_ARG_BYTES,
		)
	) {
		throw new Error(`--piv-verify arguments must be nonempty NUL-free strings up to ${MAX_VERIFY_ARG_BYTES} bytes`);
	}
	return parsed;
}

function normalizeForComparison(path: string): string {
	const normalized = resolve(path);
	return process.platform === "win32" ? normalized.toLowerCase() : normalized;
}

function canonicalizeExisting(path: string): string {
	try {
		return realpathSync(path);
	} catch {
		return resolve(path);
	}
}

function pathEntryExists(path: string): boolean {
	try {
		lstatSync(path);
		return true;
	} catch {
		return false;
	}
}

export function resolveProspectivePath(path: string): string {
	if (pathEntryExists(path)) return realpathSync(path);
	const suffix: string[] = [];
	let ancestor = path;
	while (!existsSync(ancestor)) {
		const parent = dirname(ancestor);
		if (parent === ancestor) break;
		suffix.unshift(basename(ancestor));
		ancestor = parent;
	}
	return resolve(realpathSync(ancestor), ...suffix);
}

export function pathIsWithin(root: string, candidate: string): boolean {
	const pathFromRoot = relative(normalizeForComparison(root), normalizeForComparison(candidate));
	return (
		pathFromRoot === "" ||
		(!pathFromRoot.startsWith(`..${sep}`) && pathFromRoot !== ".." && !isAbsolute(pathFromRoot))
	);
}

export function validateMutationPath(inputPath: unknown, cwd: string, canonicalRoot: string): string | undefined {
	if (typeof inputPath !== "string" || inputPath.length === 0) return "Mutation path must be a nonempty string";
	const lexicalTarget = resolve(cwd, inputPath);
	let target: string;
	try {
		target = resolveProspectivePath(lexicalTarget);
	} catch (error) {
		return `Cannot resolve path "${inputPath}": ${error instanceof Error ? error.message : String(error)}`;
	}
	if (!pathIsWithin(canonicalRoot, target)) return `Path "${inputPath}" is outside guarded root "${canonicalRoot}"`;

	const lexicalSegments = relative(canonicalRoot, lexicalTarget).split(sep).filter(Boolean);
	const canonicalSegments = relative(canonicalRoot, target).split(sep).filter(Boolean);
	if (lexicalSegments.includes(".git") || canonicalSegments.includes(".git")) {
		return `Path "${inputPath}" targets protected .git data`;
	}
	const names = new Set([...lexicalSegments, ...canonicalSegments]);
	if ([...names].some((name) => name === ".env" || name.startsWith(".env."))) {
		return `Path "${inputPath}" targets a protected environment file`;
	}
	if ([...names].some((name) => name === "credentials.json" || name === "service-account.json")) {
		return `Path "${inputPath}" targets a protected credential file`;
	}
	return undefined;
}

function commandHash(argv: string[]): string {
	return createHash("sha256").update(JSON.stringify(argv)).digest("hex");
}

function retainOutput(
	stdout: string,
	stderr: string,
	limit: number,
): { stdout: string; stderr: string; truncated: boolean } {
	const stdoutBuffer = Buffer.from(stdout);
	const retainedStdout = stdoutBuffer.subarray(0, limit);
	const remaining = Math.max(0, limit - retainedStdout.length);
	const stderrBuffer = Buffer.from(stderr);
	return {
		stdout: retainedStdout.toString("utf8"),
		stderr: stderrBuffer.subarray(0, remaining).toString("utf8"),
		truncated: stdoutBuffer.length + stderrBuffer.length > limit,
	};
}

function signalProcessTree(pid: number, signal: NodeJS.Signals): void {
	if (process.platform === "win32") {
		if (signal === "SIGKILL") {
			killProcessTree(pid);
			return;
		}
		try {
			const killer = spawn("taskkill", ["/T", "/PID", String(pid)], {
				stdio: "ignore",
				detached: true,
				windowsHide: true,
			});
			killer.unref();
		} catch {
			// The force-kill fallback below remains armed.
		}
		return;
	}
	try {
		process.kill(-pid, signal);
	} catch {
		try {
			process.kill(pid, signal);
		} catch {
			// Process tree already exited.
		}
	}
}

async function execVerifier(
	command: string,
	args: string[],
	options: ExecOptions,
	outputLimitBytes: number,
	terminationGraceMs: number,
): Promise<ExecResult & { truncated: boolean }> {
	return await new Promise((resolveResult, reject) => {
		const child = spawn(command, args, {
			cwd: options.cwd,
			detached: process.platform !== "win32",
			shell: false,
			stdio: ["ignore", "pipe", "pipe"],
			windowsHide: true,
		});
		if (child.pid) trackDetachedChildPid(child.pid);
		let stdout: Buffer<ArrayBufferLike> = Buffer.alloc(0);
		let stderr: Buffer<ArrayBufferLike> = Buffer.alloc(0);
		let killed = false;
		let forceKill: NodeJS.Timeout | undefined;
		let totalBytes = 0;
		const append = (current: Buffer<ArrayBufferLike>, chunk: Buffer<ArrayBufferLike>) => {
			totalBytes += chunk.length;
			const remaining = outputLimitBytes - stdout.length - stderr.length;
			return remaining > 0 ? Buffer.concat([current, chunk.subarray(0, remaining)]) : current;
		};
		child.stdout.on("data", (chunk: Buffer) => {
			stdout = append(stdout, chunk);
		});
		child.stderr.on("data", (chunk: Buffer) => {
			stderr = append(stderr, chunk);
		});
		const cleanup = () => {
			if (forceKill) clearTimeout(forceKill);
			if (child.pid) untrackDetachedChildPid(child.pid);
			options.signal?.removeEventListener("abort", terminate);
		};
		const terminate = () => {
			if (!child.pid) return;
			killed = true;
			signalProcessTree(child.pid, "SIGTERM");
			forceKill ??= setTimeout(() => signalProcessTree(child.pid!, "SIGKILL"), terminationGraceMs);
		};
		if (options.signal?.aborted) terminate();
		else options.signal?.addEventListener("abort", terminate, { once: true });
		child.once("error", (error) => {
			cleanup();
			reject(error);
		});
		child.once("close", (code) => {
			cleanup();
			resolveResult({
				stdout: stdout.toString("utf8"),
				stderr: stderr.toString("utf8"),
				code: code ?? 1,
				killed,
				truncated: totalBytes > outputLimitBytes,
			});
		});
	});
}

export async function runVerifier(
	argv: string[],
	cwd: string,
	options: VerifierRunOptions = {},
): Promise<PivVerifierState> {
	const started = Date.now();
	const timeoutMs = options.timeoutMs ?? VERIFIER_TIMEOUT_MS;
	const outputLimitBytes = options.outputLimitBytes ?? VERIFIER_OUTPUT_LIMIT_BYTES;
	const terminationGraceMs = options.terminationGraceMs ?? VERIFIER_TERMINATION_GRACE_MS;
	const controller = new AbortController();
	let timedOut = false;
	let cancelled = options.signal?.aborted === true;
	const abort = () => {
		cancelled = true;
		controller.abort();
	};
	if (cancelled) controller.abort();
	else options.signal?.addEventListener("abort", abort, { once: true });
	const timeout = setTimeout(() => {
		timedOut = true;
		controller.abort();
	}, timeoutMs);
	try {
		const result = options.exec
			? await options.exec(argv[0]!, argv.slice(1), { cwd, signal: controller.signal, timeout: timeoutMs })
			: await execVerifier(
					argv[0]!,
					argv.slice(1),
					{ cwd, signal: controller.signal },
					outputLimitBytes,
					terminationGraceMs,
				);
		const output = retainOutput(result.stdout, result.stderr, outputLimitBytes);
		if ("truncated" in result && result.truncated === true) output.truncated = true;
		const status: PivVerifierStatus = timedOut
			? "timed-out"
			: cancelled
				? "cancelled"
				: result.code === 0
					? "passed"
					: "failed";
		return {
			status,
			commandHash: commandHash(argv),
			exitCode: result.code,
			durationMs: Date.now() - started,
			...output,
			failureMessage:
				status === "timed-out"
					? `Verifier exceeded ${timeoutMs} ms`
					: status === "cancelled"
						? "Verifier was cancelled"
						: status === "failed"
							? `Verifier exited with code ${result.code}`
							: undefined,
		};
	} catch (error) {
		return {
			status: timedOut ? "timed-out" : cancelled ? "cancelled" : "spawn-error",
			commandHash: commandHash(argv),
			durationMs: Date.now() - started,
			failureMessage: error instanceof Error ? error.message : String(error),
		};
	} finally {
		clearTimeout(timeout);
		options.signal?.removeEventListener("abort", abort);
	}
}

function restoreVerifierState(
	restoredVerifier: PivVerifierState | undefined,
	currentArgv: string[] | undefined,
): PivVerifierState {
	const currentHash = currentArgv ? commandHash(currentArgv) : undefined;
	if (currentHash && restoredVerifier?.commandHash !== currentHash) {
		return { status: "pending", commandHash: currentHash };
	}
	if (!restoredVerifier)
		return currentHash ? { status: "pending", commandHash: currentHash } : { status: "not-configured" };
	if (restoredVerifier.status !== "running") return restoredVerifier;
	return {
		...restoredVerifier,
		status: "cancelled",
		failureMessage: "Previous verifier was interrupted before completion",
	};
}

function isVerifierStatus(value: unknown): value is PivVerifierStatus {
	return [
		"not-configured",
		"pending",
		"running",
		"passed",
		"failed",
		"timed-out",
		"spawn-error",
		"cancelled",
		"blocked-untrusted",
	].includes(String(value));
}

function parseStoredState(value: unknown, guardRoot: string): PivStateV1 | undefined {
	if (!value || typeof value !== "object") return undefined;
	const state = value as Partial<PivStateV1>;
	if (
		state.version !== STATE_VERSION ||
		(state.mode !== "plan" && state.mode !== "build") ||
		state.guardRoot !== guardRoot ||
		(state.rootSource !== "git" && state.rootSource !== "cwd") ||
		!state.baseline ||
		state.baseline.root !== guardRoot ||
		!Number.isSafeInteger(state.mutationGeneration) ||
		(state.mutationGeneration ?? -1) < 0 ||
		!Number.isSafeInteger(state.checkedGeneration) ||
		(state.checkedGeneration ?? -1) < 0 ||
		(state.checkedGeneration ?? 0) > (state.mutationGeneration ?? 0) ||
		!state.verifier ||
		!isVerifierStatus(state.verifier.status)
	)
		return undefined;
	return state as PivStateV1;
}

async function captureBaseline(
	pi: ExtensionAPI,
	ctx: ExtensionContext,
): Promise<{ baseline: PivGitBaseline; rootSource: "git" | "cwd" }> {
	const rootResult = await pi.exec("git", ["rev-parse", "--show-toplevel"], { cwd: ctx.cwd });
	const gitRoot = rootResult.code === 0 ? rootResult.stdout.trim() : undefined;
	const root = canonicalizeExisting(gitRoot || ctx.cwd);
	const [head, branch, status] = await Promise.all([
		pi.exec("git", ["rev-parse", "HEAD"], { cwd: root }),
		pi.exec("git", ["branch", "--show-current"], { cwd: root }),
		pi.exec("git", ["status", "--porcelain=v1", "-uall"], { cwd: root }),
	]);
	return {
		rootSource: gitRoot ? "git" : "cwd",
		baseline: {
			root,
			head: head.code === 0 ? head.stdout.trim() : undefined,
			branch: branch.code === 0 ? branch.stdout.trim() || undefined : undefined,
			statusPorcelain: status.code === 0 ? status.stdout : "",
			capturedAt: new Date().toISOString(),
		},
	};
}

function isHeadless(ctx: ExtensionContext): boolean {
	return ctx.mode === "print" || ctx.mode === "json" || ctx.mode === "rpc";
}

function report(ctx: ExtensionContext, message: string, type: "info" | "warning" | "error"): void {
	ctx.ui.notify(message, type);
	if (ctx.mode === "print") console.error(message);
}

function verifierFailureMessage(verifier: PivVerifierState): string {
	switch (verifier.status) {
		case "failed":
			return `Pi Void verification failed with exit code ${verifier.exitCode ?? 1}.`;
		case "timed-out":
			return "Pi Void verification timed out.";
		case "spawn-error":
			return `Pi Void verification could not start: ${verifier.failureMessage ?? "unknown error"}.`;
		case "cancelled":
			return "Pi Void verification was cancelled.";
		case "blocked-untrusted":
			return "Pi Void verification was blocked because the project is untrusted.";
		default:
			return "Pi Void verification passed.";
	}
}

export default function pivSafeVerify(pi: ExtensionAPI): void {
	let state: PivStateV1 | undefined;
	let verifierArgv: string[] | undefined;
	let verifierRunning = false;
	let activeVerifier:
		| {
				controller: AbortController;
				completion: Promise<void>;
				contextSignal?: AbortSignal;
				forwardContextAbort: () => void;
		  }
		| undefined;
	const authorizedMutations = new Set<string>();

	pi.registerFlag("piv-mode", { description: "Pi Void mode: plan or build", type: "string" });
	pi.registerFlag("piv-allow-bash", {
		description: "Allow Bash in trusted build mode for this process",
		type: "boolean",
	});
	pi.registerFlag("piv-verify", { description: "Trusted verifier JSON argv for this process", type: "string" });

	const persist = () => {
		if (state) pi.appendEntry(STATE_TYPE, state);
	};
	const bashRequested = () => pi.getFlag("piv-allow-bash") === true;
	const bashEffective = (ctx: ExtensionContext) =>
		state?.mode === "build" && bashRequested() && ctx.isProjectTrusted();
	const effectiveTools = (ctx: ExtensionContext) =>
		state?.mode === "plan" ? PLAN_TOOLS : bashEffective(ctx) ? [...BUILD_TOOLS, "bash"] : BUILD_TOOLS;
	const applyTools = (ctx: ExtensionContext) => pi.setActiveTools(effectiveTools(ctx));
	const setMode = (mode: PivMode, ctx: ExtensionContext) => {
		if (!state) return;
		const changed = state.mode !== mode;
		state = {
			...state,
			mode,
			bashEnabledInRecordedProcess: mode === "build" && bashRequested() && ctx.isProjectTrusted(),
		};
		applyTools(ctx);
		persist();
		ctx.ui.setStatus("piv-mode", mode);
		ctx.ui.notify(`Pi Void mode: ${mode}${changed ? "" : " (unchanged)"}`, "info");
		if (bashEffective(ctx))
			ctx.ui.notify(
				"Bash is enabled for this process. Direct path guards do not contain shell commands.",
				"warning",
			);
	};

	async function verify(ctx: ExtensionContext, force: boolean): Promise<void> {
		if (!state || verifierRunning) return;
		if (!verifierArgv) {
			if (force) ctx.ui.notify("No --piv-verify command configured.", "warning");
			return;
		}
		if (!force && state.mutationGeneration <= state.checkedGeneration) return;
		const generation = state.mutationGeneration;
		if (!ctx.isProjectTrusted()) {
			state = {
				...state,
				checkedGeneration: generation,
				verifier: {
					status: "blocked-untrusted",
					generation,
					commandHash: commandHash(verifierArgv),
					failureMessage: "Project is untrusted",
				},
			};
			persist();
			report(ctx, verifierFailureMessage(state.verifier), "error");
			if (isHeadless(ctx)) process.exitCode = 1;
			return;
		}

		verifierRunning = true;
		state = { ...state, verifier: { status: "running", generation, commandHash: commandHash(verifierArgv) } };
		persist();
		const controller = new AbortController();
		const contextSignal = ctx.signal;
		const forwardContextAbort = () => controller.abort();
		if (contextSignal?.aborted) controller.abort();
		else contextSignal?.addEventListener("abort", forwardContextAbort, { once: true });
		const completion = (async () => {
			const result = await runVerifier(verifierArgv!, state!.guardRoot, { signal: controller.signal });
			state = { ...state!, checkedGeneration: generation, verifier: { ...result, generation } };
			persist();
			const passed = result.status === "passed";
			ctx.ui.setStatus("piv-verify", passed ? "passed" : result.status);
			report(ctx, verifierFailureMessage(result), passed ? "info" : "error");
			if (!passed && isHeadless(ctx)) process.exitCode = 1;
		})();
		activeVerifier = { controller, completion, contextSignal, forwardContextAbort };
		try {
			await completion;
		} finally {
			contextSignal?.removeEventListener("abort", forwardContextAbort);
			if (activeVerifier?.completion === completion) activeVerifier = undefined;
			verifierRunning = false;
		}
	}

	pi.registerCommand("plan", {
		description: "Switch to Pi Void plan mode",
		handler: async (_args, ctx) => setMode("plan", ctx),
	});
	pi.registerCommand("build", {
		description: "Switch to Pi Void guarded build mode",
		handler: async (_args, ctx) => setMode("build", ctx),
	});
	pi.registerCommand("piv-verify", {
		description: "Run configured Pi Void verifier",
		handler: async (_args, ctx) => verify(ctx, true),
	});
	pi.registerCommand("piv-status", {
		description: "Show Pi Void guard status",
		handler: async (_args, ctx) => {
			if (!state) return;
			report(
				ctx,
				[
					`Mode: ${state.mode}`,
					`Guard root: ${state.guardRoot}`,
					`Root source: ${state.rootSource}`,
					`Project trusted: ${ctx.isProjectTrusted()}`,
					`Bash requested: ${bashRequested()}`,
					`Bash effective: ${bashEffective(ctx)}`,
					`Mutation generation: ${state.mutationGeneration}`,
					`Checked generation: ${state.checkedGeneration}`,
					`Verifier configured: ${verifierArgv !== undefined}`,
					`Verifier status: ${state.verifier.status}`,
					`Verifier generation: ${state.verifier.generation ?? "none"}`,
					`Latest exit code: ${state.verifier.exitCode ?? "none"}`,
					`Latest duration: ${state.verifier.durationMs ?? "none"}`,
					`Output truncated: ${state.verifier.truncated ?? false}`,
				].join("\n"),
				"info",
			);
		},
	});

	pi.on("tool_call", async (event: ToolCallEvent, ctx) => {
		if (!state || !effectiveTools(ctx).includes(event.toolName)) {
			return { block: true, reason: `Pi Void ${state?.mode ?? "plan"} mode blocks tool "${event.toolName}"` };
		}
		if (event.toolName === "edit" || event.toolName === "write") {
			const reason = validateMutationPath(event.input.path, ctx.cwd, state.guardRoot);
			if (reason) return { block: true, reason };
			authorizedMutations.add(event.toolCallId);
		}
		return undefined;
	});
	pi.on("tool_result", async (event: ToolResultEvent) => {
		if ((event.toolName !== "edit" && event.toolName !== "write") || !authorizedMutations.delete(event.toolCallId))
			return;
		if (!event.isError && state) {
			state = {
				...state,
				mutationGeneration: state.mutationGeneration + 1,
				verifier: verifierArgv
					? { status: "pending", generation: state.mutationGeneration + 1, commandHash: commandHash(verifierArgv) }
					: state.verifier,
			};
			persist();
		}
	});
	pi.on("agent_settled", async (_event, ctx) => verify(ctx, false));
	pi.on("user_bash", async (_event, ctx) => {
		if (state && bashEffective(ctx)) return undefined;
		return {
			result: {
				output: `Pi Void ${state?.mode ?? "plan"} mode blocks user Bash`,
				exitCode: 1,
				cancelled: false,
				truncated: false,
			},
		};
	});

	const restore = async (ctx: ExtensionContext) => {
		verifierArgv = parseVerifierArgv(pi.getFlag("piv-verify"));
		const { baseline, rootSource } = await captureBaseline(pi, ctx);
		const latest = [...ctx.sessionManager.getBranch()]
			.reverse()
			.find((entry) => entry.type === "custom" && entry.customType === STATE_TYPE);
		const restored = latest?.type === "custom" ? parseStoredState(latest.data, baseline.root) : undefined;
		if (latest && !restored) ctx.ui.notify("Ignored invalid Pi Void state entry.", "warning");
		const modeFlag = pi.getFlag("piv-mode");
		const mode = modeFlag === undefined ? (restored?.mode ?? "plan") : parsePivMode(modeFlag);
		authorizedMutations.clear();
		state = {
			version: STATE_VERSION,
			mode,
			guardRoot: baseline.root,
			rootSource,
			baseline: restored?.baseline ?? baseline,
			mutationGeneration: restored?.mutationGeneration ?? 0,
			checkedGeneration: restored?.checkedGeneration ?? 0,
			verifier: restoreVerifierState(restored?.verifier, verifierArgv),
			bashEnabledInRecordedProcess: mode === "build" && bashRequested() && ctx.isProjectTrusted(),
		};
		applyTools(ctx);
		persist();
		ctx.ui.setStatus("piv-mode", mode);
		if (bashEffective(ctx))
			ctx.ui.notify(
				"Bash is enabled for this process. Direct path guards do not contain shell commands.",
				"warning",
			);
	};
	pi.on("session_start", async (_event, ctx) => restore(ctx));
	pi.on("session_tree", async (_event, ctx) => restore(ctx));
	pi.on("session_shutdown", async () => {
		authorizedMutations.clear();
		const current = activeVerifier;
		if (!current) return;
		current.controller.abort();
		await current.completion.catch(() => {});
	});
}

import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { ExtensionAPI, ExtensionContext } from "../src/core/extensions/types.ts";
import pivSafeVerify, {
	createPivSafeVerify,
	parsePivMode,
	parseVerifierArgv,
	runVerifier,
	validateMutationPath,
	validatePivStartupArgs,
} from "../src/piv-safe-verify.ts";

const roots: string[] = [];

function fixture(): { root: string; outside: string } {
	const base = mkdtempSync(join(tmpdir(), "piv-safe-verify-"));
	const root = join(base, "repo");
	const outside = join(base, "outside");
	mkdirSync(root);
	mkdirSync(outside);
	roots.push(base);
	return { root, outside };
}

afterEach(() => {
	process.exitCode = undefined;
	while (roots.length > 0) rmSync(roots.pop()!, { recursive: true, force: true });
});

describe("Pi Void launcher isolation and startup parsing", () => {
	it("loads the bundled guard only through piv and keeps it under --no-extensions", () => {
		const configDir = mkdtempSync(join(tmpdir(), "piv-safe-verify-config-"));
		roots.push(configDir);
		const env = {
			...process.env,
			PI_CODING_AGENT_DIR: configDir,
			PI_OFFLINE: "1",
			PI_SKIP_VERSION_CHECK: "1",
		};
		const stock = spawnSync(process.execPath, ["src/cli.ts", "--help"], {
			cwd: process.cwd(),
			env,
			encoding: "utf8",
		});
		const guarded = spawnSync(process.execPath, ["src/piv.ts", "--no-extensions", "--help"], {
			cwd: process.cwd(),
			env,
			encoding: "utf8",
		});
		expect(stock.status).toBe(0);
		expect(`${stock.stdout}${stock.stderr}`).not.toContain("--piv-mode");
		expect(guarded.status).toBe(0);
		expect(`${guarded.stdout}${guarded.stderr}`).toContain("--piv-mode");
		expect(`${guarded.stdout}${guarded.stderr}`).toContain("--piv-verify");
	});

	it("accepts only exact plan and build modes", () => {
		expect(parsePivMode(undefined)).toBe("plan");
		expect(parsePivMode("plan")).toBe("plan");
		expect(parsePivMode("build")).toBe("build");
		expect(() => parsePivMode("read-only")).toThrow(/Invalid --piv-mode/);
		expect(() => validatePivStartupArgs(["--piv-mode"])).toThrow(/requires plan or build/);
	});

	it("accepts bounded JSON argv and rejects shell strings or unsafe values", () => {
		expect(parseVerifierArgv('["node","--version"]')).toEqual(["node", "--version"]);
		expect(parseVerifierArgv(undefined)).toBeUndefined();
		for (const value of ["npm run check", "[]", '["node",1]', '[""]', '["node\\u0000"]']) {
			expect(() => parseVerifierArgv(value)).toThrow(/piv-verify/);
		}
		expect(() => parseVerifierArgv(JSON.stringify(Array.from({ length: 65 }, () => "x")))).toThrow(/at most 64/);
		expect(() => parseVerifierArgv(JSON.stringify(["x".repeat(4097)]))).toThrow(/up to 4096 bytes/);
	});
});

describe("Pi Void guarded mutation paths", () => {
	it("allows existing and prospective in-root targets", () => {
		const { root } = fixture();
		writeFileSync(join(root, "existing.txt"), "ok");
		expect(validateMutationPath(join(root, "existing.txt"), root, root)).toBeUndefined();
		expect(validateMutationPath("deep/missing/new.txt", root, root)).toBeUndefined();
		expect(validateMutationPath("src/my.git-parser.ts", root, root)).toBeUndefined();
		expect(validateMutationPath("docs/environment.md", root, root)).toBeUndefined();
	});

	it("blocks outside paths, sibling prefixes, protected segments, and credentials", () => {
		const { root, outside } = fixture();
		mkdirSync(`${root}-other`);
		expect(validateMutationPath("../outside/file.txt", root, root)).toMatch(/outside guarded root/);
		expect(validateMutationPath(join(outside, "file.txt"), root, root)).toMatch(/outside guarded root/);
		expect(validateMutationPath(join(`${root}-other`, "file.txt"), root, root)).toMatch(/outside guarded root/);
		expect(validateMutationPath(".git/config", root, root)).toMatch(/protected .git/);
		expect(validateMutationPath("nested/.git/config", root, root)).toMatch(/protected .git/);
		expect(validateMutationPath(".env", root, root)).toMatch(/environment file/);
		expect(validateMutationPath("config/.env.production", root, root)).toMatch(/environment file/);
		expect(validateMutationPath("config/credentials.json", root, root)).toMatch(/credential file/);
	});

	it("blocks existing and prospective symlink escapes", () => {
		const { root, outside } = fixture();
		const outsideFile = join(outside, "secret.txt");
		writeFileSync(outsideFile, "secret");
		symlinkSync(outside, join(root, "linked-dir"), "dir");
		symlinkSync(outsideFile, join(root, "linked-file"), "file");
		expect(validateMutationPath("linked-dir/new.txt", root, root)).toMatch(/outside guarded root/);
		expect(validateMutationPath("linked-file", root, root)).toMatch(/outside guarded root/);
	});
});

type Handler = (event: Record<string, unknown>, ctx: ExtensionContext) => Promise<unknown> | unknown;

function extensionFixture(
	options: {
		flags?: Record<string, boolean | string | undefined>;
		trusted?: boolean;
		entries?: Array<Record<string, unknown>>;
		verifyResult?: { stdout: string; stderr: string; code: number; killed: boolean };
		onModeChange?: (mode: "plan" | "build", ctx: ExtensionContext) => Promise<void>;
		hasUI?: boolean;
		planChoice?: string;
		planRefinement?: string;
		abort?: () => void;
	} = {},
) {
	const { root } = fixture();
	const handlers = new Map<string, Handler>();
	const commands = new Map<string, (args: string, ctx: ExtensionContext) => Promise<void> | void>();
	const activeTools: string[][] = [];
	const tools = new Map<string, { execute: (...args: unknown[]) => Promise<unknown> }>();
	const appended: Array<{ customType: string; data: unknown }> = [];
	const notifications: string[] = [];
	const sentMessages: string[] = [];
	const steeredMessages: string[] = [];
	const entries = options.entries ?? [];
	const verifierExec = vi.fn(
		async (_command: string, _args: string[], _execOptions?: unknown) =>
			options.verifyResult ?? { stdout: "ok", stderr: "", code: 0, killed: false },
	);
	const api = {
		registerFlag: vi.fn(),
		registerTool(tool: { name: string; execute: (...args: unknown[]) => Promise<unknown> }) {
			tools.set(tool.name, tool);
		},
		registerCommand(
			name: string,
			command: { handler: (args: string, ctx: ExtensionContext) => Promise<void> | void },
		) {
			commands.set(name, command.handler);
		},
		on(event: string, handler: Handler) {
			handlers.set(event, handler);
		},
		getFlag(name: string) {
			return options.flags?.[name];
		},
		sendMessage(message: { content: string }) {
			steeredMessages.push(message.content);
		},
		sendUserMessage(content: string) {
			sentMessages.push(content);
		},
		setActiveTools(tools: string[]) {
			activeTools.push([...tools]);
		},
		appendEntry(customType: string, data: unknown) {
			appended.push({ customType, data });
			entries.push({ type: "custom", customType, data });
		},
		exec: async (command: string, args: string[], execOptions?: unknown) => {
			if (command !== "git") return verifierExec(command, args, execOptions);
			if (args[0] === "rev-parse" && args[1] === "--show-toplevel")
				return { stdout: `${root}\n`, stderr: "", code: 0, killed: false };
			if (args[0] === "rev-parse") return { stdout: "abc123\n", stderr: "", code: 0, killed: false };
			if (args[0] === "branch") return { stdout: "test\n", stderr: "", code: 0, killed: false };
			return { stdout: "", stderr: "", code: 0, killed: false };
		},
	} as unknown as ExtensionAPI;
	const ctx = {
		cwd: root,
		mode: options.hasUI ? "tui" : "print",
		hasUI: options.hasUI ?? false,
		isProjectTrusted: () => options.trusted ?? true,
		abort: options.abort ?? vi.fn(),
		signal: undefined,
		sessionManager: { getBranch: () => entries },
		ui: {
			notify: (message: string) => notifications.push(message),
			setStatus: vi.fn(),
			select: async () => options.planChoice,
			input: async () => options.planRefinement,
		},
	} as unknown as ExtensionContext;
	(options.onModeChange ? createPivSafeVerify({ onModeChange: options.onModeChange }) : pivSafeVerify)(api);
	return {
		activeTools,
		appended,
		tools,
		commands,
		ctx,
		notifications,
		sentMessages,
		steeredMessages,
		verifierExec,
		async emit(event: string, value: Record<string, unknown> = {}) {
			const handler = handlers.get(event);
			if (!handler) throw new Error(`Missing handler: ${event}`);
			return await handler({ type: event, ...value }, ctx);
		},
	};
}

async function draftPlan(
	runtime: ReturnType<typeof extensionFixture>,
	title = "Add guard",
	markdown = "1. Add tests",
): Promise<void> {
	await runtime.tools.get("draft_plan")!.execute("draft-1", { title, markdown }, undefined, undefined, runtime.ctx);
}

async function successfulMutation(runtime: ReturnType<typeof extensionFixture>, id = "mutation-1") {
	expect(
		await runtime.emit("tool_call", { toolCallId: id, toolName: "write", input: { path: "file.txt", content: "x" } }),
	).toBeUndefined();
	await runtime.emit("tool_result", {
		toolCallId: id,
		toolName: "write",
		input: { path: "file.txt" },
		content: [],
		details: undefined,
		isError: false,
	});
}

describe("Pi Void guarded extension", () => {
	it("applies restored mode routing during session start", async () => {
		const onModeChange = vi.fn(async () => {});
		const runtime = extensionFixture({ flags: { "piv-mode": "plan" }, onModeChange });
		await runtime.emit("session_start");
		expect(onModeChange).toHaveBeenCalledWith("plan", runtime.ctx);
	});

	it("injects OMP-style planning instructions while in plan mode", async () => {
		const runtime = extensionFixture();
		await runtime.emit("session_start");
		const result = await runtime.emit("before_agent_start", { prompt: "Plan a refactor" });
		expect(result).toMatchObject({
			message: { customType: "piv-plan-mode-context", display: false },
		});
		expect((result as { message: { content: string } }).message.content).toContain("You are in Pi Void plan mode");
		const content = (result as { message: { content: string } }).message.content;
		expect(content).toContain("MUST call draft_plan first");
		expect(content).toContain("MUST call propose_plan");
		expect(content).toContain("Critical files & anchors");
		expect(content).toContain("decision-complete execution spec");
	});

	it("injects approved-plan execution instructions in build mode", async () => {
		const runtime = extensionFixture({ hasUI: true, planChoice: "approve" });
		await runtime.emit("session_start");
		await draftPlan(runtime);
		await runtime.tools
			.get("propose_plan")!
			.execute("plan-1", { title: "Add guard" }, undefined, undefined, runtime.ctx);
		const result = await runtime.emit("before_agent_start", { prompt: "Continue" });
		expect(result).toMatchObject({
			message: { customType: "piv-approved-plan-context", display: false },
		});
		expect((result as { message: { content: string } }).message.content).toContain("MUST call read_plan");
		expect((result as { message: { content: string } }).message.content).toContain("authoritative");
	});

	it("applies the default plan tool set and independently denies unknown calls", async () => {
		const plan = extensionFixture();
		await plan.emit("session_start");
		expect(plan.activeTools.at(-1)).toEqual([
			"read",
			"grep",
			"find",
			"ls",
			"draft_plan",
			"propose_plan",
			"read_plan",
		]);
		expect(await plan.emit("tool_call", { toolCallId: "1", toolName: "edit", input: { path: "x" } })).toMatchObject({
			block: true,
		});
		expect(await plan.emit("tool_call", { toolCallId: "2", toolName: "mcp_unknown", input: {} })).toMatchObject({
			block: true,
		});

		const build = extensionFixture({ flags: { "piv-mode": "build", "piv-allow-bash": true } });
		await build.emit("session_start");
		expect(build.activeTools.at(-1)).toEqual(["read", "grep", "find", "ls", "read_plan", "edit", "write", "bash"]);
		expect(
			await build.emit("tool_call", { toolCallId: "3", toolName: "bash", input: { command: "true" } }),
		).toBeUndefined();
		expect(build.notifications).toContain(
			"Bash is enabled for this process. Direct path guards do not contain shell commands.",
		);
	});

	it("drafts a plan before proposing it for approval", async () => {
		const runtime = extensionFixture();
		await runtime.emit("session_start");
		const draft = runtime.tools.get("draft_plan");
		expect(draft).toBeDefined();
		await draft!.execute(
			"draft-1",
			{ title: "Add guard", markdown: "1. Add tests" },
			undefined,
			undefined,
			runtime.ctx,
		);
		const result = await runtime.tools
			.get("propose_plan")!
			.execute("proposal-1", { title: "Add guard" }, undefined, undefined, runtime.ctx);
		expect(result).toMatchObject({ content: [{ type: "text", text: expect.stringContaining("pending") }] });
		expect(runtime.appended.at(-1)?.data).toMatchObject({ plan: { status: "pending", title: "Add guard" } });
	});

	it("stores plan proposals outside model context", async () => {
		const runtime = extensionFixture();
		await runtime.emit("session_start");
		await draftPlan(runtime, "Add guard", "1. Add tests\n2. Run checks");
		const result = await runtime.tools
			.get("propose_plan")!
			.execute("plan-1", { title: "Add guard" }, undefined, undefined, runtime.ctx);
		expect(result).toMatchObject({ content: [{ type: "text", text: expect.stringContaining("pending") }] });
		expect(runtime.appended.at(-1)?.data).toMatchObject({
			plan: { status: "pending", title: "Add guard", markdown: "1. Add tests\n2. Run checks" },
		});
	});

	it("does not auto-approve plans in headless mode", async () => {
		const runtime = extensionFixture();
		await runtime.emit("session_start");
		await draftPlan(runtime);
		await runtime.tools
			.get("propose_plan")!
			.execute("plan-1", { title: "Add guard" }, undefined, undefined, runtime.ctx);
		await runtime.emit("agent_settled");
		expect(runtime.appended.at(-1)?.data).toMatchObject({ mode: "plan", plan: { status: "pending" } });
	});

	it("approves a pending plan in interactive mode and gates first mutation on read_plan", async () => {
		const onModeChange = vi.fn(async () => {});
		const runtime = extensionFixture({ hasUI: true, planChoice: "approve", onModeChange });
		await runtime.emit("session_start");
		await draftPlan(runtime);
		await runtime.tools
			.get("propose_plan")!
			.execute("plan-1", { title: "Add guard" }, undefined, undefined, runtime.ctx);
		expect(onModeChange).toHaveBeenLastCalledWith("build", runtime.ctx);
		expect(runtime.steeredMessages).toHaveLength(1);
		expect(runtime.ctx.abort).toHaveBeenCalledOnce();
		expect(runtime.steeredMessages[0]).toContain("MUST call read_plan");
		expect(
			await runtime.emit("tool_call", { toolCallId: "write-1", toolName: "write", input: { path: "x" } }),
		).toMatchObject({
			block: true,
			reason: expect.stringContaining("read_plan"),
		});
		await runtime.tools.get("read_plan")!.execute("plan-read", {}, undefined, undefined, runtime.ctx);
		expect(
			await runtime.emit("tool_call", { toolCallId: "write-2", toolName: "write", input: { path: "x" } }),
		).toBeUndefined();
	});

	it("refines or cancels a pending plan without entering build mode", async () => {
		const refinement = extensionFixture({ hasUI: true, planChoice: "refine", planRefinement: "Add rollback step" });
		await refinement.emit("session_start");
		await draftPlan(refinement);
		await refinement.tools
			.get("propose_plan")!
			.execute("plan-1", { title: "Add guard" }, undefined, undefined, refinement.ctx);
		expect(refinement.sentMessages).toHaveLength(1);
		expect(refinement.sentMessages[0]).toContain("Add rollback step");
		expect(refinement.appended.at(-1)?.data).toMatchObject({ mode: "plan", plan: { status: "pending" } });

		const cancelled = extensionFixture({ hasUI: true, planChoice: "cancel" });
		await cancelled.emit("session_start");
		await draftPlan(cancelled);
		await cancelled.tools
			.get("propose_plan")!
			.execute("plan-1", { title: "Add guard" }, undefined, undefined, cancelled.ctx);
		expect(cancelled.appended.at(-1)?.data).toMatchObject({ plan: { status: "none", readInBuild: false } });
	});

	it("requires rereading approved plan after leaving and reentering build mode", async () => {
		const runtime = extensionFixture({ hasUI: true, planChoice: "approve" });
		await runtime.emit("session_start");
		await draftPlan(runtime);
		await runtime.tools
			.get("propose_plan")!
			.execute("plan-1", { title: "Add guard" }, undefined, undefined, runtime.ctx);
		await runtime.tools.get("read_plan")!.execute("plan-read", {}, undefined, undefined, runtime.ctx);
		await runtime.commands.get("plan")!("", runtime.ctx);
		await runtime.commands.get("build")!("", runtime.ctx);
		expect(
			await runtime.emit("tool_call", {
				toolCallId: "write-after-reentry",
				toolName: "write",
				input: { path: "x" },
			}),
		).toMatchObject({ block: true, reason: expect.stringContaining("read_plan") });
	});

	it("migrates version 1 guarded state without losing mode or generations", async () => {
		const initial = extensionFixture({ flags: { "piv-mode": "build" } });
		await initial.emit("session_start");
		await successfulMutation(initial);
		const saved = structuredClone(initial.appended.at(-1)!);
		const oldState = saved.data as { version: number; plan?: unknown };
		oldState.version = 1;
		delete oldState.plan;
		const resumed = extensionFixture({
			entries: [{ type: "custom", customType: saved.customType, data: saved.data }],
		});
		(saved.data as { guardRoot: string; baseline: { root: string } }).guardRoot = resumed.ctx.cwd;
		(saved.data as { baseline: { root: string } }).baseline.root = resumed.ctx.cwd;
		await resumed.emit("session_start");
		expect(resumed.appended.at(-1)?.data).toMatchObject({
			version: 2,
			mode: "build",
			mutationGeneration: 1,
			plan: { status: "none", readInBuild: false },
		});
	});

	it("restores approved plan outside model context and requires reread after compaction", async () => {
		const initial = extensionFixture({ hasUI: true, planChoice: "approve" });
		await initial.emit("session_start");
		await draftPlan(initial);
		await initial.tools
			.get("propose_plan")!
			.execute("plan-1", { title: "Add guard" }, undefined, undefined, initial.ctx);
		await initial.tools.get("read_plan")!.execute("plan-read", {}, undefined, undefined, initial.ctx);
		const saved = structuredClone(initial.appended.at(-1)!);
		const resumed = extensionFixture({
			entries: [{ type: "custom", customType: saved.customType, data: saved.data }],
		});
		(saved.data as { guardRoot: string; baseline: { root: string } }).guardRoot = resumed.ctx.cwd;
		(saved.data as { baseline: { root: string } }).baseline.root = resumed.ctx.cwd;
		await resumed.emit("session_start");
		expect(resumed.appended.at(-1)?.data).toMatchObject({ plan: { status: "approved", readInBuild: true } });
		await resumed.emit("session_compact");
		expect(resumed.appended.at(-1)?.data).toMatchObject({ plan: { status: "approved", readInBuild: false } });
	});

	it("reports default plan status in print mode", async () => {
		const runtime = extensionFixture();
		const consoleError = vi.spyOn(console, "error").mockImplementation(() => {});
		try {
			await runtime.emit("session_start");
			await runtime.commands.get("piv-status")!("", runtime.ctx);
			expect(consoleError).toHaveBeenCalledWith(expect.stringContaining("Mode: plan"));
			expect(consoleError).toHaveBeenCalledWith(expect.stringContaining("Verifier status: not-configured"));
		} finally {
			consoleError.mockRestore();
		}
	});

	it("requires current-process Bash opt-in and project trust", async () => {
		const untrusted = extensionFixture({ flags: { "piv-mode": "build", "piv-allow-bash": true }, trusted: false });
		await untrusted.emit("session_start");
		expect(untrusted.activeTools.at(-1)).toEqual(["read", "grep", "find", "ls", "read_plan", "edit", "write"]);
		expect(
			await untrusted.emit("tool_call", { toolCallId: "1", toolName: "bash", input: { command: "true" } }),
		).toMatchObject({ block: true });
		expect(await untrusted.emit("user_bash", { command: "true", cwd: untrusted.ctx.cwd })).toMatchObject({
			result: { exitCode: 1 },
		});
	});

	it("counts only authorized successful mutations", async () => {
		const runtime = extensionFixture({ flags: { "piv-mode": "build" } });
		await runtime.emit("session_start");
		await runtime.emit("tool_result", {
			toolCallId: "missing",
			toolName: "write",
			input: {},
			content: [],
			isError: false,
		});
		await runtime.emit("tool_call", { toolCallId: "failed", toolName: "write", input: { path: "x" } });
		await runtime.emit("tool_result", {
			toolCallId: "failed",
			toolName: "write",
			input: {},
			content: [],
			isError: true,
		});
		await successfulMutation(runtime);
		expect(runtime.appended.at(-1)?.data).toMatchObject({ mutationGeneration: 1 });
	});

	it("verifies latest generation once from the canonical root", async () => {
		const command = JSON.stringify([
			process.execPath,
			"-e",
			`process.exit(process.cwd() === ${JSON.stringify(process.cwd())} ? 9 : 0)`,
		]);
		const runtime = extensionFixture({ flags: { "piv-mode": "build", "piv-verify": command } });
		await runtime.emit("session_start");
		await successfulMutation(runtime);
		await runtime.emit("agent_settled");
		const entriesAfterFirst = runtime.appended.length;
		await runtime.emit("agent_settled");
		expect(runtime.appended).toHaveLength(entriesAfterFirst);
		expect(runtime.appended.at(-1)?.data).toMatchObject({
			mutationGeneration: 1,
			checkedGeneration: 1,
			verifier: { status: "passed", generation: 1 },
		});
	});

	it("records untrusted verification once and fails headless execution", async () => {
		const runtime = extensionFixture({
			flags: { "piv-mode": "build", "piv-verify": '["node","check.js"]' },
			trusted: false,
		});
		await runtime.emit("session_start");
		await successfulMutation(runtime);
		await runtime.emit("agent_settled");
		expect(runtime.verifierExec).not.toHaveBeenCalled();
		expect(runtime.appended.at(-1)?.data).toMatchObject({
			checkedGeneration: 1,
			verifier: { status: "blocked-untrusted", generation: 1 },
		});
		expect(process.exitCode).toBe(1);
	});

	it("cancels and awaits an active verifier during session shutdown", async () => {
		const command = JSON.stringify([process.execPath, "-e", "setInterval(() => {}, 1000)"]);
		const runtime = extensionFixture({ flags: { "piv-mode": "build", "piv-verify": command } });
		const consoleError = vi.spyOn(console, "error").mockImplementation(() => {});
		try {
			await runtime.emit("session_start");
			const verification = Promise.resolve(runtime.commands.get("piv-verify")!("", runtime.ctx));
			await vi.waitFor(() =>
				expect(runtime.appended.at(-1)?.data).toMatchObject({ verifier: { status: "running" } }),
			);
			await runtime.emit("session_shutdown", { reason: "quit" });
			await verification;
			expect(runtime.appended.at(-1)?.data).toMatchObject({ verifier: { status: "cancelled" } });
		} finally {
			consoleError.mockRestore();
		}
	});

	it("converts an interrupted durable running state to cancelled on restore", async () => {
		const command = JSON.stringify([process.execPath, "-e", "process.exit(0)"]);
		const initial = extensionFixture({ flags: { "piv-mode": "build", "piv-verify": command } });
		await initial.emit("session_start");
		const saved = structuredClone(initial.appended.at(-1)!);
		(saved.data as { verifier: { status: string; generation?: number } }).verifier.status = "running";
		(saved.data as { verifier: { status: string; generation?: number } }).verifier.generation = 0;
		const resumed = extensionFixture({
			flags: { "piv-verify": command },
			entries: [{ type: "custom", customType: saved.customType, data: saved.data }],
		});
		const resumedRoot = resumed.ctx.cwd;
		(saved.data as { guardRoot: string; baseline: { root: string } }).guardRoot = resumedRoot;
		(saved.data as { baseline: { root: string } }).baseline.root = resumedRoot;
		await resumed.emit("session_start");
		expect(resumed.appended.at(-1)?.data).toMatchObject({
			verifier: { status: "cancelled", failureMessage: "Previous verifier was interrupted before completion" },
		});
	});

	it("restores valid same-root mode but never restores Bash authority", async () => {
		const initial = extensionFixture({ flags: { "piv-mode": "build" } });
		await initial.emit("session_start");
		const saved = initial.appended.at(-1)!;
		const resumed = extensionFixture({
			entries: [{ type: "custom", customType: saved.customType, data: saved.data }],
		});
		const resumedRoot = resumed.ctx.cwd;
		(saved.data as { guardRoot: string; baseline: { root: string } }).guardRoot = resumedRoot;
		(saved.data as { baseline: { root: string } }).baseline.root = resumedRoot;
		await resumed.emit("session_start");
		expect(resumed.activeTools.at(-1)).toEqual(["read", "grep", "find", "ls", "read_plan", "edit", "write"]);
		expect(resumed.appended.at(-1)?.data).toMatchObject({ mode: "build", bashEnabledInRecordedProcess: false });
	});
});

describe("Pi Void verifier process lifecycle and result mapping", () => {
	const linuxIt = process.platform === "linux" ? it : it.skip;

	linuxIt("kills the verifier process group, including a SIGTERM-resistant descendant", async () => {
		const { root } = fixture();
		const pidFile = join(root, "descendant.pid");
		let descendantPid: number | undefined;
		const isRunning = (pid: number) => {
			try {
				process.kill(pid, 0);
				const stat = readFileSync(`/proc/${pid}/stat`, "utf8");
				return !stat.includes(") Z ");
			} catch {
				return false;
			}
		};
		try {
			const descendant = "process.on('SIGTERM', () => {}); setInterval(() => {}, 1000)";
			const parent = [
				"const { spawn } = require('node:child_process');",
				"const { writeFileSync } = require('node:fs');",
				`const child = spawn(process.execPath, ['-e', ${JSON.stringify(descendant)}], { stdio: 'inherit' });`,
				`writeFileSync(${JSON.stringify(pidFile)}, String(child.pid));`,
				"child.unref();",
			].join(" ");
			const result = await runVerifier([process.execPath, "-e", parent], root, {
				timeoutMs: 100,
				terminationGraceMs: 50,
			});
			descendantPid = Number(readFileSync(pidFile, "utf8"));
			expect(result.status).toBe("timed-out");
			await vi.waitFor(() => expect(isRunning(descendantPid!)).toBe(false), { timeout: 2000, interval: 25 });
		} finally {
			if (descendantPid && isRunning(descendantPid)) process.kill(descendantPid, "SIGKILL");
		}
	});

	it("maps pass, failure, timeout, cancellation, spawn errors, and bounded output", async () => {
		const { root } = fixture();
		const passed = await runVerifier(["node"], root, {
			exec: async () => ({ stdout: "ok", stderr: "", code: 0, killed: false }),
		});
		const failed = await runVerifier(["node"], root, {
			exec: async () => ({ stdout: "", stderr: "bad", code: 7, killed: false }),
		});
		const bounded = await runVerifier(["node"], root, {
			outputLimitBytes: 8,
			exec: async () => ({ stdout: "123456", stderr: "abcdef", code: 0, killed: false }),
		});
		const spawnError = await runVerifier(["missing"], root, {
			exec: async () => {
				throw new Error("ENOENT");
			},
		});
		const timeout = await runVerifier(["node"], root, {
			timeoutMs: 1,
			exec: async (_command, _args, options) =>
				await new Promise((resolve) =>
					options?.signal?.addEventListener(
						"abort",
						() => resolve({ stdout: "", stderr: "", code: 1, killed: true }),
						{ once: true },
					),
				),
		});
		const controller = new AbortController();
		controller.abort();
		const cancelled = await runVerifier(["node"], root, {
			signal: controller.signal,
			exec: async () => ({ stdout: "", stderr: "", code: 1, killed: true }),
		});
		expect(passed.status).toBe("passed");
		expect(failed).toMatchObject({ status: "failed", exitCode: 7 });
		expect(Buffer.byteLength((bounded.stdout ?? "") + (bounded.stderr ?? ""))).toBe(8);
		expect(bounded.truncated).toBe(true);
		expect(spawnError).toMatchObject({ status: "spawn-error", failureMessage: "ENOENT" });
		expect(timeout.status).toBe("timed-out");
		expect(cancelled.status).toBe("cancelled");
	});
});

import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import type { ExtensionAPI, ExtensionContext } from "../src/core/extensions/types.ts";
import {
	canAttemptCircuit,
	cogneeSessionId,
	createCircuitState,
	createPendingRemember,
	createPivCogneeExtension,
	enqueuePendingRemember,
	extractMessageText,
	loadPivCogneeConfig,
	noteCircuitFailure,
	readPendingRemember,
	redactMemoryText,
	resolveCogneeApiKey,
	resolvePivCogneeConfig,
	truncateForCapture,
	updatePendingRememberState,
} from "../src/piv-cognee.ts";
import { type CogneeClientConfig, CogneeError, createCogneeClient } from "../src/piv-cognee-client.ts";
import { parseEnvFile } from "../src/piv-cognee-env.ts";

function config(overrides: Partial<CogneeClientConfig> = {}): CogneeClientConfig {
	return {
		baseUrl: "http://127.0.0.1:8211/",
		dataset: "pi-void",
		recallBudgetMs: 1500,
		maxResponseChars: 6000,
		...overrides,
	};
}

describe("piv-cognee HTTP client", () => {
	it("scopes recall to the configured dataset and normalizes results", async () => {
		let requestUrl = "";
		let requestInit: RequestInit | undefined;
		const client = createCogneeClient(config({ apiKey: "secret-key" }), {
			fetch: async (input, init) => {
				requestUrl = String(input);
				requestInit = init;
				return new Response(JSON.stringify([{ text: "remembered fact", score: 0.9 }]), {
					status: 200,
					headers: { "content-type": "application/json" },
				});
			},
		});

		await expect(client.recall("remember this", { topK: 3, sessionId: "session-1" })).resolves.toEqual([
			{ text: "remembered fact", score: 0.9 },
		]);
		expect(requestUrl).toBe("http://127.0.0.1:8211/api/v1/recall");
		expect(requestInit?.method).toBe("POST");
		expect(new Headers(requestInit?.headers).get("x-api-key")).toBe("secret-key");
		expect(JSON.parse(String(requestInit?.body))).toEqual({
			query: "remember this",
			topK: 3,
			onlyContext: true,
			scope: ["session", "trace", "graph"],
			sessionId: "session-1",
			datasets: ["pi-void"],
		});
	});

	it("stores session cache entries via remember/entry", async () => {
		let requestUrl = "";
		let requestInit: RequestInit | undefined;
		const client = createCogneeClient(config({ apiKey: "secret-key" }), {
			fetch: async (input, init) => {
				requestUrl = String(input);
				requestInit = init;
				return new Response(JSON.stringify({ entry_id: "e1" }), { status: 200 });
			},
		});

		await expect(
			client.rememberEntry({
				sessionId: "piv_session-1",
				entry: { type: "qa", question: "q", answer: "a", context: "" },
			}),
		).resolves.toEqual({ entryId: "e1" });
		expect(requestUrl).toBe("http://127.0.0.1:8211/api/v1/remember/entry");
		expect(JSON.parse(String(requestInit?.body))).toMatchObject({
			session_id: "piv_session-1",
			dataset_name: "pi-void",
			entry: { type: "qa", question: "q", answer: "a" },
		});
	});

	it("reports an unavailable improve endpoint instead of resolving", async () => {
		const client = createCogneeClient(config(), {
			fetch: async () => new Response(null, { status: 404 }),
		});

		await expect(client.improve()).rejects.toSatisfy((error: unknown) => {
			return error instanceof CogneeError && error.kind === "not_found" && error.status === 404;
		});
	});

	it("sends the Cognee v1 improve payload fields", async () => {
		let requestInit: RequestInit | undefined;
		const client = createCogneeClient(config(), {
			fetch: async (_input, init) => {
				requestInit = init;
				return new Response(null, { status: 200 });
			},
		});

		await client.improve({ dataset: "pi-void-smoke", sessionIds: ["session-1"] });

		expect(JSON.parse(String(requestInit?.body))).toEqual({
			datasetName: "pi-void-smoke",
			sessionIds: ["session-1"],
			runInBackground: true,
		});
	});

	it("sends remember as background multipart data", async () => {
		let requestInit: RequestInit | undefined;
		const client = createCogneeClient(config(), {
			fetch: async (_input, init) => {
				requestInit = init;
				return new Response(null, { status: 202 });
			},
		});

		await client.remember({ nodeSet: "agent_actions", text: "compaction summary" });

		expect(requestInit?.method).toBe("POST");
		expect(requestInit?.body).toBeInstanceOf(FormData);
		const form = requestInit?.body as FormData;
		expect(form.get("datasetName")).toBe("pi-void");
		expect(form.get("node_set")).toBe("agent_actions");
		expect(form.get("run_in_background")).toBe("true");
		const data = form.get("data");
		expect(data).toBeInstanceOf(Blob);
		await expect((data as Blob).text()).resolves.toBe("compaction summary");
	});

	it("classifies HTTP failures without exposing the API key", async () => {
		const client = createCogneeClient(config({ apiKey: "do-not-log" }), {
			fetch: async () => new Response("unauthorized", { status: 401 }),
		});

		await expect(client.recall("query")).rejects.toSatisfy((error: unknown) => {
			return error instanceof CogneeError && error.kind === "auth_failed" && !error.message.includes("do-not-log");
		});
	});
});

describe("piv-cognee state helpers", () => {
	it("resolves safe defaults and validates environment overrides", () => {
		expect(resolvePivCogneeConfig(undefined, {})).toMatchObject({
			enabled: true,
			autoRecall: true,
			autoRemember: "compaction",
			captureSession: true,
			captureTools: true,
			autoImprove: true,
			baseUrl: "http://127.0.0.1:8211",
			dataset: "pi-void",
		});
		expect(
			resolvePivCogneeConfig(undefined, {
				PI_COGNEE_ENABLED: "false",
				PI_COGNEE_RECALL: "0",
				PI_COGNEE_REMEMBER: "off",
				PI_COGNEE_CAPTURE: "0",
				PI_COGNEE_IMPROVE: "false",
				PI_COGNEE_DATASET: "repo-memory",
			}),
		).toMatchObject({
			enabled: false,
			autoRecall: false,
			autoRemember: "off",
			captureSession: false,
			autoImprove: false,
			dataset: "repo-memory",
		});
		expect(() => resolvePivCogneeConfig(undefined, { PI_COGNEE_ENABLED: "sometimes" })).toThrow(/PI_COGNEE_ENABLED/);
	});

	it("redacts common credentials and respects the memory cap", () => {
		const redacted = redactMemoryText(
			`COGNEE_API_KEY=secret-value\nAuthorization: Bearer bearer-value\n${"x".repeat(200)}`,
			80,
		);

		expect(redacted).not.toContain("secret-value");
		expect(redacted).not.toContain("bearer-value");
		expect(redacted).toContain("[REDACTED]");
		expect(redacted.length).toBeLessThanOrEqual(80);
	});

	it("prefers process env, then mint cache, then merged file env", () => {
		// Stale ~/.cognee/.env must not beat a fresh mint when process.env has no key
		expect(
			resolveCogneeApiKey(
				{ COGNEE_API_KEY: "stale-file-key" },
				'{"api_key":"cached-key","base_url":"http://127.0.0.1:8211"}',
				"http://127.0.0.1:8211",
				{}, // empty process env
			),
		).toBe("cached-key");
		expect(
			resolveCogneeApiKey({ COGNEE_API_KEY: "stale-file-key" }, '{"api_key":"cached-key"}', undefined, {
				COGNEE_API_KEY: " process-key ",
			}),
		).toBe("process-key");
		expect(resolveCogneeApiKey({ COGNEE_API_KEY: "file-only" }, undefined, undefined, {})).toBe("file-only");
		expect(resolveCogneeApiKey({}, "not-json", undefined, {})).toBeUndefined();
	});

	it("bounds pending remember records without silently exceeding the queue limit", async () => {
		const directory = mkdtempSync(join(tmpdir(), "piv-cognee-queue-"));
		try {
			const first = createPendingRemember("summary one", "pi-void", "agent_actions", 100);
			const second = createPendingRemember("summary two", "pi-void", "agent_actions", 101);
			expect(await enqueuePendingRemember(directory, first, 1)).toBe(true);
			expect(await enqueuePendingRemember(directory, second, 1)).toBe(false);
			expect(await readPendingRemember(directory)).toEqual([first]);
		} finally {
			rmSync(directory, { recursive: true, force: true });
		}
	});

	it("opens after three failures and permits a later half-open trial", () => {
		let state = createCircuitState();
		state = noteCircuitFailure(state, "unreachable", 100);
		state = noteCircuitFailure(state, "unreachable", 101);
		state = noteCircuitFailure(state, "unreachable", 102);
		expect(canAttemptCircuit(state, 103)).toBe(false);
		expect(canAttemptCircuit(state, 30_103)).toBe(true);
	});
});

type Hook = (event: unknown, ctx: ExtensionContext) => Promise<unknown> | unknown;

function extensionHookFixture(
	storageDir: string,
	hasUI = false,
	env: NodeJS.ProcessEnv = {},
	fetchImpl?: typeof fetch,
) {
	const handlers = new Map<string, Hook>();
	const commands = new Map<string, (args: string, ctx: ExtensionContext) => Promise<void> | void>();
	const tools = new Map<string, { execute: (...args: unknown[]) => Promise<unknown> }>();
	const activeToolSets: string[][] = [];
	const appended: Array<{ customType: string; data: unknown }> = [];
	const notifications: string[] = [];
	const requests: string[] = [];
	const requestBodies: Array<{ url: string; body?: string }> = [];
	const currentTools = ["read", "grep", "cognee_search"];
	const api = {
		on(event: string, handler: Hook) {
			handlers.set(event, handler);
		},
		registerCommand(
			name: string,
			command: { handler: (args: string, ctx: ExtensionContext) => Promise<void> | void },
		) {
			commands.set(name, command.handler);
		},
		registerTool(tool: { name: string; execute: (...args: unknown[]) => Promise<unknown> }) {
			tools.set(tool.name, tool);
		},
		getActiveTools: () => [...currentTools],
		setActiveTools(toolNames: string[]) {
			activeToolSets.push([...toolNames]);
			currentTools.splice(0, currentTools.length, ...toolNames);
		},
		appendEntry(customType: string, data: unknown) {
			appended.push({ customType, data });
		},
	} as unknown as ExtensionAPI;
	const ctx = {
		hasUI,
		signal: undefined,
		ui: {
			notify: (message: string) => notifications.push(message),
			setStatus: () => undefined,
		},
		sessionManager: { getSessionId: () => "session-1" },
	} as unknown as ExtensionContext;
	const defaultFetch: typeof fetch = async (input, init) => {
		const url = String(input);
		requests.push(url);
		requestBodies.push({ url, body: typeof init?.body === "string" ? init.body : undefined });
		if (url.endsWith("/recall")) {
			return new Response(JSON.stringify([{ text: "remembered context" }]), { status: 200 });
		}
		if (url.includes("/remember/entry")) {
			return new Response(JSON.stringify({ entry_id: "entry-1" }), { status: 200 });
		}
		if (url.includes("/improve") || url.includes("/agents/")) {
			return new Response(JSON.stringify({ status: "ok" }), { status: 200 });
		}
		return new Response(null, { status: 202 });
	};
	createPivCogneeExtension({ storageDir, env, fetch: fetchImpl ?? defaultFetch })(api);
	return { handlers, commands, tools, activeToolSets, appended, notifications, requests, requestBodies, ctx };
}

async function waitFor(condition: () => boolean): Promise<void> {
	for (let attempt = 0; attempt < 100 && !condition(); attempt++) {
		await new Promise((resolve) => setTimeout(resolve, 1));
	}
	if (!condition()) throw new Error("condition was not met before timeout");
}

describe("piv-cognee extension hooks", () => {
	it("injects transient recall and queues a redacted compaction summary", async () => {
		const storageDir = mkdtempSync(join(tmpdir(), "piv-cognee-extension-"));
		try {
			const runtime = extensionHookFixture(storageDir);
			await runtime.handlers.get("session_start")?.({ type: "session_start", reason: "startup" }, runtime.ctx);
			const recall = await runtime.handlers.get("before_agent_start")?.(
				{ type: "before_agent_start", prompt: "What did we decide?" },
				runtime.ctx,
			);
			expect(recall).toMatchObject({ message: { customType: "piv-cognee-recall", display: false } });
			expect((recall as { message: { content: string } }).message.content).toContain("remembered context");

			await runtime.handlers.get("session_compact")?.(
				{
					type: "session_compact",
					compactionEntry: { summary: "API_KEY=secret-value\nWe chose the queue." },
					reason: "manual",
					fromExtension: false,
					willRetry: false,
				},
				runtime.ctx,
			);
			const records = await readPendingRemember(join(storageDir, "pending"));
			expect(records).toHaveLength(1);
			expect(records[0]?.text).not.toContain("secret-value");
			expect(records[0]?.text).toContain("We chose the queue.");
			expect(runtime.appended[0]).toMatchObject({ customType: "piv-cognee" });
			expect(runtime.appended[0]?.data).not.toHaveProperty("text");
		} finally {
			rmSync(storageDir, { recursive: true, force: true });
		}
	});

	it("returns the Cognee anchor through Pi's compaction contract", async () => {
		const storageDir = mkdtempSync(join(tmpdir(), "piv-cognee-anchor-"));
		try {
			const runtime = extensionHookFixture(storageDir);
			await runtime.handlers.get("session_start")?.({ type: "session_start", reason: "startup" }, runtime.ctx);
			const result = await runtime.handlers.get("session_before_compact")?.(
				{
					type: "session_before_compact",
					preparation: {
						firstKeptEntryId: "keep-1",
						tokensBefore: 42,
						previousSummary: "What did we decide?",
						messagesToSummarize: [{}],
					},
					reason: "manual",
				},
				runtime.ctx,
			);
			expect(result).toMatchObject({
				compaction: {
					summary: expect.stringContaining("remembered context"),
					firstKeptEntryId: "keep-1",
					tokensBefore: 42,
				},
			});
		} finally {
			rmSync(storageDir, { recursive: true, force: true });
		}
	});

	it("captures prompt/answer and redacted tool traces like Claude Code hooks", async () => {
		const storageDir = mkdtempSync(join(tmpdir(), "piv-cognee-capture-"));
		try {
			const runtime = extensionHookFixture(storageDir);
			await runtime.handlers.get("session_start")?.({ type: "session_start", reason: "startup" }, runtime.ctx);
			await runtime.handlers.get("before_agent_start")?.(
				{ type: "before_agent_start", prompt: "Deploy uses which port?" },
				runtime.ctx,
			);
			await runtime.handlers.get("tool_result")?.(
				{
					type: "tool_result",
					toolCallId: "t1",
					toolName: "read",
					input: {
						path: "README.md",
						headers: { Authorization: "Bearer tool-secret", token: "token-secret" },
					},
					content: [{ type: "text", text: "port 8211\napi_key=output-secret" }],
					isError: true,
				},
				runtime.ctx,
			);
			await runtime.handlers.get("agent_end")?.(
				{
					type: "agent_end",
					messages: [{ role: "assistant", content: [{ type: "text", text: "Port 8211." }] }],
				},
				runtime.ctx,
			);
			// Allow fire-and-forget remember/entry + agents/register
			await new Promise((resolve) => setTimeout(resolve, 20));
			const entryCalls = runtime.requests.filter((url) => url.includes("/remember/entry"));
			expect(entryCalls.length).toBeGreaterThanOrEqual(2);
			const traceBody = runtime.requestBodies
				.filter((request) => request.url.includes("/remember/entry"))
				.map((request) => request.body)
				.map((body) => (body ? (JSON.parse(body) as { entry?: { type?: string } }) : undefined))
				.find((body) => body?.entry?.type === "trace");
			expect(traceBody).toBeDefined();
			expect(JSON.stringify(traceBody)).not.toContain("tool-secret");
			expect(JSON.stringify(traceBody)).not.toContain("token-secret");
			expect(JSON.stringify(traceBody)).not.toContain("output-secret");
			expect(JSON.stringify(traceBody)).toContain("[REDACTED]");
			expect(cogneeSessionId("session-1")).toBe("piv_session-1");
			expect(extractMessageText({ role: "assistant", content: [{ type: "text", text: "hi" }] })).toBe("hi");
			expect(truncateForCapture("x".repeat(20), 10)).toContain("…[truncated]");
		} finally {
			rmSync(storageDir, { recursive: true, force: true });
		}
	});
});

describe("piv-cognee lifecycle regressions", () => {
	it("serializes pending queue drains", async () => {
		const storageDir = mkdtempSync(join(tmpdir(), "piv-cognee-drain-"));
		let releaseRemember!: () => void;
		const rememberGate = new Promise<void>((resolve) => {
			releaseRemember = resolve;
		});
		let rememberStarted = 0;
		const calls: string[] = [];
		const fetchImpl: typeof fetch = async (input) => {
			const url = String(input);
			calls.push(url);
			if (url.endsWith("/remember")) {
				rememberStarted += 1;
				await rememberGate;
				return new Response(null, { status: 202 });
			}
			if (url.endsWith("/agents/register")) return new Response(null, { status: 200 });
			return url.endsWith("/health")
				? new Response("ok", { status: 200 })
				: new Response(JSON.stringify([{ text: "context" }]), { status: 200 });
		};
		try {
			const runtime = extensionHookFixture(storageDir, false, {}, fetchImpl);
			const record = createPendingRemember("existing summary", "pi-void", "agent_actions", 300);
			await enqueuePendingRemember(join(storageDir, "pending"), record, 4);
			await runtime.handlers.get("session_start")?.({ type: "session_start", reason: "startup" }, runtime.ctx);
			await waitFor(() => rememberStarted === 1);
			await runtime.handlers.get("session_compact")?.(
				{
					type: "session_compact",
					compactionEntry: { summary: "new summary" },
					reason: "manual",
				},
				runtime.ctx,
			);
			await new Promise((resolve) => setTimeout(resolve, 10));
			expect(rememberStarted).toBe(1);
			releaseRemember();
			await new Promise((resolve) => setTimeout(resolve, 20));
			expect(calls.filter((url) => url.endsWith("/remember"))).toHaveLength(1);
		} finally {
			rmSync(storageDir, { recursive: true, force: true });
		}
	});

	it("awaits improve before unregistering on shutdown", async () => {
		const storageDir = mkdtempSync(join(tmpdir(), "piv-cognee-shutdown-"));
		let releaseImprove!: () => void;
		const improveGate = new Promise<void>((resolve) => {
			releaseImprove = resolve;
		});
		const calls: string[] = [];
		const fetchImpl: typeof fetch = async (input) => {
			const url = String(input);
			calls.push(`start:${url}`);
			if (url.endsWith("/improve")) {
				await improveGate;
				calls.push(`done:${url}`);
				return new Response(null, { status: 200 });
			}
			if (url.endsWith("/agents/register") || url.endsWith("/agents/unregister")) {
				return new Response(null, { status: 200 });
			}
			if (url.endsWith("/health")) return new Response("ok", { status: 200 });
			return new Response(JSON.stringify([{ text: "context" }]), { status: 200 });
		};
		try {
			const runtime = extensionHookFixture(storageDir, false, {}, fetchImpl);
			await runtime.handlers.get("session_start")?.({ type: "session_start", reason: "startup" }, runtime.ctx);
			await waitFor(() => calls.some((url) => url.endsWith("/agents/register")));
			await runtime.handlers.get("before_agent_start")?.(
				{ type: "before_agent_start", prompt: "capture this" },
				runtime.ctx,
			);
			const shutdown = runtime.handlers.get("session_shutdown")?.(
				{ type: "session_shutdown", reason: "quit" },
				runtime.ctx,
			);
			await waitFor(() => calls.some((url) => url.endsWith("/improve")));
			expect(calls.some((url) => url.endsWith("/agents/unregister"))).toBe(false);
			releaseImprove();
			await shutdown;
			const improveDone = calls.findIndex((url) => url.startsWith("done:"));
			const unregisterStart = calls.findIndex((url) => url.endsWith("/agents/unregister"));
			expect(improveDone).toBeGreaterThanOrEqual(0);
			expect(unregisterStart).toBeGreaterThan(improveDone);
		} finally {
			rmSync(storageDir, { recursive: true, force: true });
		}
	});
});

describe("piv-cognee policy regressions", () => {
	it("does not make recall requests when disabled", async () => {
		const storageDir = mkdtempSync(join(tmpdir(), "piv-cognee-disabled-"));
		try {
			const runtime = extensionHookFixture(storageDir, false, { PI_COGNEE_ENABLED: "false" });
			await runtime.handlers.get("session_start")?.({ type: "session_start", reason: "startup" }, runtime.ctx);
			expect(runtime.activeToolSets.at(-1)).toEqual(["read", "grep"]);
			expect(
				await runtime.handlers.get("before_agent_start")?.(
					{ type: "before_agent_start", prompt: "Should not recall" },
					runtime.ctx,
				),
			).toBeUndefined();
			// session_start may probe /health; disabled mode must not call recall/remember
			expect(runtime.requests.filter((url) => url.includes("/recall") || url.includes("/remember"))).toHaveLength(0);
		} finally {
			rmSync(storageDir, { recursive: true, force: true });
		}
	});

	it("does not auto-replay uncertain writes but allows explicit retry", async () => {
		const storageDir = mkdtempSync(join(tmpdir(), "piv-cognee-uncertain-"));
		try {
			const runtime = extensionHookFixture(storageDir, true);
			const record = createPendingRemember("uncertain summary", "pi-void", "agent_actions", 200);
			await enqueuePendingRemember(join(storageDir, "pending"), record, 4);
			await updatePendingRememberState(join(storageDir, "pending"), record.operationId, "uncertain");
			await runtime.handlers.get("session_start")?.({ type: "session_start", reason: "startup" }, runtime.ctx);
			await new Promise((resolve) => setTimeout(resolve, 10));
			// session_start may register the agent; it must not drain uncertain items automatically
			const rememberCalls = () => runtime.requests.filter((url) => url.includes("/remember"));
			expect(rememberCalls()).toHaveLength(0);
			expect(await readPendingRemember(join(storageDir, "pending"))).toHaveLength(1);
			await runtime.commands.get("cognee")!("flush pending", runtime.ctx);
			expect(rememberCalls()).toHaveLength(0);
			await runtime.commands.get("cognee")!("flush uncertain", runtime.ctx);
			expect(rememberCalls().length).toBeGreaterThanOrEqual(1);
			expect(await readPendingRemember(join(storageDir, "pending"))).toHaveLength(0);
		} finally {
			rmSync(storageDir, { recursive: true, force: true });
		}
	});
});

describe("piv-cognee env file parsing", () => {
	it("parses export-style cognee keys", () => {
		const parsed = parseEnvFile(`
# comment
export COGNEE_BASE_URL="http://127.0.0.1:8211"
COGNEE_API_KEY=secret
LLM_API_KEY=should-not-appear
PI_COGNEE_DATASET=pi-void
`);
		expect(parsed.COGNEE_BASE_URL).toBe("http://127.0.0.1:8211");
		expect(parsed.COGNEE_API_KEY).toBe("secret");
		expect(parsed.PI_COGNEE_DATASET).toBe("pi-void");
		expect(parsed.LLM_API_KEY).toBeUndefined();
	});
});

describe("piv-cognee commands and search tool", () => {
	it("toggles without clobbering unrelated tools and runs manual operations", async () => {
		const storageDir = mkdtempSync(join(tmpdir(), "piv-cognee-commands-"));
		try {
			const runtime = extensionHookFixture(storageDir, true);
			await runtime.handlers.get("session_start")?.({ type: "session_start", reason: "startup" }, runtime.ctx);
			expect(runtime.commands.has("cognee")).toBe(true);
			expect(runtime.tools.has("cognee_search")).toBe(true);

			await runtime.commands.get("cognee")!("off", runtime.ctx);
			expect((await loadPivCogneeConfig(join(storageDir, "config.json"), {})).enabled).toBe(false);
			expect(runtime.activeToolSets.at(-1)).toEqual(["read", "grep"]);

			await runtime.commands.get("cognee")!("on", runtime.ctx);
			expect(runtime.activeToolSets.at(-1)).toEqual(["read", "grep", "cognee_search"]);
			await runtime.commands.get("cognee")!("recall off", runtime.ctx);
			expect((await loadPivCogneeConfig(join(storageDir, "config.json"), {})).autoRecall).toBe(false);
			await runtime.commands.get("cognee")!("remember off", runtime.ctx);
			expect((await loadPivCogneeConfig(join(storageDir, "config.json"), {})).autoRemember).toBe("off");
			await runtime.commands.get("cognee")!("recall on", runtime.ctx);
			await runtime.commands.get("cognee")!("remember on", runtime.ctx);
			await runtime.commands.get("cognee")!("status", runtime.ctx);
			expect(runtime.notifications.join("\n")).toContain("dataset pi-void");
			await runtime.commands.get("cognee")!("search remembered", runtime.ctx);
			await runtime.commands.get("cognee")!("remember user_context explicit memory", runtime.ctx);
			expect(runtime.notifications.join("\n")).toContain("remembered context");

			const toolResult = await runtime.tools
				.get("cognee_search")!
				.execute("tool-1", { query: "remembered" }, undefined, undefined, runtime.ctx);
			expect(toolResult).toMatchObject({ content: [{ text: expect.stringContaining("remembered context") }] });

			await runtime.handlers.get("session_compact")?.(
				{
					type: "session_compact",
					compactionEntry: { summary: "queued summary" },
					reason: "manual",
					fromExtension: false,
					willRetry: false,
				},
				runtime.ctx,
			);
			expect(await readPendingRemember(join(storageDir, "pending"))).toHaveLength(1);
			await runtime.commands.get("cognee")!("flush pending", runtime.ctx);
			expect(await readPendingRemember(join(storageDir, "pending"))).toHaveLength(0);
		} finally {
			rmSync(storageDir, { recursive: true, force: true });
		}
	});
});

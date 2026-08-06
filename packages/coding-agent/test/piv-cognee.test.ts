import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import type { ExtensionAPI, ExtensionContext } from "../src/core/extensions/types.ts";
import {
	canAttemptCircuit,
	createCircuitState,
	createPendingRemember,
	createPivCogneeExtension,
	enqueuePendingRemember,
	loadPivCogneeConfig,
	noteCircuitFailure,
	readPendingRemember,
	redactMemoryText,
	resolveCogneeApiKey,
	resolvePivCogneeConfig,
	updatePendingRememberState,
} from "../src/piv-cognee.ts";
import { type CogneeClientConfig, CogneeError, createCogneeClient } from "../src/piv-cognee-client.ts";

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
			top_k: 3,
			only_context: true,
			scope: ["graph"],
			session_id: "session-1",
			datasets: ["pi-void"],
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
			baseUrl: "http://127.0.0.1:8211",
			dataset: "pi-void",
		});
		expect(
			resolvePivCogneeConfig(undefined, {
				PI_COGNEE_ENABLED: "false",
				PI_COGNEE_RECALL: "0",
				PI_COGNEE_REMEMBER: "off",
				PI_COGNEE_DATASET: "repo-memory",
			}),
		).toMatchObject({ enabled: false, autoRecall: false, autoRemember: "off", dataset: "repo-memory" });
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

	it("resolves the environment key before the cached key", () => {
		expect(resolveCogneeApiKey({ COGNEE_API_KEY: " env-key " }, '{"api_key":"cached-key"}')).toBe("env-key");
		expect(resolveCogneeApiKey({}, '{"api_key":"cached-key"}')).toBe("cached-key");
		expect(resolveCogneeApiKey({}, "not-json")).toBeUndefined();
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

function extensionHookFixture(storageDir: string, hasUI = false, env: NodeJS.ProcessEnv = {}) {
	const handlers = new Map<string, Hook>();
	const commands = new Map<string, (args: string, ctx: ExtensionContext) => Promise<void> | void>();
	const tools = new Map<string, { execute: (...args: unknown[]) => Promise<unknown> }>();
	const activeToolSets: string[][] = [];
	const appended: Array<{ customType: string; data: unknown }> = [];
	const notifications: string[] = [];
	const requests: string[] = [];
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
		ui: { notify: (message: string) => notifications.push(message) },
		sessionManager: { getSessionId: () => "session-1" },
	} as unknown as ExtensionContext;
	createPivCogneeExtension({
		storageDir,
		env,
		fetch: async (input) => {
			requests.push(String(input));
			if (String(input).endsWith("/recall")) {
				return new Response(JSON.stringify([{ text: "remembered context" }]), { status: 200 });
			}
			return new Response(null, { status: 202 });
		},
	})(api);
	return { handlers, commands, tools, activeToolSets, appended, notifications, requests, ctx };
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
			expect(runtime.appended).toHaveLength(0);

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
			expect(runtime.requests).toHaveLength(0);
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
			expect(runtime.requests).toHaveLength(0);
			expect(await readPendingRemember(join(storageDir, "pending"))).toHaveLength(1);
			await runtime.commands.get("cognee")!("flush pending", runtime.ctx);
			expect(runtime.requests).toHaveLength(0);
			await runtime.commands.get("cognee")!("flush uncertain", runtime.ctx);
			expect(runtime.requests).toHaveLength(1);
			expect(await readPendingRemember(join(storageDir, "pending"))).toHaveLength(0);
		} finally {
			rmSync(storageDir, { recursive: true, force: true });
		}
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

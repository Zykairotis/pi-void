import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
	canAttemptCircuit,
	createCircuitState,
	createPendingRemember,
	enqueuePendingRemember,
	noteCircuitFailure,
	readPendingRemember,
	redactMemoryText,
	resolveCogneeApiKey,
	resolvePivCogneeConfig,
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

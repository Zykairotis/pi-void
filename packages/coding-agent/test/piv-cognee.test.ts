import { describe, expect, it } from "vitest";
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

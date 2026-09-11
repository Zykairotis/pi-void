import { describe, expect, it } from "vitest";
import { streamSimple } from "../src/compat.ts";
import type { Api, Context, Model, SimpleStreamOptions } from "../src/types.ts";

const HARD_MAX_OUTPUT_TOKENS = 4_096;

class PayloadCaptured extends Error {
	constructor() {
		super("payload captured");
		this.name = "PayloadCaptured";
	}
}

function model(api: Api): Model<Api> {
	return {
		id: "test-model",
		name: "test-model",
		api,
		provider: api,
		baseUrl: "http://127.0.0.1:9",
		reasoning: true,
		input: ["text"],
		cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
		contextWindow: 128_000,
		maxTokens: 16_384,
	} as Model<Api>;
}

function context(): Context {
	return { messages: [{ role: "user", content: "bounded output", timestamp: 1 }] } as Context;
}

type PayloadReader = (payload: Record<string, unknown>) => number;

const nested = (payload: Record<string, unknown>, key: string): Record<string, unknown> =>
	payload[key] as Record<string, unknown>;

/** Reads the effective provider output allowance from each adapter's outgoing payload. */
const PAYLOAD_READERS: Readonly<Record<string, PayloadReader>> = {
	"anthropic-messages": (payload) => payload.max_tokens as number,
	"openai-completions": (payload) => (payload.max_completion_tokens ?? payload.max_tokens) as number,
	"openai-responses": (payload) => payload.max_output_tokens as number,
	"azure-openai-responses": (payload) => payload.max_output_tokens as number,
	"openai-codex-responses": (payload) => payload.max_output_tokens as number,
	"google-generative-ai": (payload) => nested(payload, "config").maxOutputTokens as number,
	"google-vertex": (payload) => nested(payload, "config").maxOutputTokens as number,
	"mistral-conversations": (payload) => payload.maxTokens as number,
	"bedrock-converse-stream": (payload) => nested(payload, "inferenceConfig").maxTokens as number,
	"ice-messages": (payload) => nested(payload, "options").maxTokens as number,
};

/** Codex keys must carry a JWT-shaped ChatGPT account claim. */
function fakeCodexApiKey(): string {
	const encode = (value: object) => Buffer.from(JSON.stringify(value)).toString("base64");
	const claims = { "https://api.openai.com/auth": { chatgpt_account_id: "test-account" } };
	return `header.${encode(claims)}.signature`;
}

async function captureMaxTokens(api: string, options: SimpleStreamOptions): Promise<number> {
	let captured: Record<string, unknown> | undefined;
	const stream = streamSimple(model(api as Api), context(), {
		...options,
		apiKey: api === "openai-codex-responses" ? fakeCodexApiKey() : "fake-key",
		env: {
			...(options.env ?? {}),
			AWS_ACCESS_KEY_ID: "test-access-key",
			AWS_SECRET_ACCESS_KEY: "test-secret-key",
			AWS_REGION: "us-east-1",
		},
		onPayload: (payload) => {
			captured = payload as Record<string, unknown>;
			throw new PayloadCaptured();
		},
	} as SimpleStreamOptions);
	await stream.result();
	if (!captured) throw new Error(`Expected payload capture for ${api}`);
	return PAYLOAD_READERS[api](captured);
}

describe("hard per-request output authority", () => {
	for (const api of Object.keys(PAYLOAD_READERS)) {
		it(`keeps the ${api} output allowance at or below the hard authority after reasoning and provider transforms`, async () => {
			const maxTokens = await captureMaxTokens(api, {
				maxTokens: 50_000,
				hardMaxOutputTokens: HARD_MAX_OUTPUT_TOKENS,
				reasoning: "high",
			});
			expect(maxTokens).toBeLessThanOrEqual(HARD_MAX_OUTPUT_TOKENS);
			expect(maxTokens).toBeGreaterThan(0);
		});
	}

	it("never widens a request that omits maxTokens when a hard authority is supplied", async () => {
		const maxTokens = await captureMaxTokens("anthropic-messages", {
			hardMaxOutputTokens: HARD_MAX_OUTPUT_TOKENS,
		});
		expect(maxTokens).toBe(HARD_MAX_OUTPUT_TOKENS);
	});

	it("refuses azure-openai-responses requests whose hard authority is below the provider output floor", async () => {
		let payloadSeen = false;
		const stream = streamSimple(model("azure-openai-responses"), context(), {
			maxTokens: 50_000,
			hardMaxOutputTokens: 8,
			reasoning: "high",
			apiKey: "fake-key",
			onPayload: () => {
				payloadSeen = true;
			},
		} as SimpleStreamOptions);
		const result = await stream.result();
		expect(result.errorMessage).toMatch(/provider minimum output floor/);
		expect(result.stopReason).toBe("error");
		expect(payloadSeen).toBe(false);
	});

	it("refuses anthropic thinking budgets when the hard authority is below the minimum ordinary output", async () => {
		let payloadSeen = false;
		const stream = streamSimple(model("anthropic-messages"), context(), {
			maxTokens: 50_000,
			hardMaxOutputTokens: 512,
			reasoning: "high",
			apiKey: "fake-key",
			onPayload: () => {
				payloadSeen = true;
			},
		} as SimpleStreamOptions);
		const result = await stream.result();
		expect(result.errorMessage).toMatch(/below the minimum ordinary output/);
		expect(result.stopReason).toBe("error");
		expect(payloadSeen).toBe(false);
	});

	it("keeps the strongest reasoning level from resurrecting the request above the authority", async () => {
		const maxTokens = await captureMaxTokens("anthropic-messages", {
			maxTokens: 50_000,
			hardMaxOutputTokens: HARD_MAX_OUTPUT_TOKENS,
			reasoning: "max",
		});
		expect(maxTokens).toBeLessThanOrEqual(HARD_MAX_OUTPUT_TOKENS);
		expect(maxTokens).toBeGreaterThan(0);
	});
});

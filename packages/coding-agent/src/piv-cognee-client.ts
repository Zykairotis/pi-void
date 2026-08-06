export type CogneeErrorKind =
	| "auth_failed"
	| "server_error"
	| "unreachable"
	| "timeout"
	| "aborted"
	| "malformed"
	| "response_too_large";

export class CogneeError extends Error {
	readonly kind: CogneeErrorKind;
	readonly status: number | undefined;

	constructor(kind: CogneeErrorKind, message: string, status?: number) {
		super(message);
		this.name = "CogneeError";
		this.kind = kind;
		this.status = status;
	}
}

export interface CogneeClientConfig {
	baseUrl: string;
	dataset: string;
	apiKey?: string;
	recallBudgetMs: number;
	maxResponseChars: number;
}

export interface RecallResult {
	text: string;
	score?: number;
	metadata?: Record<string, unknown>;
}

export interface RememberRequest {
	text: string;
	nodeSet: string;
	dataset?: string;
}

export interface CogneeClientDependencies {
	fetch?: typeof fetch;
}

export interface CogneeClient {
	recall(
		query: string,
		options?: { topK?: number; sessionId?: string; signal?: AbortSignal },
	): Promise<RecallResult[]>;
	remember(request: RememberRequest, options?: { signal?: AbortSignal }): Promise<void>;
}

interface RequestSignal {
	signal: AbortSignal;
	timedOut: () => boolean;
	cleanup: () => void;
}

function createRequestSignal(timeoutMs: number, parentSignal?: AbortSignal): RequestSignal {
	const controller = new AbortController();
	let didTimeout = false;
	const timeout = setTimeout(
		() => {
			didTimeout = true;
			controller.abort();
		},
		Math.max(1, timeoutMs),
	);
	const onAbort = () => controller.abort(parentSignal?.reason);
	parentSignal?.addEventListener("abort", onAbort, { once: true });

	return {
		signal: controller.signal,
		timedOut: () => didTimeout,
		cleanup: () => {
			clearTimeout(timeout);
			parentSignal?.removeEventListener("abort", onAbort);
		},
	};
}

function buildUrl(baseUrl: string, path: string): string {
	const url = new URL(baseUrl);
	url.pathname = `${url.pathname.replace(/\/$/, "")}${path}`;
	url.search = "";
	url.hash = "";
	return url.toString();
}

function headers(apiKey: string | undefined, contentType?: string): Headers {
	const result = new Headers({ accept: "application/json" });
	if (contentType) result.set("content-type", contentType);
	if (apiKey) result.set("x-api-key", apiKey);
	return result;
}

function classifyStatus(status: number): CogneeErrorKind {
	if (status === 401 || status === 403) return "auth_failed";
	if (status >= 500 || status === 408 || status === 429) return "server_error";
	return "malformed";
}

function responseLimit(response: Response, maxChars: number): void {
	const contentLength = Number(response.headers.get("content-length"));
	if (Number.isFinite(contentLength) && contentLength > maxChars) {
		throw new CogneeError("response_too_large", "Cognee response exceeded the configured limit");
	}
}

async function readJson(response: Response, maxChars: number): Promise<unknown> {
	responseLimit(response, maxChars);
	const text = await response.text();
	if (text.length > maxChars) {
		throw new CogneeError("response_too_large", "Cognee response exceeded the configured limit");
	}
	try {
		return JSON.parse(text) as unknown;
	} catch {
		throw new CogneeError("malformed", "Cognee returned malformed JSON");
	}
}

function normalizeRecall(payload: unknown): RecallResult[] {
	const values = Array.isArray(payload)
		? payload
		: payload !== null && typeof payload === "object"
			? ((payload as { results?: unknown; data?: unknown }).results ?? (payload as { data?: unknown }).data)
			: undefined;
	if (!Array.isArray(values)) throw new CogneeError("malformed", "Cognee recall returned an unexpected shape");

	return values.flatMap((value): RecallResult[] => {
		if (typeof value === "string") return [{ text: value }];
		if (value === null || typeof value !== "object") return [];
		const item = value as { text?: unknown; score?: unknown; metadata?: unknown; content?: unknown };
		const text =
			typeof item.text === "string" ? item.text : typeof item.content === "string" ? item.content : undefined;
		if (!text) return [];
		return [
			{
				text,
				...(typeof item.score === "number" ? { score: item.score } : {}),
				...(item.metadata !== null && typeof item.metadata === "object"
					? { metadata: item.metadata as Record<string, unknown> }
					: {}),
			},
		];
	});
}

async function request(
	fetchImpl: typeof fetch,
	url: string,
	init: RequestInit,
	config: CogneeClientConfig,
	parentSignal: AbortSignal | undefined,
): Promise<Response> {
	const requestSignal = createRequestSignal(config.recallBudgetMs, parentSignal);
	try {
		return await fetchImpl(url, { ...init, signal: requestSignal.signal });
	} catch {
		if (requestSignal.timedOut()) throw new CogneeError("timeout", "Cognee request timed out");
		if (parentSignal?.aborted) throw new CogneeError("aborted", "Cognee request was aborted");
		throw new CogneeError("unreachable", "Cognee service is unreachable");
	} finally {
		requestSignal.cleanup();
	}
}

export function createCogneeClient(
	config: CogneeClientConfig,
	dependencies: CogneeClientDependencies = {},
): CogneeClient {
	const fetchImpl = dependencies.fetch ?? fetch;

	return {
		async recall(query, options = {}) {
			const response = await request(
				fetchImpl,
				buildUrl(config.baseUrl, "/api/v1/recall"),
				{
					method: "POST",
					headers: headers(config.apiKey, "application/json"),
					body: JSON.stringify({
						query,
						top_k: options.topK ?? 5,
						only_context: true,
						scope: ["graph"],
						...(options.sessionId ? { session_id: options.sessionId } : {}),
						datasets: [config.dataset],
					}),
				},
				config,
				options.signal,
			);
			if (!response.ok) {
				const kind = classifyStatus(response.status);
				throw new CogneeError(kind, `Cognee recall failed with HTTP ${response.status}`, response.status);
			}
			return normalizeRecall(await readJson(response, config.maxResponseChars));
		},

		async remember(input, options = {}) {
			const form = new FormData();
			form.set("datasetName", input.dataset ?? config.dataset);
			form.set("node_set", input.nodeSet);
			form.set("run_in_background", "true");
			form.set("data", new Blob([input.text], { type: "text/plain" }), "piv-cognee.txt");
			const response = await request(
				fetchImpl,
				buildUrl(config.baseUrl, "/api/v1/remember"),
				{ method: "POST", headers: headers(config.apiKey), body: form },
				config,
				options.signal,
			);
			if (!response.ok) {
				const kind = classifyStatus(response.status);
				throw new CogneeError(kind, `Cognee remember failed with HTTP ${response.status}`, response.status);
			}
		},
	};
}

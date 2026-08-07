export type CogneeErrorKind =
	| "auth_failed"
	| "server_error"
	| "unreachable"
	| "timeout"
	| "aborted"
	| "not_found"
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
	sessionId?: string;
}

export interface RememberEntryRequest {
	entry: Record<string, unknown>;
	dataset?: string;
	sessionId: string;
}

export interface ImproveRequest {
	dataset?: string;
	sessionIds?: string[];
}

export interface CogneeClientDependencies {
	fetch?: typeof fetch;
}

export interface CogneeClient {
	recall(
		query: string,
		options?: {
			topK?: number;
			sessionId?: string;
			scope?: string[];
			signal?: AbortSignal;
			timeoutMs?: number;
		},
	): Promise<RecallResult[]>;
	remember(request: RememberRequest, options?: { signal?: AbortSignal; timeoutMs?: number }): Promise<void>;
	/** Claude/OpenClaw-style session cache write: QA or Trace entry. */
	rememberEntry(
		request: RememberEntryRequest,
		options?: { signal?: AbortSignal; timeoutMs?: number },
	): Promise<{ entryId?: string }>;
	/** Bridge session cache into the permanent graph (Claude SessionEnd /improve). */
	improve(request?: ImproveRequest, options?: { signal?: AbortSignal; timeoutMs?: number }): Promise<void>;
	registerAgent(
		request: { agentSessionName: string; sessionId?: string; datasetNames?: string[] },
		options?: { signal?: AbortSignal; timeoutMs?: number },
	): Promise<void>;
	unregisterAgent(
		request: { agentSessionName: string },
		options?: { signal?: AbortSignal; timeoutMs?: number },
	): Promise<void>;
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
	if (status === 404) return "not_found";
	if (status >= 500 || status === 408 || status === 429) return "server_error";
	return "malformed";
}

const MAX_RECALL_RESPONSE_CHARS = 128 * 1024;

function responseLimit(response: Response, maxChars: number): void {
	const contentLength = Number(response.headers.get("content-length"));
	if (Number.isFinite(contentLength) && contentLength > maxChars) {
		throw new CogneeError("response_too_large", "Cognee response exceeded the configured limit");
	}
}

async function readJson(response: Response, transportMaxChars: number): Promise<unknown> {
	responseLimit(response, transportMaxChars);
	const text = await response.text();
	if (text.length > transportMaxChars) {
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
	timeoutMs?: number,
): Promise<Response> {
	const requestSignal = createRequestSignal(timeoutMs ?? config.recallBudgetMs, parentSignal);
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

async function assertOk(response: Response, action: string): Promise<void> {
	if (response.ok) return;
	const kind = classifyStatus(response.status);
	throw new CogneeError(kind, `Cognee ${action} failed with HTTP ${response.status}`, response.status);
}

export function createCogneeClient(
	config: CogneeClientConfig,
	dependencies: CogneeClientDependencies = {},
): CogneeClient {
	const fetchImpl = dependencies.fetch ?? fetch;

	return {
		async recall(query, options = {}) {
			const scope = options.scope && options.scope.length > 0 ? options.scope : ["session", "trace", "graph"];
			const response = await request(
				fetchImpl,
				buildUrl(config.baseUrl, "/api/v1/recall"),
				{
					method: "POST",
					headers: headers(config.apiKey, "application/json"),
					body: JSON.stringify({
						query,
						topK: options.topK ?? 5,
						onlyContext: true,
						scope,
						...(options.sessionId ? { sessionId: options.sessionId } : {}),
						datasets: [config.dataset],
					}),
				},
				config,
				options.signal,
				options.timeoutMs,
			);
			await assertOk(response, "recall");
			const results = normalizeRecall(await readJson(response, MAX_RECALL_RESPONSE_CHARS)).slice(
				0,
				options.topK ?? 5,
			);
			let remaining = config.maxResponseChars;
			return results.flatMap((result) => {
				if (remaining <= 0) return [];
				const text = result.text.slice(0, remaining);
				remaining -= text.length;
				return text ? [{ ...result, text }] : [];
			});
		},

		async remember(input, options = {}) {
			const form = new FormData();
			form.set("datasetName", input.dataset ?? config.dataset);
			form.set("node_set", input.nodeSet);
			form.set("run_in_background", "true");
			if (input.sessionId) form.set("session_id", input.sessionId);
			form.set("data", new Blob([input.text], { type: "text/plain" }), "piv-cognee.txt");
			const response = await request(
				fetchImpl,
				buildUrl(config.baseUrl, "/api/v1/remember"),
				{ method: "POST", headers: headers(config.apiKey), body: form },
				config,
				options.signal,
				options.timeoutMs ?? Math.max(config.recallBudgetMs, 30_000),
			);
			await assertOk(response, "remember");
		},

		async rememberEntry(input, options = {}) {
			const response = await request(
				fetchImpl,
				buildUrl(config.baseUrl, "/api/v1/remember/entry"),
				{
					method: "POST",
					headers: headers(config.apiKey, "application/json"),
					body: JSON.stringify({
						entry: input.entry,
						dataset_name: input.dataset ?? config.dataset,
						session_id: input.sessionId,
					}),
				},
				config,
				options.signal,
				options.timeoutMs ?? 30_000,
			);
			await assertOk(response, "remember/entry");
			try {
				const payload = (await readJson(response, config.maxResponseChars)) as { entry_id?: unknown };
				return typeof payload.entry_id === "string" ? { entryId: payload.entry_id } : {};
			} catch {
				return {};
			}
		},

		async improve(input = {}, options = {}) {
			const response = await request(
				fetchImpl,
				buildUrl(config.baseUrl, "/api/v1/improve"),
				{
					method: "POST",
					headers: headers(config.apiKey, "application/json"),
					body: JSON.stringify({
						// ImprovePayloadDTO (Cognee 1.4): camelCase
						datasetName: input.dataset ?? config.dataset,
						...(input.sessionIds && input.sessionIds.length > 0 ? { sessionIds: input.sessionIds } : {}),
						runInBackground: true,
					}),
				},
				config,
				options.signal,
				options.timeoutMs ?? 120_000,
			);
			await assertOk(response, "improve");
		},

		async registerAgent(input, options = {}) {
			const body: Record<string, unknown> = {
				agent_session_name: input.agentSessionName,
				type: "api",
				memory_mode: "hybrid",
				source: "api",
			};
			if (input.sessionId) body.session_id = input.sessionId;
			if (input.datasetNames && input.datasetNames.length > 0) body.dataset_names = input.datasetNames;
			const response = await request(
				fetchImpl,
				buildUrl(config.baseUrl, "/api/v1/agents/register"),
				{
					method: "POST",
					headers: headers(config.apiKey, "application/json"),
					body: JSON.stringify(body),
				},
				config,
				options.signal,
				options.timeoutMs ?? 15_000,
			);
			if (response.status === 404) return;
			await assertOk(response, "agents/register");
		},

		async unregisterAgent(input, options = {}) {
			const response = await request(
				fetchImpl,
				buildUrl(config.baseUrl, "/api/v1/agents/unregister"),
				{
					method: "POST",
					headers: headers(config.apiKey, "application/json"),
					body: JSON.stringify({ agent_session_name: input.agentSessionName }),
				},
				config,
				options.signal,
				options.timeoutMs ?? 15_000,
			);
			if (response.status === 404) return;
			await assertOk(response, "agents/unregister");
		},
	};
}

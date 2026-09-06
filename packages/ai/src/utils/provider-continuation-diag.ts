import type { ProviderEnv } from "../types.ts";
import { shortHash } from "./hash.ts";
import { getProviderEnvValue } from "./provider-env.ts";

export type ContinuationRequestContextMode = "full" | "continuation-delta" | "full-with-id";

export interface ContinuationRequestDiag {
	timestamp: string;
	requestSequence: number;
	piSessionIdHash: string | null;
	provider: string;
	model: string;
	api: string;
	baseUrl: string;
	corePreviousResponseIdPresent: boolean;
	previousResponseIdPresent: boolean;
	previousResponseIdHash: string | null;
	lastSuccessfulResponseIdHash: string | null;
	idsEqual: boolean | null;
	extensionInjectedPreviousResponseId: boolean;
	requestContextMode: ContinuationRequestContextMode;
	inputItemCount: number | null;
	messageCount: number;
	toolCount: number;
	store: boolean | null;
	sessionAffinityHash: string | null;
	clientRequestHash: string | null;
	promptCacheKeyHash: string | null;
}

export interface ContinuationResponseDiag {
	timestamp: string;
	requestSequence: number;
	status: number;
	responseIdPresent: boolean;
	responseIdHash: string | null;
	stopReason?: string;
	codexlbWorkerId?: string | null;
	codexlbAccountId?: string | null;
	codexlbUpstreamId?: string | null;
	codexlbPrevRespSource?: string | null;
	codexlbAffinityKind?: string | null;
}

export interface ContinuationErrorDiag {
	timestamp: string;
	requestSequence: number;
	status: number | null;
	previousResponseIdHash: string | null;
	providerCode: string | null;
	providerMessage: string | null;
	providerParam: string | null;
}

type NodeCrypto = {
	createHash(algorithm: string): { update(data: string): { digest(encoding: "hex"): string } };
};

type NodeFs = {
	mkdirSync(path: string, options: { recursive: boolean }): void;
	appendFileSync(path: string, data: string, encoding: "utf8"): void;
};

type NodeOs = {
	homedir(): string;
};

type NodePath = {
	join(...parts: string[]): string;
	dirname(path: string): string;
};

type ProcessWithBuiltin = typeof process & {
	getBuiltinModule?: (id: "node:crypto" | "node:fs" | "node:os" | "node:path") => unknown;
};

const lastSuccessfulResponseIdBySession = new Map<string, string>();
let requestSequence = 0;

function loadBuiltin<T>(id: "node:crypto" | "node:fs" | "node:os" | "node:path"): T | null {
	if (typeof process === "undefined" || !(process.versions?.node || process.versions?.bun)) {
		return null;
	}
	return ((process as ProcessWithBuiltin).getBuiltinModule?.(id) as T | undefined) ?? null;
}

function envFlag(name: string, env?: ProviderEnv): string | undefined {
	const value = getProviderEnvValue(name, env);
	return value?.trim();
}

function isVitest(): boolean {
	return typeof process !== "undefined" && Boolean(process.env.VITEST || process.env.VITEST_WORKER_ID);
}

export function isContinuationDiagEnabled(provider: string, env?: ProviderEnv): boolean {
	const flag = envFlag("PI_PROVIDER_CONTINUATION_DIAG", env)?.toLowerCase();
	if (flag === "0" || flag === "false" || flag === "off") return false;
	if (flag === "1" || flag === "true" || flag === "on") return true;
	if (isVitest()) return false;
	return provider === "codexlb";
}

export function hashOpaqueId(value: string | undefined | null): string | null {
	if (!value) return null;
	const crypto = loadBuiltin<NodeCrypto>("node:crypto");
	if (crypto) {
		return `sha256:${crypto.createHash("sha256").update(value).digest("hex").slice(0, 16)}`;
	}
	return `h:${shortHash(value)}`;
}

export function nextContinuationRequestSequence(): number {
	requestSequence += 1;
	return requestSequence;
}

export function rememberSuccessfulResponseId(sessionKey: string | null, responseId: string | undefined): void {
	if (!sessionKey || !responseId) return;
	lastSuccessfulResponseIdBySession.set(sessionKey, responseId);
}

export function forgetSuccessfulResponseId(sessionKey: string | null): void {
	if (!sessionKey) return;
	lastSuccessfulResponseIdBySession.delete(sessionKey);
}

export function isStalePreviousResponseError(error: unknown): boolean {
	const fields = extractProviderErrorFields(error);
	if (fields.code === "previous_response_not_found") {
		return true;
	}
	const code = (fields.code ?? "").toLowerCase();
	const param = (fields.param ?? "").toLowerCase();
	const message = (fields.message ?? "").toLowerCase().replaceAll("`", "");
	if (code === "invalid_request_error" || message.includes("invalid_request_error")) {
		return param === "previous_response_id" || message.includes("previous_response_id");
	}
	return message.includes("previous_response_id") && (message.includes("invalid") || message.includes("not found"));
}

export function lastSuccessfulResponseIdHash(sessionKey: string | null): string | null {
	if (!sessionKey) return null;
	return hashOpaqueId(lastSuccessfulResponseIdBySession.get(sessionKey));
}

export function classifyRequestContextMode(options: {
	previousResponseIdPresent: boolean;
	inputItemCount: number | null;
	messageCount: number;
}): ContinuationRequestContextMode {
	if (!options.previousResponseIdPresent) return "full";
	if (options.inputItemCount === null) return "continuation-delta";
	return options.inputItemCount >= options.messageCount ? "full-with-id" : "continuation-delta";
}

function diagLogPath(env?: ProviderEnv): string | null {
	const override = envFlag("PI_PROVIDER_CONTINUATION_DIAG_FILE", env);
	if (override) return override;
	const path = loadBuiltin<NodePath>("node:path");
	const os = loadBuiltin<NodeOs>("node:os");
	if (!path || !os) return null;
	return path.join(os.homedir(), ".pi", "agent", "logs", "provider-continuation-diag.jsonl");
}

function writeDiagLine(record: object, env?: ProviderEnv): void {
	const line = `${JSON.stringify(record)}\n`;
	const fs = loadBuiltin<NodeFs>("node:fs");
	const path = loadBuiltin<NodePath>("node:path");
	const filePath = diagLogPath(env);
	if (fs && path && filePath) {
		try {
			fs.mkdirSync(path.dirname(filePath), { recursive: true });
			fs.appendFileSync(filePath, line, "utf8");
		} catch {
			// Diagnostic logging must never break a provider call.
		}
	}
	if (typeof process !== "undefined" && envFlag("PI_PROVIDER_CONTINUATION_DIAG_STDERR", env) === "1") {
		try {
			process.stderr.write(`[pi-continuation-diag] ${line}`);
		} catch {
			// ignore
		}
	}
}

export function logContinuationRequest(record: ContinuationRequestDiag, env?: ProviderEnv): void {
	writeDiagLine({ phase: "request", ...record }, env);
}

export function logContinuationResponse(record: ContinuationResponseDiag, env?: ProviderEnv): void {
	writeDiagLine({ phase: "response", ...record }, env);
}

export function logContinuationError(record: ContinuationErrorDiag, env?: ProviderEnv): void {
	writeDiagLine({ phase: "error", ...record }, env);
}

export function extractProviderErrorFields(error: unknown): {
	status: number | null;
	code: string | null;
	message: string | null;
	param: string | null;
} {
	const sdkError = error as {
		status?: unknown;
		statusCode?: unknown;
		message?: unknown;
		error?: unknown;
	};
	const status =
		typeof sdkError.status === "number"
			? sdkError.status
			: typeof sdkError.statusCode === "number"
				? sdkError.statusCode
				: null;
	const body = sdkError.error;
	if (body && typeof body === "object") {
		const record = body as Record<string, unknown>;
		return {
			status,
			code: typeof record.code === "string" ? record.code : null,
			message: typeof record.message === "string" ? record.message : null,
			param: typeof record.param === "string" ? record.param : null,
		};
	}
	return {
		status,
		code: null,
		message: typeof sdkError.message === "string" ? sdkError.message : null,
		param: null,
	};
}

export function inputItemCount(input: unknown): number | null {
	if (Array.isArray(input)) return input.length;
	if (typeof input === "string") return 1;
	return null;
}

export function resetContinuationDiagForTests(): void {
	requestSequence = 0;
	lastSuccessfulResponseIdBySession.clear();
}

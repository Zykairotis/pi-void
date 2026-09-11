import type { AgentMessage } from "@zykairotis/ice-agent-core";
import type { AssistantMessage, Context, Usage } from "@zykairotis/ice-ai/compat";
import { estimateContextTokens, estimateTokens } from "./core/compaction/compaction.ts";

/** Source of the usage authority for a logical child run. */
export type TokenAccounting = "provider" | "estimated" | "mixed";

export type TokenBudgetPhase = "work" | "finalizing" | "exhausted" | "settled";

export interface TokenUsageEstimate {
	inputTokens?: number;
	outputTokens?: number;
	cacheReadTokens?: number;
	cacheWriteTokens?: number;
	cost?: number;
}

export interface NormalizedTokenUsage {
	inputTokens: number;
	outputTokens: number;
	cacheReadTokens: number;
	cacheWriteTokens: number;
	/** Charged work tokens: input + output + cache write. Cache reads are visible but excluded. */
	chargedTokens: number;
	cost: number;
	accounting: Exclude<TokenAccounting, "mixed">;
}

export interface TokenBudgetSnapshot {
	maxTotalTokens: number;
	workPhaseLimit: number;
	reportReserveTokens: number;
	chargedTokens: number;
	remainingTokens: number;
	inputTokens: number;
	outputTokens: number;
	cacheReadTokens: number;
	cacheWriteTokens: number;
	overshootTokens: number;
	accounting: TokenAccounting;
	phase: TokenBudgetPhase;
	hardCap: "enforced" | "aggregate-soft";
	cost: number;
}

export const TOKEN_BUDGET_LIMITS = Object.freeze({
	minChild: 1_024,
	maxChild: 1_000_000,
	minBatch: 1_024,
	maxBatch: 8_000_000,
} as const);

function finiteNonnegative(value: unknown): value is number {
	return typeof value === "number" && Number.isFinite(value) && value >= 0;
}

function normalizeComponent(value: unknown): number | undefined {
	return finiteNonnegative(value) ? value : undefined;
}

function estimateOrZero(value: number | undefined): number {
	return value !== undefined && finiteNonnegative(value) ? value : 0;
}

function usageEstimate(value: TokenUsageEstimate | undefined): NormalizedTokenUsage {
	const inputTokens = estimateOrZero(value?.inputTokens);
	const outputTokens = estimateOrZero(value?.outputTokens);
	const cacheReadTokens = estimateOrZero(value?.cacheReadTokens);
	const cacheWriteTokens = estimateOrZero(value?.cacheWriteTokens);
	return {
		inputTokens,
		outputTokens,
		cacheReadTokens,
		cacheWriteTokens,
		chargedTokens: inputTokens + outputTokens + cacheWriteTokens,
		cost: estimateOrZero(value?.cost),
		accounting: "estimated",
	};
}

/**
 * Normalize provider usage without using totalTokens as a second charge. A
 * provider usage object is accepted only when every exposed component is a
 * finite non-negative number; otherwise the explicit request estimate is used.
 */
export function normalizeTokenUsage(rawUsage: unknown, estimate: TokenUsageEstimate = {}): NormalizedTokenUsage {
	if (rawUsage && typeof rawUsage === "object") {
		const raw = rawUsage as Record<string, unknown>;
		const input = normalizeComponent(raw.input ?? raw.inputTokens);
		const output = normalizeComponent(raw.output ?? raw.outputTokens);
		const cacheRead = normalizeComponent(raw.cacheRead ?? raw.cacheReadTokens);
		const cacheWrite = normalizeComponent(raw.cacheWrite ?? raw.cacheWriteTokens);
		const rawCost = raw.cost;
		const cost =
			typeof rawCost === "object" && rawCost !== null
				? normalizeComponent((rawCost as Record<string, unknown>).total)
				: normalizeComponent(rawCost);
		const hasCost = Object.hasOwn(raw, "cost");
		if (
			input !== undefined &&
			output !== undefined &&
			cacheRead !== undefined &&
			cacheWrite !== undefined &&
			hasCost &&
			cost !== undefined
		) {
			return {
				inputTokens: input,
				outputTokens: output,
				cacheReadTokens: cacheRead,
				cacheWriteTokens: cacheWrite,
				chargedTokens: input + output + cacheWrite,
				cost: cost ?? 0,
				accounting: "provider",
			};
		}
	}
	return usageEstimate(estimate);
}

export function calculateSubagentReportReserve(maxTotalTokens: number): number {
	if (!Number.isFinite(maxTotalTokens) || maxTotalTokens <= 0) return 0;
	return Math.min(4_096, Math.max(1_024, Math.floor(maxTotalTokens * 0.1)));
}

function accountingFor(current: TokenAccounting, next: NormalizedTokenUsage["accounting"]): TokenAccounting {
	if (current === next || current === "mixed") return current;
	return "mixed";
}

/** Internal totals may report mixed provenance even though a single observation cannot. */
type LedgerTotals = Omit<NormalizedTokenUsage, "accounting"> & { accounting: TokenAccounting };

function addUsage(target: LedgerTotals, usage: NormalizedTokenUsage): void {
	target.inputTokens += usage.inputTokens;
	target.outputTokens += usage.outputTokens;
	target.cacheReadTokens += usage.cacheReadTokens;
	target.cacheWriteTokens += usage.cacheWriteTokens;
	target.chargedTokens += usage.chargedTokens;
	target.cost += usage.cost;
}

function usageDifference(current: TokenUsageEstimate, previous: TokenUsageEstimate): TokenUsageEstimate {
	return {
		inputTokens: Math.max(0, estimateOrZero(current.inputTokens) - estimateOrZero(previous.inputTokens)),
		outputTokens: Math.max(0, estimateOrZero(current.outputTokens) - estimateOrZero(previous.outputTokens)),
		cacheReadTokens: Math.max(0, estimateOrZero(current.cacheReadTokens) - estimateOrZero(previous.cacheReadTokens)),
		cacheWriteTokens: Math.max(
			0,
			estimateOrZero(current.cacheWriteTokens) - estimateOrZero(previous.cacheWriteTokens),
		),
		cost: Math.max(0, estimateOrZero(current.cost) - estimateOrZero(previous.cost)),
	};
}

function providerUsage(value: TokenUsageEstimate): NormalizedTokenUsage {
	const inputTokens = estimateOrZero(value.inputTokens);
	const outputTokens = estimateOrZero(value.outputTokens);
	const cacheReadTokens = estimateOrZero(value.cacheReadTokens);
	const cacheWriteTokens = estimateOrZero(value.cacheWriteTokens);
	return {
		inputTokens,
		outputTokens,
		cacheReadTokens,
		cacheWriteTokens,
		chargedTokens: inputTokens + outputTokens + cacheWriteTokens,
		cost: estimateOrZero(value.cost),
		accounting: "provider",
	};
}

function subtractUsage(value: TokenUsageEstimate, amount: TokenUsageEstimate): TokenUsageEstimate {
	return {
		inputTokens: Math.max(0, estimateOrZero(value.inputTokens) - estimateOrZero(amount.inputTokens)),
		outputTokens: Math.max(0, estimateOrZero(value.outputTokens) - estimateOrZero(amount.outputTokens)),
		cacheReadTokens: Math.max(0, estimateOrZero(value.cacheReadTokens) - estimateOrZero(amount.cacheReadTokens)),
		cacheWriteTokens: Math.max(0, estimateOrZero(value.cacheWriteTokens) - estimateOrZero(amount.cacheWriteTokens)),
		cost: Math.max(0, estimateOrZero(value.cost) - estimateOrZero(amount.cost)),
	};
}

function mergeEstimate(left: TokenUsageEstimate, right: TokenUsageEstimate): TokenUsageEstimate {
	return {
		inputTokens: estimateOrZero(left.inputTokens) + estimateOrZero(right.inputTokens),
		outputTokens: estimateOrZero(left.outputTokens) + estimateOrZero(right.outputTokens),
		cacheReadTokens: estimateOrZero(left.cacheReadTokens) + estimateOrZero(right.cacheReadTokens),
		cacheWriteTokens: estimateOrZero(left.cacheWriteTokens) + estimateOrZero(right.cacheWriteTokens),
		cost: estimateOrZero(left.cost) + estimateOrZero(right.cost),
	};
}

function toNormalizedUsage(usage: NormalizedTokenUsage | TokenUsageEstimate): NormalizedTokenUsage {
	if ("chargedTokens" in usage && "accounting" in usage) {
		const components = [
			usage.inputTokens,
			usage.outputTokens,
			usage.cacheReadTokens,
			usage.cacheWriteTokens,
			usage.cost,
		];
		if (
			components.every(finiteNonnegative) &&
			(usage.accounting === "provider" || usage.accounting === "estimated")
		) {
			return {
				...usage,
				chargedTokens: usage.inputTokens + usage.outputTokens + usage.cacheWriteTokens,
			};
		}
		return usageEstimate({});
	}
	return normalizeTokenUsage(undefined, usage);
}

/** Parent-owned monotonic ledger for one logical child run. */
export class TokenBudgetLedger {
	private readonly maxTotal: number;
	private readonly reportReserve: number;
	private readonly workLimit: number;
	private hardCapMode: "enforced" | "aggregate-soft";
	private hardCapModeObserved: boolean;
	private totals: LedgerTotals = {
		inputTokens: 0,
		outputTokens: 0,
		cacheReadTokens: 0,
		cacheWriteTokens: 0,
		chargedTokens: 0,
		cost: 0,
		accounting: "estimated",
	};
	private hasUsage = false;
	private phaseValue: TokenBudgetPhase = "work";

	constructor(maxTotalTokens: number, hardCap?: "enforced" | "aggregate-soft") {
		if (
			!Number.isSafeInteger(maxTotalTokens) ||
			maxTotalTokens < TOKEN_BUDGET_LIMITS.minChild ||
			maxTotalTokens > TOKEN_BUDGET_LIMITS.maxChild
		) {
			throw new Error(
				`Token budget must be an integer from ${TOKEN_BUDGET_LIMITS.minChild} to ${TOKEN_BUDGET_LIMITS.maxChild}.`,
			);
		}
		this.maxTotal = maxTotalTokens;
		this.reportReserve = calculateSubagentReportReserve(maxTotalTokens);
		this.workLimit = Math.max(0, maxTotalTokens - this.reportReserve);
		this.hardCapMode = hardCap ?? "aggregate-soft";
		this.hardCapModeObserved = hardCap === "aggregate-soft";
	}

	get phase(): TokenBudgetPhase {
		return this.phaseValue;
	}

	get maxTotalTokens(): number {
		return this.maxTotal;
	}

	get workPhaseLimit(): number {
		return this.workLimit;
	}

	get reportReserveTokens(): number {
		return this.reportReserve;
	}

	/** Set the first concrete route mode, then preserve aggregate-soft if any attempt cannot enforce it. */
	setHardCapMode(mode: "enforced" | "aggregate-soft"): void {
		if (mode === "aggregate-soft") {
			this.hardCapMode = "aggregate-soft";
			this.hardCapModeObserved = true;
		} else if (!this.hardCapModeObserved) {
			this.hardCapMode = "enforced";
		}
	}

	/** Whether an estimated ordinary request can begin without consuming the report reserve. */
	canStartWork(estimatedInputTokens = 0): boolean {
		return (
			this.phaseValue === "work" &&
			finiteNonnegative(estimatedInputTokens) &&
			this.totals.chargedTokens + estimatedInputTokens < this.workLimit
		);
	}

	/** Mark ordinary work exhausted at a request preflight boundary. */
	markExhausted(): boolean {
		if (this.phaseValue !== "work") return false;
		this.phaseValue = "exhausted";
		return true;
	}

	/** Transition from work exhaustion to the bounded report-only phase exactly once. */
	enterFinalizing(): boolean {
		if (this.phaseValue !== "exhausted") return false;
		this.phaseValue = "finalizing";
		return true;
	}

	canStartFinalization(estimatedInputTokens = 0, minimumOutputTokens = 0): boolean {
		return (
			this.phaseValue === "finalizing" &&
			finiteNonnegative(estimatedInputTokens) &&
			finiteNonnegative(minimumOutputTokens) &&
			this.totals.chargedTokens + estimatedInputTokens + minimumOutputTokens <= this.maxTotal
		);
	}

	charge(usage: NormalizedTokenUsage | TokenUsageEstimate): TokenBudgetSnapshot {
		if (this.phaseValue === "settled") return this.snapshot();
		const normalized = toNormalizedUsage(usage);
		if (!this.hasUsage) {
			this.totals = { ...normalized };
			this.hasUsage = true;
		} else {
			this.totals.accounting = accountingFor(this.totals.accounting, normalized.accounting);
			addUsage(this.totals, normalized);
		}
		// Reaching the full work allowance exhausts ordinary work: the reserve is
		// never available to ordinary work, and a response that reaches the limit
		// must not execute its tool calls.
		if (this.phaseValue === "work" && this.totals.chargedTokens >= this.workLimit) {
			this.phaseValue = "exhausted";
		}
		return this.snapshot();
	}

	chargeFinalization(usage: NormalizedTokenUsage | TokenUsageEstimate): TokenBudgetSnapshot {
		if (this.phaseValue !== "finalizing") return this.charge(usage);
		return this.charge(usage);
	}

	settle(): TokenBudgetSnapshot {
		this.phaseValue = "settled";
		return this.snapshot();
	}

	snapshot(): TokenBudgetSnapshot {
		return Object.freeze({
			maxTotalTokens: this.maxTotal,
			workPhaseLimit: this.workLimit,
			reportReserveTokens: this.reportReserve,
			chargedTokens: this.totals.chargedTokens,
			remainingTokens: Math.max(0, this.maxTotal - this.totals.chargedTokens),
			inputTokens: this.totals.inputTokens,
			outputTokens: this.totals.outputTokens,
			cacheReadTokens: this.totals.cacheReadTokens,
			cacheWriteTokens: this.totals.cacheWriteTokens,
			overshootTokens: Math.max(0, this.totals.chargedTokens - this.maxTotal),
			accounting: this.hasUsage ? this.totals.accounting : "estimated",
			phase: this.phaseValue,
			hardCap: this.hardCapMode,
			cost: this.totals.cost,
		});
	}
}

export interface SessionTokenStats {
	tokens: {
		input: number;
		output: number;
		cacheRead: number;
		cacheWrite: number;
	};
	cost?: number;
}

function sessionUsage(stats: SessionTokenStats | undefined): TokenUsageEstimate {
	return {
		inputTokens: stats?.tokens.input,
		outputTokens: stats?.tokens.output,
		cacheReadTokens: stats?.tokens.cacheRead,
		cacheWriteTokens: stats?.tokens.cacheWrite,
		cost: stats?.cost,
	};
}

/**
 * Bridges immediate assistant message usage with cumulative session statistics.
 * Immediate observations are provisional until a cumulative reconciliation sees
 * them; duplicate message events and replayed stats never charge twice.
 */
export class SessionUsageReconciler {
	private readonly ledger: TokenBudgetLedger;
	private readonly getStats: (() => SessionTokenStats | undefined) | undefined;
	private readonly baseline: TokenUsageEstimate;
	private lastCumulative: TokenUsageEstimate;
	private provisional: TokenUsageEstimate = {};
	private readonly seenMessages = new Set<string>();
	private readonly messageKeys = new WeakMap<object, string>();

	constructor(
		ledger: TokenBudgetLedger,
		baselineOrGetter?: SessionTokenStats | (() => SessionTokenStats | undefined),
	) {
		this.ledger = ledger;
		this.getStats = typeof baselineOrGetter === "function" ? baselineOrGetter : undefined;
		const baseline = typeof baselineOrGetter === "function" ? baselineOrGetter() : baselineOrGetter;
		this.baseline = sessionUsage(baseline);
		// lastCumulative tracks the cumulative delta (relative to the baseline) that
		// reconcile has already consumed; it starts zero-relative so the first
		// reconcile charges the full baseline-relative delta exactly once.
		this.lastCumulative = {};
	}

	private messageIdentity(message: AssistantMessage, identity?: string): string {
		if (identity) return identity;
		if (message.responseId) return `response:${message.responseId}`;
		const objectKey = this.messageKeys.get(message);
		if (objectKey) return objectKey;
		let contentKey = "";
		try {
			contentKey = JSON.stringify(message.content).slice(0, 512);
		} catch {
			contentKey = "[unserializable]";
		}
		const key = `message:${message.timestamp}:${message.model}:${contentKey}`;
		this.messageKeys.set(message, key);
		return key;
	}

	observeAssistantMessage(
		message: AssistantMessage,
		estimate: TokenUsageEstimate = estimateAssistantUsage(message),
		identity?: string,
	): TokenBudgetSnapshot {
		const key = this.messageIdentity(message, identity);
		if (this.seenMessages.has(key)) return this.ledger.snapshot();
		this.seenMessages.add(key);
		const normalized = normalizeTokenUsage(message.usage, estimate);
		this.provisional = mergeEstimate(this.provisional, normalized);
		return this.ledger.charge(normalized);
	}

	/** Alias suitable for a message_end listener. */
	messageEnd(message: AssistantMessage, estimate?: TokenUsageEstimate, identity?: string): TokenBudgetSnapshot {
		return this.observeAssistantMessage(message, estimate, identity);
	}

	onMessageEnd(message: AssistantMessage, estimate?: TokenUsageEstimate, identity?: string): TokenBudgetSnapshot {
		return this.messageEnd(message, estimate, identity);
	}

	reconcile(stats: SessionTokenStats | undefined = this.getStats?.()): TokenBudgetSnapshot {
		if (!stats) return this.ledger.snapshot();
		const current = sessionUsage(stats);
		const cumulativeDelta = usageDifference(current, this.baseline);
		const incremental = usageDifference(cumulativeDelta, this.lastCumulative);
		this.lastCumulative = cumulativeDelta;
		const confirmed = {
			inputTokens: Math.min(estimateOrZero(this.provisional.inputTokens), incremental.inputTokens ?? 0),
			outputTokens: Math.min(estimateOrZero(this.provisional.outputTokens), incremental.outputTokens ?? 0),
			cacheReadTokens: Math.min(estimateOrZero(this.provisional.cacheReadTokens), incremental.cacheReadTokens ?? 0),
			cacheWriteTokens: Math.min(
				estimateOrZero(this.provisional.cacheWriteTokens),
				incremental.cacheWriteTokens ?? 0,
			),
			cost: Math.min(estimateOrZero(this.provisional.cost), incremental.cost ?? 0),
		};
		const extra = subtractUsage(incremental, confirmed);
		this.provisional = subtractUsage(this.provisional, confirmed);
		const normalized = providerUsage(extra);
		if (normalized.chargedTokens > 0 || normalized.cost > 0 || normalized.cacheReadTokens > 0) {
			this.ledger.charge(normalized);
		}
		return this.ledger.snapshot();
	}

	/** Reconcile at a terminal boundary, including compaction/internal deltas. */
	finalize(stats: SessionTokenStats | undefined = this.getStats?.()): TokenBudgetSnapshot {
		this.reconcile(stats);
		return this.ledger.settle();
	}

	/** Current observed snapshot without altering the ledger. */
	snapshot(): TokenBudgetSnapshot {
		return this.ledger.snapshot();
	}
}

function estimateAssistantUsage(message: AssistantMessage): TokenUsageEstimate {
	return { outputTokens: estimateTokens(message as unknown as AgentMessage) };
}

/** Estimate the input authority for a child request and its assistant output. */
export function estimateSubagentRequestTokens(
	context: Context | readonly AgentMessage[],
	assistantOutput?: string | AgentMessage,
): TokenUsageEstimate {
	const inputTokens = (() => {
		if (Array.isArray(context)) return estimateContextTokens([...context] as AgentMessage[]).tokens;
		const requestContext = context as Context;
		const messageEstimate = estimateContextTokens(requestContext.messages as AgentMessage[]);
		// A prior provider usage block already describes the request prefix. On the
		// first request there is no such authority, so include the system prompt and
		// tool schema instead of silently estimating only user messages.
		if (messageEstimate.lastUsageIndex !== null) return messageEstimate.tokens;
		let prefixChars = requestContext.systemPrompt?.length ?? 0;
		if (requestContext.tools && requestContext.tools.length > 0) {
			try {
				prefixChars += JSON.stringify(requestContext.tools).length;
			} catch {
				prefixChars += requestContext.tools.length * 256;
			}
		}
		return messageEstimate.tokens + Math.ceil(prefixChars / 4);
	})();
	let outputTokens = 0;
	if (typeof assistantOutput === "string") outputTokens = Math.ceil(assistantOutput.length / 4);
	else if (assistantOutput) outputTokens = estimateTokens(assistantOutput);
	return { inputTokens, outputTokens };
}

/** A bounded estimate from a request context and final assistant message. */
export function estimateRequestUsage(
	context: Context | readonly AgentMessage[],
	assistantOutput: string | AgentMessage,
): NormalizedTokenUsage {
	return normalizeTokenUsage(undefined, estimateSubagentRequestTokens(context, assistantOutput));
}

/** Convert a provider Usage object through the same authority as a message event. */
export function normalizeAssistantUsage(usage: Usage | undefined, estimate: TokenUsageEstimate): NormalizedTokenUsage {
	return normalizeTokenUsage(usage, estimate);
}

import type { AssistantMessage, Context } from "@zykairotis/ice-ai/compat";
import { describe, expect, it } from "vitest";
import {
	calculateSubagentReportReserve,
	estimateSubagentRequestTokens,
	normalizeTokenUsage,
	type SessionTokenStats,
	SessionUsageReconciler,
	TokenBudgetLedger,
} from "../src/ice-subagent-token-budget.ts";

function stats(input: number, output: number, cacheRead = 0, cacheWrite = 0, cost = 0): SessionTokenStats {
	return { tokens: { input, output, cacheRead, cacheWrite }, cost };
}

function assistant(usage: unknown, timestamp = 1): AssistantMessage {
	return {
		role: "assistant",
		content: [{ type: "text", text: "bounded response" }],
		api: "openai-responses",
		provider: "openai",
		model: "test-model",
		usage: usage as AssistantMessage["usage"],
		stopReason: "stop",
		timestamp,
	};
}

describe("subagent token budget accounting", () => {
	it("charges input + output + cache write and excludes cache reads", () => {
		const usage = normalizeTokenUsage(
			{ input: 100, output: 200, cacheRead: 300, cacheWrite: 400, totalTokens: 9999, cost: { total: 1.25 } },
			{},
		);
		expect(usage.chargedTokens).toBe(700);
		expect(usage.cacheReadTokens).toBe(300);
		expect(usage.cost).toBe(1.25);
		expect(usage.accounting).toBe("provider");
	});

	it("uses an explicit estimate for invalid or missing provider usage", () => {
		const usage = normalizeTokenUsage(
			{ input: -1, output: Number.NaN, cacheRead: 2, cacheWrite: 3 },
			{ inputTokens: 10, outputTokens: 20, cacheReadTokens: 30, cacheWriteTokens: 40 },
		);
		expect(usage).toMatchObject({
			inputTokens: 10,
			outputTokens: 20,
			cacheReadTokens: 30,
			cacheWriteTokens: 40,
			chargedTokens: 70,
		});
		expect(usage.accounting).toBe("estimated");
	});

	it("estimates a token-complete provider payload when cost metadata is missing", () => {
		const usage = normalizeTokenUsage(
			{ input: 10, output: 20, cacheRead: 30, cacheWrite: 40, totalTokens: 60 },
			{ inputTokens: 11, outputTokens: 22, cacheReadTokens: 33, cacheWriteTokens: 44 },
		);
		expect(usage.accounting).toBe("estimated");
		expect(usage.chargedTokens).toBe(77);
	});

	it("includes first-request system prompt and tool schema in context input estimation", () => {
		const context: Context = {
			systemPrompt: "s".repeat(400),
			messages: [{ role: "user", content: "u".repeat(40), timestamp: 1 }],
			tools: [
				{
					name: "lookup",
					description: "d".repeat(200),
					parameters: { type: "object", properties: { query: { type: "string" } } },
				},
			],
		};
		const full = estimateSubagentRequestTokens(context).inputTokens ?? 0;
		const messagesOnly = estimateSubagentRequestTokens(context.messages as never).inputTokens ?? 0;
		expect(full).toBeGreaterThan(messagesOnly);
		expect(full).toBeGreaterThanOrEqual(110);
	});

	it("calculates the bounded report reserve", () => {
		expect(calculateSubagentReportReserve(1_024)).toBe(1_024);
		expect(calculateSubagentReportReserve(20_000)).toBe(2_000);
		expect(calculateSubagentReportReserve(100_000)).toBe(4_096);
		expect(() => new TokenBudgetLedger(1_000_001)).toThrow(/1000000/);
	});

	it("keeps charges monotonic and records work-limit overshoot", () => {
		const ledger = new TokenBudgetLedger(10_240, "enforced");
		expect(ledger.workPhaseLimit).toBe(9_216);
		ledger.charge({
			inputTokens: 5_000,
			outputTokens: 3_000,
			cacheReadTokens: 99,
			cacheWriteTokens: 1_500,
			cost: 2,
			accounting: "provider",
			chargedTokens: 9_500,
		});
		expect(ledger.phase).toBe("exhausted");
		const snapshot = ledger.charge({
			inputTokens: 100,
			outputTokens: 1_000,
			cacheReadTokens: 50,
			cacheWriteTokens: 0,
			cost: 1,
			accounting: "estimated",
			chargedTokens: 1_100,
		});
		expect(snapshot.chargedTokens).toBe(10_600);
		expect(snapshot.overshootTokens).toBe(360);
		expect(snapshot.accounting).toBe("mixed");
		const invalid = ledger.charge({
			inputTokens: -10,
			outputTokens: 0,
			cacheReadTokens: 0,
			cacheWriteTokens: 0,
			cost: 0,
			accounting: "provider",
			chargedTokens: -10,
		});
		expect(invalid.chargedTokens).toBe(10_600);
		expect(ledger.enterFinalizing()).toBe(true);
		expect(ledger.enterFinalizing()).toBe(false);
		expect(ledger.canStartFinalization(100, 1_024)).toBe(false);
	});

	it("exhausts exactly at the full work allowance and refuses further ordinary work", () => {
		const ledger = new TokenBudgetLedger(10_240, "enforced");
		expect(ledger.workPhaseLimit).toBe(9_216);
		// An ordinary request may not begin when its estimated input would exactly
		// consume the work allowance: any output would spend the report reserve.
		expect(ledger.canStartWork(9_216)).toBe(false);
		expect(ledger.canStartWork(9_215)).toBe(true);
		const snapshot = ledger.charge({ inputTokens: 9_216 });
		expect(snapshot.phase).toBe("exhausted");
		expect(snapshot.chargedTokens).toBe(9_216);
		expect(snapshot.overshootTokens).toBe(0);
		expect(ledger.canStartWork(0)).toBe(false);
	});

	it("reconciles provisional message usage once and charges compaction-only deltas", () => {
		const ledger = new TokenBudgetLedger(20_000);
		const reconciler = new SessionUsageReconciler(ledger, stats(10, 20, 30, 40, 1));
		const message = assistant({
			input: 100,
			output: 50,
			cacheRead: 10,
			cacheWrite: 5,
			totalTokens: 165,
			cost: { total: 2 },
		});
		reconciler.messageEnd(message);
		expect(ledger.snapshot().chargedTokens).toBe(155);
		reconciler.reconcile(stats(10, 20, 30, 40, 1));
		expect(ledger.snapshot().chargedTokens).toBe(155);
		reconciler.reconcile(stats(110, 70, 40, 45, 3));
		expect(ledger.snapshot().chargedTokens).toBe(155);
		reconciler.messageEnd(message);
		expect(ledger.snapshot().chargedTokens).toBe(155);
		reconciler.reconcile(stats(130, 80, 45, 50, 4));
		expect(ledger.snapshot().chargedTokens).toBe(190);
		expect(ledger.snapshot().cacheReadTokens).toBe(15);
		expect(ledger.snapshot().accounting).toBe("provider");
	});

	it("charges the full baseline-relative delta on the first reconcile", () => {
		const ledger = new TokenBudgetLedger(100_000);
		const reconciler = new SessionUsageReconciler(ledger, stats(10, 20, 30, 40, 1));
		reconciler.reconcile(stats(110, 70, 40, 45, 3));
		const snapshot = reconciler.snapshot();
		expect(snapshot).toMatchObject({
			inputTokens: 100,
			outputTokens: 50,
			cacheReadTokens: 10,
			cacheWriteTokens: 5,
			chargedTokens: 155,
			accounting: "provider",
		});
	});

	it("confirms immediate message usage against an advanced nonzero baseline without double charging", () => {
		const ledger = new TokenBudgetLedger(100_000);
		const reconciler = new SessionUsageReconciler(ledger, stats(10, 20, 30, 40, 1));
		reconciler.messageEnd(
			assistant({ input: 60, output: 30, cacheRead: 10, cacheWrite: 5, totalTokens: 105, cost: { total: 1 } }),
		);
		expect(ledger.snapshot().chargedTokens).toBe(95);
		// Cumulative stats advance by exactly the provisional message usage.
		reconciler.reconcile(stats(70, 50, 40, 45, 2));
		expect(ledger.snapshot().chargedTokens).toBe(95);
	});

	it("charges compaction-only deltas after a nonzero baseline", () => {
		const ledger = new TokenBudgetLedger(100_000);
		const reconciler = new SessionUsageReconciler(ledger, stats(10, 20, 30, 40, 1));
		reconciler.messageEnd(
			assistant({ input: 60, output: 30, cacheRead: 10, cacheWrite: 5, totalTokens: 105, cost: { total: 1 } }),
		);
		expect(ledger.snapshot().chargedTokens).toBe(95);
		// Stats advance with no assistant message_end in between: the extra
		// cumulative delta (100 input, 30 output) must be charged exactly once.
		reconciler.reconcile(stats(170, 80, 40, 45, 3));
		expect(ledger.snapshot().chargedTokens).toBe(225);
		// Repeated reconciliation of the same stats never double charges.
		reconciler.reconcile(stats(170, 80, 40, 45, 3));
		expect(ledger.snapshot().chargedTokens).toBe(225);
	});

	it("reports mixed accounting when provider and estimated observations coexist", () => {
		const ledger = new TokenBudgetLedger(10_240);
		const reconciler = new SessionUsageReconciler(ledger);
		reconciler.messageEnd(
			assistant({ input: 10, output: 10, cacheRead: 0, cacheWrite: 0, totalTokens: 20, cost: { total: 0 } }, 1),
		);
		reconciler.messageEnd(assistant(undefined, 2));
		expect(reconciler.snapshot().accounting).toBe("mixed");
	});
});

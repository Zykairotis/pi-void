import { describe, expect, it } from "vitest";
import {
	classifyRequestContextMode,
	hashOpaqueId,
	isContinuationDiagEnabled,
	isStalePreviousResponseError,
} from "../src/utils/provider-continuation-diag.ts";

describe("provider continuation diagnostics", () => {
	it("treats a payload without previous_response_id as full context", () => {
		expect(
			classifyRequestContextMode({
				previousResponseIdPresent: false,
				inputItemCount: 12,
				messageCount: 12,
			}),
		).toBe("full");
	});

	it("does not treat a full local resend plus an ID as a safe delta", () => {
		expect(
			classifyRequestContextMode({
				previousResponseIdPresent: true,
				inputItemCount: 12,
				messageCount: 12,
			}),
		).toBe("full-with-id");
	});

	it("classifies a smaller input plus an ID as continuation-delta", () => {
		expect(
			classifyRequestContextMode({
				previousResponseIdPresent: true,
				inputItemCount: 2,
				messageCount: 12,
			}),
		).toBe("continuation-delta");
	});

	it("hashes identifiers without emitting the original value", () => {
		const hashed = hashOpaqueId("resp_secret_123");
		expect(hashed).toMatch(/^(sha256:[0-9a-f]{16}|h:.+)$/);
		expect(hashed).not.toContain("resp_secret_123");
	});

	it("stays off in vitest unless explicitly enabled", () => {
		expect(isContinuationDiagEnabled("codexlb")).toBe(false);
		expect(isContinuationDiagEnabled("codexlb", { PI_PROVIDER_CONTINUATION_DIAG: "1" })).toBe(true);
		expect(isContinuationDiagEnabled("openai", { PI_PROVIDER_CONTINUATION_DIAG: "1" })).toBe(true);
	});

	it("recognizes the CodexLB/ChatGPT invalid previous_response_id envelope", () => {
		const error = Object.assign(new Error("400 status code"), {
			status: 400,
			error: {
				message: "Invalid `previous_response_id`.",
				type: "invalid_request_error",
				code: "invalid_request_error",
			},
		});
		expect(isStalePreviousResponseError(error)).toBe(true);
		expect(isStalePreviousResponseError(new Error("invalid_request_error: Invalid `previous_response_id`."))).toBe(
			true,
		);
		expect(isStalePreviousResponseError(new Error("rate_limit_exceeded: too many requests"))).toBe(false);
	});
});

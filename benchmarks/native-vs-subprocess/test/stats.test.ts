import assert from "node:assert/strict";
import { test } from "node:test";
import { pairedSummary, summarizeSamples } from "../src/stats.ts";

test("summarizes p50, p95, and MAD with nearest-rank percentiles", () => {
	assert.deepEqual(summarizeSamples([1, 2, 3, 4, 5]), {
		p50: 3,
		p95: 5,
		mad: 1,
	});
});

test("summarizes paired deltas with a deterministic bootstrap interval", () => {
	const summary = pairedSummary([10, 20], [7, 15], 10_000, 1213);
	assert.equal(summary.meanDelta, 4);
	assert.ok(summary.ci95[0] <= 4 && summary.ci95[1] >= 4);
	assert.deepEqual(summary, pairedSummary([10, 20], [7, 15], 10_000, 1213));
});

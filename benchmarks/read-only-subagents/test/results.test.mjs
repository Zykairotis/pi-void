import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import {
	normalizeBenchmarkResult,
	writeJsonl,
} from "../src/results.ts";

const resolvedCommit = "0123456789abcdef0123456789abcdef01234567";

function validResult(overrides = {}) {
	return {
		schemaVersion: 1,
		runId: "run-1",
		implementation: "pi-void",
		resolvedCommit,
		provider: "openai",
		model: "cx/gpt-5.6-luna",
		scenarioId: "scope.symlink-replacement",
		repeatIndex: 1,
		startedAt: "2026-08-08T00:00:00.000Z",
		wallMs: 12,
		success: true,
		...overrides,
	};
}

test("normalizes the required portable result contract", () => {
	const result = normalizeBenchmarkResult(validResult({ attempts: 1, observedOutputBytes: 24 }));
	assert.equal(result.schemaVersion, 1);
	assert.equal(result.resolvedCommit, resolvedCommit);
	assert.equal(result.attempts, 1);
	assert.equal(result.observedOutputBytes, 24);
});

test("drops raw prompts, transcripts, credentials, and checkout paths", () => {
	const result = normalizeBenchmarkResult(
		validResult({
			prompt: "secret prompt",
			transcript: "secret transcript",
			credential: "secret token",
			checkoutPath: "/private/checkout",
		}),
	);
	assert.equal("prompt" in result, false);
	assert.equal("transcript" in result, false);
	assert.equal("credential" in result, false);
	assert.equal("checkoutPath" in result, false);
});

test("rejects malformed numeric and provenance fields", () => {
	assert.throws(() => normalizeBenchmarkResult(validResult({ wallMs: -1 })), /wallMs must be a non-negative number/);
	assert.throws(() => normalizeBenchmarkResult(validResult({ attempts: 1.5 })), /attempts must be a non-negative integer/);
	assert.throws(() => normalizeBenchmarkResult(validResult({ repeatIndex: 0 })), /repeatIndex must be a positive integer/);
	assert.throws(() => normalizeBenchmarkResult(validResult({ resolvedCommit: "CURRENT_WORKSPACE" })), /resolvedCommit must be a full commit SHA/);
});

test("writes one normalized JSONL row per result", async () => {
	const dir = await mkdtemp(join(tmpdir(), "piv-b8-results-"));
	try {
		const outputPath = join(dir, "nested", "run.jsonl");
		await writeJsonl(outputPath, [validResult(), validResult({ runId: "run-2", success: false, failureCode: "timeout" })]);
		const rows = (await readFile(outputPath, "utf8")).trim().split("\n").map((line) => JSON.parse(line));
		assert.equal(rows.length, 2);
		assert.equal(rows[1].failureCode, "timeout");
		assert.equal("checkoutPath" in rows[0], false);
	} finally {
		await rm(dir, { recursive: true, force: true });
	}
});

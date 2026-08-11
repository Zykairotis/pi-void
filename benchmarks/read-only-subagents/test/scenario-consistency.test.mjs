import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import test from "node:test";
import { loadScenarioCatalog } from "../src/scenarios.ts";
import {
	assertScenarioRegressionConsistency,
	findMissingAdversarialScenarioIds,
} from "../src/validate-scenarios.ts";

const root = process.cwd();
const catalog = loadScenarioCatalog(join(root, "benchmarks/read-only-subagents/scenarios.json"));
const testSource = await readFile(join(root, "packages/coding-agent/test/piv-subagents-adversarial.test.ts"), "utf8");

test("all deterministic benchmark scenarios have adversarial regression IDs", () => {
	assert.deepEqual(findMissingAdversarialScenarioIds(catalog, testSource), []);
	assert.doesNotThrow(() => assertScenarioRegressionConsistency(catalog, testSource));
});

test("reports missing regression IDs instead of silently passing", () => {
	const missing = findMissingAdversarialScenarioIds(catalog, 'it("scope.other-case rejects the attack", () => {})');
	assert.ok(missing.includes("scope.symlink-replacement"));
	assert.throws(
		() => assertScenarioRegressionConsistency(catalog, ""),
		/missing adversarial regression IDs: /,
	);
});

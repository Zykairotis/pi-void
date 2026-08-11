import assert from "node:assert/strict";
import { test } from "node:test";
import {
	assertPivSubagentBackendPolicy,
	PIV_SUBAGENT_BACKEND_POLICY,
} from "../../../packages/coding-agent/src/piv-subagents.ts";
import { parseVitestSummary } from "../src/cli.ts";

test("freezes native-only policy with no fallback", () => {
	assert.doesNotThrow(() => assertPivSubagentBackendPolicy());
	assert.deepEqual(PIV_SUBAGENT_BACKEND_POLICY, {
		decision: "native-only",
		defaultBackend: "native",
		fallbackBackend: null,
		automaticFallback: false,
		rollback: "restore-known-good-no-state-migration",
	});
});

test("parses observed acceptance counts instead of assuming them", () => {
	assert.deepEqual(parseVitestSummary("Tests 261 passed (261)", "c1", 0), {
		command: "c1",
		passed: 261,
		total: 261,
		exitCode: 0,
	});
	assert.deepEqual(
		parseVitestSummary("Tests 1 failed | 260 passed (261)", "c1", 1),
		{
			command: "c1",
			passed: 260,
			total: 261,
			exitCode: 1,
		},
	);
	assert.deepEqual(parseVitestSummary("no summary", "c1", 1), {
		command: "c1",
		passed: 0,
		total: 0,
		exitCode: 1,
	});
});

import assert from "node:assert/strict";
import { test } from "node:test";
import {
	createFixtureWorkspace,
	removeFixtureWorkspace,
	runNativeFixture,
} from "../src/fixture.ts";
import { REQUIRED_CONTRACT_CHECKS } from "../src/types.ts";

for (const [workload, kind] of [
	["resource-loader-matrix", "resource-loader"],
	["cli-contract-matrix", "cli"],
] as const) {
	test(`${workload} records real ${kind} contract evidence`, async () => {
		const cwd = await createFixtureWorkspace();
		try {
			const result = await runNativeFixture(workload, cwd);
			assert.equal(result.status, "completed");
			assert.equal(result.contract?.kind, kind);
			assert.deepEqual(result.contract?.checks, REQUIRED_CONTRACT_CHECKS[kind]);
		} finally {
			await removeFixtureWorkspace(cwd);
		}
	});
}

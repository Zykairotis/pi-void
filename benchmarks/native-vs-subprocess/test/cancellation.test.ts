import assert from "node:assert/strict";
import { test } from "node:test";
import {
	createFixtureWorkspace,
	removeFixtureWorkspace,
	runNativeFixture,
} from "../src/fixture.ts";

test("native cancellation records one terminal trace event", async () => {
	const cwd = await createFixtureWorkspace();
	const controller = new AbortController();
	try {
		const resultPromise = runNativeFixture(
			"cancel-during-tool",
			cwd,
			controller.signal,
			() => {
				setTimeout(() => controller.abort(), 1);
			},
		);
		const result = await resultPromise;
		assert.equal(result.status, "cancelled");
		assert.equal(
			result.events.filter((event) => event.type === "terminal").length,
			1,
		);
		assert.equal(
			result.events.filter((event) => event.type === "cancel_requested").length,
			1,
		);
		assert.ok(
			result.cancelLatencyMs !== undefined && result.cancelLatencyMs >= 0,
		);
	} finally {
		await removeFixtureWorkspace(cwd);
	}
});

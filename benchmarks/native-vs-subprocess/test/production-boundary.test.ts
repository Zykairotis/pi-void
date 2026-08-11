import assert from "node:assert/strict";
import { test } from "node:test";
import {
	createFixtureWorkspace,
	removeFixtureWorkspace,
	runNativeFixture,
} from "../src/fixture.ts";

test("native benchmark uses the production child-session tool boundary", async () => {
	const cwd = await createFixtureWorkspace();
	try {
		const result = await runNativeFixture("tool-roundtrip", cwd);
		assert.ok(result.events.some((event) => event.type === "tool_start"));
		assert.ok(result.events.some((event) => event.type === "tool_end"));
	} finally {
		await removeFixtureWorkspace(cwd);
	}
});

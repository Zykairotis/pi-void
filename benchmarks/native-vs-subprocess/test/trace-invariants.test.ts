import assert from "node:assert/strict";
import { test } from "node:test";
import { assertTrace, type TraceEvent } from "../src/types.ts";

const event = (sequence: number, type: TraceEvent["type"]): TraceEvent => ({
	sequence,
	timestampNs: String(sequence),
	executionId: "execution",
	backend: "native",
	type,
	payloadHash: type,
});

test("accepts one terminal event at the end of a trace", () => {
	assert.doesNotThrow(() =>
		assertTrace([event(0, "started"), event(1, "terminal")]),
	);
});

test("rejects post-terminal events", () => {
	assert.throws(
		() =>
			assertTrace([
				event(0, "started"),
				event(1, "terminal"),
				event(2, "status"),
			]),
		/post-terminal/,
	);
});

import { once } from "node:events";
import { PassThrough } from "node:stream";
import { describe, expect, it } from "vitest";
import { readPipedStdin } from "../src/cli/piped-stdin.ts";

describe("piped CLI input", () => {
	it("does not consume an interactive terminal", async () => {
		const input = Object.assign(new PassThrough(), { isTTY: true });
		expect(await readPipedStdin(input)).toBeUndefined();
		expect(input.readableFlowing).toBeNull();
		input.destroy();
	});
	it("collects split UTF-8 input and preserves internal whitespace", async () => {
		const input = new PassThrough();
		const result = readPipedStdin(input);
		const bytes = Buffer.from("  hello \u03bb\nworld  \n", "utf8");
		for (const byte of bytes) input.write(Buffer.from([byte]));
		input.end();
		expect(await result).toBe("hello \u03bb\nworld");
		expect(input.listenerCount("data")).toBe(0);
		expect(input.listenerCount("end")).toBe(0);
	});
	it("accepts an empty pipe", async () => {
		const input = new PassThrough();
		const result = readPipedStdin(input);
		input.end();
		expect(await result).toBeUndefined();
	});
	it("does not wait for a second end event on an exhausted stream", async () => {
		const input = new PassThrough();
		input.resume();
		const ended = once(input, "end");
		input.end();
		await ended;
		expect(await readPipedStdin(input)).toBeUndefined();
	});
	it("rejects premature close rather than executing a truncated prompt", async () => {
		const input = new PassThrough();
		const result = readPipedStdin(input);
		const assertion = expect(result).rejects.toThrow("before reaching EOF");
		input.write("partial input");
		input.destroy();
		await assertion;
	});
	it("propagates read failures instead of waiting forever", async () => {
		const input = new PassThrough();
		const error = new Error("stdin fixture failure");
		const result = readPipedStdin(input);
		const assertion = expect(result).rejects.toBe(error);
		input.destroy(error);
		await assertion;
	});
});

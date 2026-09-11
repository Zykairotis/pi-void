import { describe, expect, it } from "vitest";
import { getIceUserAgent } from "../src/utils/ice-user-agent.ts";

describe("getIceUserAgent", () => {
	it("formats the user agent expected by ice.dev", () => {
		const runtime = process.versions.bun ? `bun/${process.versions.bun}` : `node/${process.version}`;
		const userAgent = getIceUserAgent("1.2.3");

		expect(userAgent).toBe(`ice/1.2.3 (${process.platform}; ${runtime}; ${process.arch})`);
		expect(userAgent).toMatch(/^ice\/[^\s()]+ \([^;()]+;\s*[^;()]+;\s*[^()]+\)$/);
	});
});

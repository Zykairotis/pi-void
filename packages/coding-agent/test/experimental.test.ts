import { afterEach, describe, expect, it } from "vitest";
import { areExperimentalFeaturesEnabled } from "../src/core/experimental.ts";

describe("areExperimentalFeaturesEnabled", () => {
	const originalIceExperimental = process.env.ICE_EXPERIMENTAL;

	afterEach(() => {
		if (originalIceExperimental === undefined) {
			delete process.env.ICE_EXPERIMENTAL;
		} else {
			process.env.ICE_EXPERIMENTAL = originalIceExperimental;
		}
	});

	it("returns false when ICE_EXPERIMENTAL is unset", () => {
		delete process.env.ICE_EXPERIMENTAL;

		expect(areExperimentalFeaturesEnabled()).toBe(false);
	});

	it("returns false when ICE_EXPERIMENTAL is empty", () => {
		process.env.ICE_EXPERIMENTAL = "";

		expect(areExperimentalFeaturesEnabled()).toBe(false);
	});

	it("returns true when ICE_EXPERIMENTAL is set to 1", () => {
		process.env.ICE_EXPERIMENTAL = "1";

		expect(areExperimentalFeaturesEnabled()).toBe(true);
	});

	it("returns false when ICE_EXPERIMENTAL is set to 0", () => {
		process.env.ICE_EXPERIMENTAL = "0";

		expect(areExperimentalFeaturesEnabled()).toBe(false);
	});

	it("returns false when ICE_EXPERIMENTAL is set to a non-1 value", () => {
		process.env.ICE_EXPERIMENTAL = "true";

		expect(areExperimentalFeaturesEnabled()).toBe(false);
	});
});

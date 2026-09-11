import { describe, expect, it } from "vitest";
import { clearSessionEnvironment, getIceEnv, normalizeLegacyEnvironment } from "../../src/core/legacy-compat/env.ts";
import { matchesEntryType, normalizeLegacySettings } from "../../src/core/legacy-compat/identity.ts";

describe("ice identity", () => {
	it("reads only ICE_* environment names", () => {
		expect(getIceEnv("ICE_LOCAL_API_KEY", { PIV_LOCAL_API_KEY: "legacy" })).toBeUndefined();
		expect(getIceEnv("ICE_OFFLINE", { PI_OFFLINE: "1" })).toBeUndefined();
		expect(getIceEnv("ICE_LOCAL_API_KEY", { ICE_LOCAL_API_KEY: "ice" })).toBe("ice");
		expect(normalizeLegacyEnvironment({ PIV_LOCAL_API_KEY: "legacy" }).ICE_LOCAL_API_KEY).toBeUndefined();
	});

	it("does not treat historical journal envelopes as current types", () => {
		expect(matchesEntryType("ice-subagent-hook-v1", "ice-subagent-hook-v1")).toBe(true);
		expect(matchesEntryType("piv-subagent-hook-v1", "ice-subagent-hook-v1")).toBe(false);
	});

	it("does not promote a piv settings namespace to ice", () => {
		expect(normalizeLegacySettings({ piv: { subagents: { enabled: false } }, theme: "dark" })).toEqual({
			piv: { subagents: { enabled: false } },
			theme: "dark",
		});
		expect(normalizeLegacySettings({ ice: { subagents: { enabled: true } } }).ice).toEqual({
			subagents: { enabled: true },
		});
		expect(() => normalizeLegacySettings(null)).toThrow(/expected an object/);
	});

	it("clears only ICE_* session metadata", () => {
		const env: Record<string, string | undefined> = { ICE_MODEL: "stale", KEEP: "yes" };
		clearSessionEnvironment(env);
		expect(env).toEqual({ KEEP: "yes" });
	});
});

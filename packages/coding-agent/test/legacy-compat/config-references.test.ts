import { afterEach, describe, expect, it, vi } from "vitest";
import { getCompatibleConfigEnv } from "../../src/core/legacy-compat/env.ts";
import {
	getMissingConfigValueEnvVarNames,
	resolveConfigValue,
	resolveHeaders,
} from "../../src/core/resolve-config-value.ts";

afterEach(() => vi.unstubAllEnvs());

describe("legacy configuration environment references", () => {
	it("resolves only the exact current variable name", () => {
		vi.stubEnv("PIV_LOCAL_API_KEY", undefined);
		vi.stubEnv("ICE_LOCAL_API_KEY", undefined);
		expect(resolveConfigValue("$PIV_LOCAL_API_KEY")).toBeUndefined();
		vi.stubEnv("ICE_LOCAL_API_KEY", "fixture-only-value");
		expect(resolveConfigValue("$ICE_LOCAL_API_KEY")).toBe("fixture-only-value");
		expect(resolveConfigValue("$PIV_LOCAL_API_KEY")).toBeUndefined();
		// biome-ignore lint/suspicious/noTemplateCurlyInString: literal configuration interpolation input
		expect(getMissingConfigValueEnvVarNames("${ICE_LOCAL_API_KEY}")).toEqual([]);
		// biome-ignore lint/suspicious/noTemplateCurlyInString: literal configuration interpolation input
		expect(resolveHeaders({ authorization: "Bearer ${ICE_LOCAL_API_KEY}" })).toEqual({
			authorization: "Bearer fixture-only-value",
		});
		expect(process.env.PIV_LOCAL_API_KEY).toBeUndefined();
	});

	it("retains layer precedence for the exact name", () => {
		const ambient = { ICE_LOCAL_API_KEY: "ambient", PIV_LOCAL_API_KEY: "old-ambient" };
		expect(getCompatibleConfigEnv("ICE_LOCAL_API_KEY", undefined, ambient)).toBe("ambient");
		expect(getCompatibleConfigEnv("PIV_LOCAL_API_KEY", undefined, ambient)).toBe("old-ambient");
		expect(getCompatibleConfigEnv("ICE_LOCAL_API_KEY", { ICE_LOCAL_API_KEY: "scoped" }, ambient)).toBe("scoped");
		expect(
			getCompatibleConfigEnv("ICE_LOCAL_API_KEY", { ICE_LOCAL_API_KEY: "", PIV_LOCAL_API_KEY: "stale" }, ambient),
		).toBe("");
	});

	it("does not reinterpret literals, escaped references, or unrelated provider names", () => {
		expect(resolveConfigValue("PIV_LOCAL_API_KEY", {})).toBe("PIV_LOCAL_API_KEY");
		expect(resolveConfigValue("$$PIV_LOCAL_API_KEY", {})).toBe("$PIV_LOCAL_API_KEY");
		expect(
			getCompatibleConfigEnv("OPENAI_API_KEY", { OPENAI_API_KEY: "scoped" }, { OPENAI_API_KEY: "ambient" }),
		).toBe("scoped");
		expect(getCompatibleConfigEnv("PI_UNRECOGNIZED", {}, { ICE_UNRECOGNIZED: "not-an-alias" })).toBeUndefined();
	});
});

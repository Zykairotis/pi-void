import { afterEach, describe, expect, it, vi } from "vitest";
import { getProviderEnvValue } from "../src/utils/provider-env.ts";

afterEach(() => vi.unstubAllEnvs());

describe("direct AI-package environment compatibility", () => {
	it("does not treat PI_* names as ICE_* provider values", () => {
		vi.stubEnv("ICE_CACHE_RETENTION", undefined);
		vi.stubEnv("PI_CACHE_RETENTION", "old-process");
		expect(getProviderEnvValue("ICE_CACHE_RETENTION")).toBeUndefined();
		vi.stubEnv("ICE_CACHE_RETENTION", "new-process");
		expect(getProviderEnvValue("ICE_CACHE_RETENTION")).toBe("new-process");
		expect(getProviderEnvValue("ICE_CACHE_RETENTION", { PI_CACHE_RETENTION: "old-scoped" })).toBe("new-process");
		expect(getProviderEnvValue("ICE_CACHE_RETENTION", { ICE_CACHE_RETENTION: "new-scoped" })).toBe("new-scoped");
		expect(getProviderEnvValue("ICE_CACHE_RETENTION", { ICE_CACHE_RETENTION: "" })).toBe("");
	});
	it("does not guess renamed third-party credential variables", () => {
		vi.stubEnv("OPENAI_API_KEY", undefined);
		vi.stubEnv("PI_OPENAI_API_KEY", "not-a-supported-variable");
		expect(getProviderEnvValue("OPENAI_API_KEY")).toBeUndefined();
	});
});

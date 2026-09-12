import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, test } from "vitest";
import { ENV_AGENT_DIR } from "../src/config.ts";
import { createDefaultAppearance } from "../src/modes/interactive/appearance/appearance-defaults.ts";
import {
	applyProfileToAppearance,
	deleteProfile,
	duplicateProfile,
	exportBundle,
	importBundle,
	listProfiles,
	readProfile,
	renameProfile,
	saveProfile,
	validateAppearancePartial,
} from "../src/modes/interactive/appearance/appearance-profiles.ts";

let agentDir = "";
const savedEnv = process.env[ENV_AGENT_DIR];

beforeEach(() => {
	agentDir = mkdtempSync(join(tmpdir(), "ice-profiles-"));
	process.env[ENV_AGENT_DIR] = agentDir;
});

afterEach(() => {
	if (savedEnv === undefined) delete process.env[ENV_AGENT_DIR];
	else process.env[ENV_AGENT_DIR] = savedEnv;
	rmSync(agentDir, { recursive: true, force: true });
});

describe("appearance profiles and bundles (F10)", () => {
	test("save/list/read/delete round-trips", () => {
		expect(saveProfile({ version: 1, name: "minimal", theme: "dark", appearance: { version: 1 } })).toEqual({
			success: true,
		});
		expect(listProfiles()).toEqual(["minimal"]);
		expect(readProfile("minimal").themeSetting).toEqual({ mode: "fixed", theme: "dark" });
		expect(deleteProfile("minimal")).toEqual({ success: true });
		expect(listProfiles()).toEqual([]);
	});

	test("invalid profile appearance is rejected with no write", () => {
		const result = saveProfile({
			version: 1,
			name: "bad",
			appearance: { version: 1, markdown: { tableStyle: "nope" } } as never,
		});
		expect(result.success).toBe(false);
		expect(listProfiles()).toEqual([]);
	});

	test("profile applies over base appearance", () => {
		saveProfile({
			version: 1,
			name: "clean",
			appearance: { version: 1, markdown: { tableStyle: "clean" } },
		});
		const applied = applyProfileToAppearance(readProfile("clean"), createDefaultAppearance());
		expect(applied.markdown.tableStyle).toBe("clean");
		expect(applied.userMessage.format).toBe("{message}");
	});

	test("bundle export/import validates with no partial application", () => {
		const exported = exportBundle({
			version: 1,
			name: "bundle",
			appearance: { version: 1, markdown: { tableStyle: "ascii" } },
		});
		expect(exported.success).toBe(true);
		const imported = importBundle(exported.json ?? "");
		expect(imported.success).toBe(true);
		expect(imported.bundle?.appearance?.markdown?.tableStyle).toBe("ascii");
		const bad = importBundle(
			JSON.stringify({ version: 1, appearance: { version: 1, markdown: { tableStyle: "nope" } } }),
		);
		expect(bad.success).toBe(false);
		const oversized = importBundle(`{"version":1,"appearance":{"version":1,"pad":"${"x".repeat(300 * 1024)}"}}`);
		expect(oversized.success).toBe(false);
	});

	test("deleting a profile does not touch themes", () => {
		saveProfile({ version: 1, name: "t", theme: "dark", appearance: { version: 1 } });
		expect(deleteProfile("t")).toEqual({ success: true });
		expect(deleteProfile("t").success).toBe(false);
	});

	test("nested profile sections merge over the current base", () => {
		const base = createDefaultAppearance();
		base.thinking.indicator.intervalMs = 333;
		base.thinking.block.hiddenLabel = "base-label";
		const profile = {
			version: 2 as const,
			name: "nested",
			appearance: { version: 2 as const, thinking: { indicator: { reverseMirror: true } } },
		};
		const applied = applyProfileToAppearance(profile, base);
		expect(applied.thinking.indicator.reverseMirror).toBe(true);
		expect(applied.thinking.indicator.intervalMs).toBe(333);
		expect(applied.thinking.block.hiddenLabel).toBe("base-label");
	});

	test("profile collisions require explicit overwrite", () => {
		const profile = { version: 1 as const, name: "collision", appearance: { version: 1 as const } };
		expect(saveProfile(profile)).toEqual({ success: true });
		expect(saveProfile(profile).success).toBe(false);
		expect(saveProfile(profile, true)).toEqual({ success: true });
	});

	test("rename and duplicate are collision-safe", () => {
		expect(saveProfile({ version: 1, name: "source", appearance: { version: 1 } })).toEqual({ success: true });
		expect(duplicateProfile("source", "copy")).toEqual({ success: true });
		expect(duplicateProfile("source", "copy").success).toBe(false);
		expect(renameProfile("source", "renamed")).toEqual({ success: true });
		expect(listProfiles()).toEqual(["copy", "renamed"]);
	});

	test("bundle import validates embedded native theme data", () => {
		const invalidTheme = importBundle(JSON.stringify({ version: 1, theme: { name: "bad", colors: {} } }));
		expect(invalidTheme.success).toBe(false);
		expect(invalidTheme.error).toContain("invalid theme in bundle");
	});

	test("non-object appearance partials are rejected everywhere", () => {
		for (const partial of [null, 5, "nope", [], true]) {
			expect(validateAppearancePartial(partial).valid).toBe(false);
			expect(validateAppearancePartial(partial).issues.join(" ")).toContain("expected an object");
		}
		expect(validateAppearancePartial({}).valid).toBe(true);
		expect(saveProfile({ version: 2, name: "scalar", appearance: 5 as never }).success).toBe(false);
		const scalarBundle = importBundle(JSON.stringify({ version: 2, appearance: "nope" }));
		expect(scalarBundle.success).toBe(false);
		expect(scalarBundle.appearanceIssues?.join(" ")).toContain("expected an object");
		const profileWithScalar = importBundle(
			JSON.stringify({ version: 2, profiles: [{ version: 2, name: "bad", appearance: 5 }] }),
		);
		expect(profileWithScalar.success).toBe(false);
		expect(profileWithScalar.error).toBe("bundle contains an invalid profile");
		expect(() =>
			applyProfileToAppearance({ version: 2, name: "bad", appearance: 5 as never }, createDefaultAppearance()),
		).toThrow(/expected an object/);
	});
});

import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, test } from "vitest";
import { ENV_AGENT_DIR } from "../src/config.ts";
import {
	cloneTheme,
	deleteCustomTheme,
	exportCustomTheme,
	importCustomTheme,
	isCustomTheme,
	readCustomTheme,
	renameCustomTheme,
	resetThemeToken,
	setThemeTokenValue,
} from "../src/modes/interactive/appearance/theme-library.ts";
import { initTheme } from "../src/modes/interactive/theme/theme.ts";

let agentDir = "";
const savedEnv = process.env[ENV_AGENT_DIR];

beforeEach(() => {
	agentDir = mkdtempSync(join(tmpdir(), "ice-theme-lib-"));
	process.env[ENV_AGENT_DIR] = agentDir;
	initTheme("dark");
});

afterEach(() => {
	if (savedEnv === undefined) delete process.env[ENV_AGENT_DIR];
	else process.env[ENV_AGENT_DIR] = savedEnv;
	rmSync(agentDir, { recursive: true, force: true });
});

describe("theme library (F8)", () => {
	test("clone creates an editable custom theme without touching builtins", () => {
		expect(cloneTheme("dark", "audit-clone")).toEqual({ success: true });
		expect(isCustomTheme("audit-clone")).toBe(true);
		expect(isCustomTheme("dark")).toBe(false);
		const data = readCustomTheme("audit-clone");
		expect(data.name).toBe("audit-clone");
	});

	test("token editing validates values and round-trips", () => {
		expect(cloneTheme("dark", "audit-edit")).toEqual({ success: true });
		expect(setThemeTokenValue("audit-edit", "accent", "#ff0000")).toEqual({ success: true });
		expect(readCustomTheme("audit-edit").colors.accent).toBe("#ff0000");
		expect(setThemeTokenValue("audit-edit", "accent", "not a color!!").success).toBe(false);
		expect(setThemeTokenValue("audit-edit", "nope-token", "#ffffff").success).toBe(false);
		expect(setThemeTokenValue("dark", "accent", "#ffffff").success).toBe(false);
	});

	test("reset restores token from base theme", () => {
		expect(cloneTheme("dark", "audit-reset")).toEqual({ success: true });
		expect(setThemeTokenValue("audit-reset", "accent", "#ff0000")).toEqual({ success: true });
		expect(resetThemeToken("audit-reset", "accent", "dark")).toEqual({ success: true });
		const reset = readCustomTheme("audit-reset");
		const base = JSON.parse(readFileSync(join("src", "modes", "interactive", "theme", "dark.json"), "utf-8")) as {
			colors: Record<string, unknown>;
		};
		expect(reset.colors.accent).toBe(base.colors.accent);
	});

	test("rename and delete manage custom themes", () => {
		expect(cloneTheme("dark", "audit-rename")).toEqual({ success: true });
		expect(renameCustomTheme("audit-rename", "audit-renamed")).toEqual({ success: true });
		expect(isCustomTheme("audit-renamed")).toBe(true);
		expect(deleteCustomTheme("audit-renamed")).toEqual({ success: true });
		expect(isCustomTheme("audit-renamed")).toBe(false);
		expect(deleteCustomTheme("dark").success).toBe(false);
	});

	test("export/import round-trips theme data", () => {
		expect(cloneTheme("dark", "audit-export")).toEqual({ success: true });
		const exported = exportCustomTheme("audit-export");
		expect(exported.success).toBe(true);
		const sourceAccent = readCustomTheme("audit-export").colors.accent;
		expect(deleteCustomTheme("audit-export")).toEqual({ success: true });
		expect(importCustomTheme("audit-imported", exported.json ?? "")).toEqual({ success: true });
		expect(readCustomTheme("audit-imported").colors.accent).toBe(sourceAccent);
	});

	test("invalid names and collisions are rejected", () => {
		expect(cloneTheme("dark", "../evil").success).toBe(false);
		expect(cloneTheme("dark", "audit-dup")).toEqual({ success: true });
		expect(cloneTheme("dark", "audit-dup").success).toBe(false);
		expect(importCustomTheme("audit-dup", "{}").success).toBe(false);
	});
});

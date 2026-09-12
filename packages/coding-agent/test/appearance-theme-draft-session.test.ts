import { existsSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, test } from "vitest";
import { ENV_AGENT_DIR } from "../src/config.ts";
import { ThemeDraftSession } from "../src/modes/interactive/appearance/theme-draft-session.ts";
import { cloneTheme, readCustomTheme } from "../src/modes/interactive/appearance/theme-library.ts";
import { initTheme } from "../src/modes/interactive/theme/theme.ts";

let agentDir = "";
const savedEnv = process.env[ENV_AGENT_DIR];

beforeEach(() => {
	agentDir = mkdtempSync(join(tmpdir(), "ice-theme-draft-"));
	process.env[ENV_AGENT_DIR] = agentDir;
	initTheme("dark");
});

afterEach(() => {
	if (savedEnv === undefined) delete process.env[ENV_AGENT_DIR];
	else process.env[ENV_AGENT_DIR] = savedEnv;
	rmSync(agentDir, { recursive: true, force: true });
});

function themePath(name: string): string {
	return join(agentDir, "themes", `${name}.json`);
}

describe("theme draft transaction", () => {
	test("clone and token edits are write-free until commit", () => {
		const draft = new ThemeDraftSession("dark");
		expect(draft.cloneSelected("draft-custom")).toEqual({ success: true });
		expect(draft.setToken("accent", "#ff0000")).toEqual({ success: true });
		expect(existsSync(themePath("draft-custom"))).toBe(false);
		expect(draft.createPreviewTheme().fg("accent", "x")).toContain("38;");

		const result = draft.commit();
		expect(result).toEqual({ success: true, selectedTheme: "draft-custom" });
		expect(existsSync(themePath("draft-custom"))).toBe(true);
		expect(readCustomTheme("draft-custom").colors.accent).toBe("#ff0000");
	});

	test("dropping a staged clone is a true cancel with zero files", () => {
		const draft = new ThemeDraftSession("dark");
		expect(draft.cloneSelected("cancelled-custom")).toEqual({ success: true });
		expect(draft.setToken("accent", "#00ff00")).toEqual({ success: true });
		expect(existsSync(themePath("cancelled-custom"))).toBe(false);
		// No commit: discarding the draft is the Cancel behavior.
	});

	test("delete is staged and does not remove the original until commit", () => {
		expect(cloneTheme("dark", "delete-me")).toEqual({ success: true });
		const draft = new ThemeDraftSession("delete-me");
		expect(draft.deleteSelected()).toEqual({ success: true });
		expect(existsSync(themePath("delete-me"))).toBe(true);
		expect(draft.commit().success).toBe(true);
		expect(existsSync(themePath("delete-me"))).toBe(false);
	});

	test("rename writes destination before deleting original", () => {
		expect(cloneTheme("dark", "old-name")).toEqual({ success: true });
		const draft = new ThemeDraftSession("old-name");
		expect(draft.renameSelected("new-name")).toEqual({ success: true });
		expect(existsSync(themePath("old-name"))).toBe(true);
		expect(existsSync(themePath("new-name"))).toBe(false);
		expect(draft.commit()).toEqual({ success: true, selectedTheme: "new-name" });
		expect(existsSync(themePath("old-name"))).toBe(false);
		expect(existsSync(themePath("new-name"))).toBe(true);
	});
});

describe("theme draft import collisions (plan 11.6)", () => {
	test("import rejects an existing name unless replace is explicit", () => {
		expect(cloneTheme("dark", "mine")).toEqual({ success: true });
		const draft = new ThemeDraftSession("dark");
		const payload = JSON.stringify({ ...draft.getThemeData("dark"), name: "mine" });
		expect(draft.importTheme("mine", payload)).toEqual({
			success: false,
			error: 'Theme "mine" already exists',
		});
	});

	test("replace stages over an existing custom theme and overwrites on commit", () => {
		expect(cloneTheme("dark", "mine")).toEqual({ success: true });
		const draft = new ThemeDraftSession("mine");
		const payload = JSON.stringify({
			...draft.getThemeData("dark"),
			colors: { ...(draft.getThemeData("dark").colors as Record<string, unknown>), accent: "#123456" },
			name: "mine",
		});
		expect(draft.importTheme("mine", payload)).toEqual({ success: false, error: 'Theme "mine" already exists' });
		expect(draft.importTheme("mine", payload, { replace: true })).toEqual({ success: true });
		expect(draft.getSelectedName()).toBe("mine");
		expect(draft.getThemeData().colors.accent).toBe("#123456");
		// Original file still untouched before apply.
		expect(readCustomTheme("mine").colors.accent).not.toBe("#123456");
		expect(draft.commit()).toEqual({ success: true, selectedTheme: "mine" });
		expect(readCustomTheme("mine").colors.accent).toBe("#123456");
	});

	test("built-in themes cannot be replaced", () => {
		const draft = new ThemeDraftSession("dark");
		const payload = JSON.stringify({ ...draft.getThemeData("dark"), name: "dark" });
		const result = draft.importTheme("dark", payload, { replace: true });
		expect(result.success).toBe(false);
		expect(result.error).toContain("cannot be replaced");
	});
});

describe("theme draft variable CRUD (plan 11.5)", () => {
	function editableDraft(): ThemeDraftSession {
		const draft = new ThemeDraftSession("dark");
		expect(draft.cloneSelected("var-custom")).toEqual({ success: true });
		return draft;
	}

	test("rename rewrites exact references and validates", () => {
		const draft = editableDraft();
		expect(draft.setVariable("brand", "#336699")).toEqual({ success: true });
		expect(draft.setToken("accent", "brand")).toEqual({ success: true });
		expect(draft.variableReferences("brand")).toEqual(["accent"]);
		expect(draft.renameVariable("brand", "renamed")).toEqual({ success: true });
		expect(draft.getThemeData().colors.accent).toBe("renamed");
		expect(draft.variableReferences("renamed")).toEqual(["accent"]);
		// Old name is gone; new name resolves through validation.
		expect(draft.getThemeData().vars?.renamed).toBe("#336699");
	});

	test("rename refuses colliding targets and invalid names", () => {
		const draft = editableDraft();
		expect(draft.setVariable("a", "#111111")).toEqual({ success: true });
		expect(draft.setVariable("b", "#222222")).toEqual({ success: true });
		expect(draft.renameVariable("a", "b").success).toBe(false);
		expect(draft.renameVariable("a", "1bad").success).toBe(false);
		expect(draft.getThemeData().vars?.a).toBe("#111111");
	});

	test("delete fails while referenced and reverts", () => {
		const draft = editableDraft();
		expect(draft.setVariable("keep", "#101010")).toEqual({ success: true });
		expect(draft.setToken("accent", "keep")).toEqual({ success: true });
		const result = draft.deleteVariable("keep");
		expect(result.success).toBe(false);
		expect(draft.getThemeData().vars?.keep).toBe("#101010");
		expect(draft.getThemeData().colors.accent).toBe("keep");
		expect(draft.setToken("accent", "#202020")).toEqual({ success: true });
		expect(draft.deleteVariable("keep")).toEqual({ success: true });
		expect(draft.getThemeData().vars?.keep).toBeUndefined();
	});

	test("delete of an unreferenced variable succeeds", () => {
		const draft = editableDraft();
		expect(draft.setVariable("loose", "#0f0f0f")).toEqual({ success: true });
		expect(draft.deleteVariable("loose")).toEqual({ success: true });
		expect(draft.getThemeData().vars?.loose).toBeUndefined();
	});
});

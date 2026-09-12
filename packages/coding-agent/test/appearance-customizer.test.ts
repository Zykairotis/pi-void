import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { type Terminal, TuiMainScreen, visibleWidth } from "@zykairotis/ice-tui";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { AppearanceCustomizerComponent } from "../src/modes/interactive/components/appearance-customizer.ts";
import { initTheme } from "../src/modes/interactive/theme/theme.ts";

initTheme("dark");

import { ENV_AGENT_DIR } from "../src/config.ts";
import type { SettingsManager } from "../src/core/settings-manager.ts";
import { InteractiveAppearanceController } from "../src/modes/interactive/appearance/appearance-controller.ts";
import { createDefaultAppearance } from "../src/modes/interactive/appearance/appearance-defaults.ts";
import { saveProfile } from "../src/modes/interactive/appearance/appearance-profiles.ts";
import type { AppearanceSettingsV2 } from "../src/modes/interactive/appearance/appearance-types.ts";
import { parseAppearanceThemeSetting } from "../src/modes/interactive/appearance/appearance-types.ts";
import { validateAppearance } from "../src/modes/interactive/appearance/appearance-validate.ts";
import { CustomizationDraftSession } from "../src/modes/interactive/appearance/customization-draft-session.ts";
import type { ThemeDraftSession } from "../src/modes/interactive/appearance/theme-draft-session.ts";
import { cloneTheme } from "../src/modes/interactive/appearance/theme-library.ts";

function createManager(initial: unknown = undefined): { manager: SettingsManager; writes: unknown[] } {
	const writes: unknown[] = [];
	let appearance = initial;
	const manager = {
		getAppearanceSettings: () => validateAppearance(appearance).appearance,
		getAppearanceThemeSetting: () => ({ mode: "fixed", theme: "dark" }),
		setAppearanceSettings: (next: unknown) => {
			const validated = validateAppearance(next);
			if (!validated.valid) return validated;
			appearance = structuredClone(validated.appearance);
			writes.push(structuredClone(validated.appearance));
			return validated;
		},
	} as unknown as SettingsManager;
	return { manager, writes };
}

function openCustomizer(manager: SettingsManager, controller: InteractiveAppearanceController) {
	const events = { drafts: 0, applied: 0, cancelled: 0 };
	const customizer = new AppearanceCustomizerComponent(
		new CustomizationDraftSession(manager, controller, "dark", "dark"),
		{
			onDraftChange: (draft) => {
				events.drafts++;
				controller.preview(draft);
			},
			onApply: () => {
				events.applied++;
				controller.commit(controller.getEffective());
			},
			onCancel: () => {
				events.cancelled++;
				controller.rollback();
			},
		},
	);
	return { customizer, events };
}

describe("appearance customizer viewport", () => {
	test.each([
		[80, 24],
		[120, 30],
		[140, 69],
	])("keeps settings and scrollable preview within %ix%i", (columns, rows) => {
		const terminal: Terminal = {
			columns,
			rows,
			kittyProtocolActive: false,
			start: vi.fn(),
			stop: vi.fn(),
			drainInput: async () => {},
			write: vi.fn(),
			moveBy: vi.fn(),
			hideCursor: vi.fn(),
			showCursor: vi.fn(),
			clearLine: vi.fn(),
			clearFromCursor: vi.fn(),
			clearScreen: vi.fn(),
			setTitle: vi.fn(),
			setProgress: vi.fn(),
		};
		const ui = new TuiMainScreen(terminal);
		const { manager, writes } = createManager();
		const controller = new InteractiveAppearanceController(manager);
		const onCancel = vi.fn();
		const onApply = vi.fn();
		const customizer = new AppearanceCustomizerComponent(
			new CustomizationDraftSession(manager, controller, "dark", "dark"),
			{ onDraftChange: vi.fn(), onApply, onCancel },
			ui,
		);
		try {
			const frame = (): string => {
				const lines = customizer.render(columns);
				expect(lines).toHaveLength(rows);
				for (const line of lines) expect(visibleWidth(line)).toBe(columns);
				return lines.join("\n");
			};
			expect(frame()).toContain("Live appearance preview");
			expect(frame()).toContain("Preview user message");
			customizer.handleInput("\x1b[B");
			expect(frame()).toMatch(/→.*User messages/);
			customizer.handleInput("\r");
			expect(frame()).toContain("Appearance > User messages");
			for (let i = 0; i < 13; i++) {
				customizer.handleInput("\x1b[B");
				frame();
			}
			expect(frame()).toMatch(/→.*Reset section/);
			customizer.handleInput("\x1b");
			expect(onCancel).not.toHaveBeenCalled();
			customizer.handleInput("\t");
			for (let i = 0; i < 30; i++) {
				customizer.handleInput("\x1b[6~");
				frame();
			}
			expect(frame()).toContain("~/project");
			customizer.handleInput("\x1b");
			expect(onCancel).not.toHaveBeenCalled();
			customizer.handleInput("\x1b");
			expect(onCancel).toHaveBeenCalledOnce();
			expect(onApply).not.toHaveBeenCalled();
			expect(writes).toHaveLength(0);
		} finally {
			customizer.dispose();
			ui.stop();
		}
	});
});

describe("appearance customizer transaction (F2)", () => {
	test("open causes zero writes", () => {
		const { manager, writes } = createManager();
		const controller = new InteractiveAppearanceController(manager);
		controller.beginPreview();
		openCustomizer(manager, controller);
		expect(writes).toHaveLength(0);
	});

	test("section edits preview without writes; apply persists once", () => {
		const { manager, writes } = createManager();
		const controller = new InteractiveAppearanceController(manager);
		controller.beginPreview();
		const { customizer } = openCustomizer(manager, controller);
		const list = customizer.getSettingsList();
		// Tables row cycles values directly on the root list.
		const onChange = (list as unknown as { onChange: (id: string, v: string) => void }).onChange;
		expect(typeof onChange).toBe("function");
		expect(writes).toHaveLength(0);
		expect(controller.isPreviewing()).toBe(true);
		// Apply path commits the previewed effective state exactly once.
		controller.commit(controller.getEffective());
		expect(writes).toHaveLength(1);
	});

	test("cancel restores baseline with zero writes", () => {
		const { manager, writes } = createManager();
		const controller = new InteractiveAppearanceController(manager);
		controller.beginPreview();
		const { customizer } = openCustomizer(manager, controller);
		expect(customizer).toBeDefined();
		const draft = (() => {
			const d = structuredClone(createDefaultAppearance());
			d.markdown.tableStyle = "ascii";
			return d;
		})();
		controller.preview(draft);
		expect(controller.getEffective().markdown.tableStyle).toBe("ascii");
		controller.rollback();
		expect(controller.getEffective().markdown.tableStyle).toBe("unicode");
		expect(writes).toHaveLength(0);
	});

	test("invalid draft cannot be applied", () => {
		const { manager, writes } = createManager();
		const controller = new InteractiveAppearanceController(manager);
		controller.beginPreview();
		const bad = structuredClone(createDefaultAppearance());
		(bad.markdown as { tableStyle: string }).tableStyle = "nope";
		const result = controller.preview(bad);
		expect(result.valid).toBe(false);
		const commit = controller.commit(bad);
		expect(commit.valid).toBe(false);
		expect(writes).toHaveLength(0);
	});

	test("customizer exposes all primary appearance sections", () => {
		const { manager } = createManager();
		const controller = new InteractiveAppearanceController(manager);
		const onDraftChange = vi.fn();
		const customizer = new AppearanceCustomizerComponent(
			new CustomizationDraftSession(manager, controller, "dark", "dark"),
			{
				onDraftChange,
				onApply: vi.fn(),
				onCancel: vi.fn(),
			},
		);
		const rendered = customizer.render(100).join("\n");
		for (const label of [
			"User messages",
			"Input box",
			"Thinking indicator",
			"Thinking verbs",
			"Thinking block",
			"Assistant message",
			"Markdown",
			"Tool execution",
			"Bash execution",
			"Diffs",
			"System cards",
			"Status indicators",
			"Footer",
			"Shared chrome",
			"Agent chrome",
			"Input highlighters",
			"Profiles",
			"Import / export",
			"Live appearance preview",
		]) {
			expect(rendered).toContain(label);
		}
	});

	test("Reset draft restores the captured baseline without cancelling", () => {
		const initial = createDefaultAppearance();
		initial.markdown.tableStyle = "ascii";
		const { manager, writes } = createManager(initial);
		const controller = new InteractiveAppearanceController(manager);
		controller.beginPreview();
		const onCancel = vi.fn();
		const drafts: ReturnType<typeof createDefaultAppearance>[] = [];
		const customizer = new AppearanceCustomizerComponent(
			new CustomizationDraftSession(manager, controller, "dark", "dark"),
			{
				onDraftChange: (draft) => drafts.push(draft),
				onApply: vi.fn(),
				onCancel,
			},
		);
		const list = customizer.getSettingsList() as unknown as { onChange: (id: string, value: string) => void };
		list.onChange("section:tables", "raw");
		list.onChange("reset-section", "reset");
		expect(drafts.at(-1)?.markdown.tableStyle).toBe("ascii");
		expect(onCancel).not.toHaveBeenCalled();
		expect(writes).toHaveLength(0);
	});
});

describe("appearance customizer completion (plan 24% closure)", () => {
	let agentDir = "";
	const savedEnv = process.env[ENV_AGENT_DIR];

	beforeEach(() => {
		agentDir = mkdtempSync(join(tmpdir(), "ice-customizer-"));
		process.env[ENV_AGENT_DIR] = agentDir;
		initTheme("dark");
	});

	afterEach(() => {
		if (savedEnv === undefined) delete process.env[ENV_AGENT_DIR];
		else process.env[ENV_AGENT_DIR] = savedEnv;
		rmSync(agentDir, { recursive: true, force: true });
	});

	function createFullManager(initial: unknown = undefined): {
		manager: SettingsManager;
		writes: { appearance: unknown[]; themeSettings: unknown[] };
	} {
		const writes: { appearance: unknown[]; themeSettings: unknown[] } = { appearance: [], themeSettings: [] };
		let appearance = initial;
		let themeSetting: string | undefined;
		const manager = {
			getAppearanceSettings: () => validateAppearance(appearance).appearance,
			getAppearanceThemeSetting: () => parseAppearanceThemeSetting(themeSetting),
			setAppearanceThemeSetting: (setting: { mode: string; theme?: string; light?: string; dark?: string }) => {
				themeSetting = setting.mode === "fixed" ? (setting.theme ?? "dark") : `${setting.light}/${setting.dark}`;
				writes.themeSettings.push(JSON.parse(JSON.stringify(setting)));
			},
			setAppearanceSettings: (next: unknown) => {
				const validated = validateAppearance(next);
				if (!validated.valid) return validated;
				appearance = structuredClone(validated.appearance);
				writes.appearance.push(structuredClone(validated.appearance));
				return validated;
			},
		} as unknown as SettingsManager;
		return { manager, writes };
	}

	function open(session: CustomizationDraftSession) {
		const controllerDrafts: AppearanceSettingsV2[] = [];
		const customizer = new AppearanceCustomizerComponent(session, {
			onDraftChange: (draft) => controllerDrafts.push(draft),
			onApply: vi.fn(),
			onCancel: vi.fn(),
		});
		return { customizer, controllerDrafts };
	}

	test("theme editor supports automatic light/dark mode with preview side", () => {
		const { manager } = createFullManager();
		const controller = new InteractiveAppearanceController(manager);
		controller.beginPreview();
		const session = new CustomizationDraftSession(manager, controller, "dark", "dark");
		const { customizer } = open(session);
		const h = customizer as unknown as {
			handleThemeChange: (id: string, value: string) => void;
		};
		h.handleThemeChange("theme.mode", "automatic");
		expect(session.getThemeSetting()).toEqual({ mode: "automatic", light: "dark", dark: "dark" });
		h.handleThemeChange("theme.light", "light");
		h.handleThemeChange("theme.dark", "dark");
		expect(session.getThemeSetting()).toEqual({ mode: "automatic", light: "light", dark: "dark" });
		h.handleThemeChange("theme.previewSide", "light");
		expect(session.getSelectedTheme()).toBe("light");
		h.handleThemeChange("theme.previewSide", "dark");
		expect(session.getSelectedTheme()).toBe("dark");
		// Root item summary reflects the pair.
		const items = (
			customizer as unknown as { buildItems: () => { id: string; currentValue: string }[] }
		).buildItems();
		expect(items.find((item) => item.id === "section:theme")?.currentValue).toBe("auto light/dark");
		// Back to fixed collapses onto the previewed member.
		h.handleThemeChange("theme.mode", "fixed");
		expect(session.getThemeSetting()).toEqual({ mode: "fixed", theme: "dark" });
	});

	test("automatic theme setting round-trips through apply", () => {
		const { manager, writes } = createFullManager();
		const controller = new InteractiveAppearanceController(manager);
		controller.beginPreview();
		const session = new CustomizationDraftSession(manager, controller, "dark", "dark");
		const { customizer } = open(session);
		(customizer as unknown as { handleThemeChange: (id: string, value: string) => void }).handleThemeChange(
			"theme.mode",
			"automatic",
		);
		const result = session.apply();
		expect(result.success).toBe(true);
		expect(result.selectedTheme).toBe("dark");
		expect(writes.themeSettings.at(-1)).toEqual({ mode: "automatic", light: "dark", dark: "dark" });
	});

	test("theme import collision resolves via rename, replace, or cancel", () => {
		const { manager } = createFullManager();
		const controller = new InteractiveAppearanceController(manager);
		controller.beginPreview();
		const session = new CustomizationDraftSession(manager, controller, "dark", "dark");
		const { customizer } = open(session);
		const h = customizer as unknown as {
			handleThemeChange: (id: string, value: string) => void;
			pendingThemeImport: { name: string; json: string } | null;
			themeError: string | null;
			themeDraft: ThemeDraftSession;
		};
		// Create a disk custom theme named "mine" for collision paths.
		expect(cloneTheme("dark", "mine")).toEqual({ success: true });
		const payload = JSON.stringify({ ...h.themeDraft.getThemeData("dark"), name: "mine" });
		h.handleThemeChange("theme.importJson", payload);
		expect(h.pendingThemeImport?.name).toBe("mine");
		// Cancel keeps the disk theme untouched and clears the pending import.
		h.handleThemeChange("theme.importResolve", "cancel");
		expect(h.pendingThemeImport).toBeNull();
		// Replace is rejected for built-ins...
		const builtinPayload = JSON.stringify({ ...h.themeDraft.getThemeData("dark"), name: "dark" });
		h.handleThemeChange("theme.importJson", builtinPayload);
		h.handleThemeChange("theme.importResolve", "replace");
		expect(h.themeError).toContain("cannot be replaced");
		h.pendingThemeImport = null;
		// ...and stages an overwrite for custom themes.
		h.handleThemeChange("theme.importJson", payload);
		h.handleThemeChange("theme.importResolve", "replace");
		expect(h.pendingThemeImport).toBeNull();
		expect(h.themeDraft.getThemeData("mine")).toBeDefined();
		// Rename incoming imports under a new name.
		h.handleThemeChange("theme.importJson", payload);
		h.handleThemeChange("theme.importRename", "renamed-incoming");
		expect(h.pendingThemeImport).toBeNull();
		expect(h.themeDraft.listThemes()).toContain("renamed-incoming");
	});

	test("dirty markers appear on modified sections and clear on reset", () => {
		const { manager } = createFullManager();
		const controller = new InteractiveAppearanceController(manager);
		controller.beginPreview();
		const session = new CustomizationDraftSession(manager, controller, "dark", "dark");
		const { customizer } = open(session);
		const h = customizer as unknown as {
			handleFieldChange: (id: string, value: string) => void;
			buildItems: () => { id: string; label: string }[];
		};
		expect(h.buildItems().find((item) => item.id === "section:markdown")?.label).toBe("Markdown");
		h.handleFieldChange("markdown.tableStyle", "ascii");
		expect(h.buildItems().find((item) => item.id === "section:markdown")?.label).toBe("Markdown *");
		h.handleFieldChange("reset:markdown", "reset");
		expect(h.buildItems().find((item) => item.id === "section:markdown")?.label).toBe("Markdown");
		expect(session.isSectionDirty("markdown")).toBe(false);
	});

	test("color editor value forms round-trip through field changes", () => {
		const { manager } = createFullManager();
		const controller = new InteractiveAppearanceController(manager);
		controller.beginPreview();
		const session = new CustomizationDraftSession(manager, controller, "dark", "dark");
		const { customizer, controllerDrafts } = open(session);
		const h = customizer as unknown as { handleFieldChange: (id: string, value: string) => void };
		h.handleFieldChange("userMessage.foreground", "custom:rgb(1, 2, 3)");
		expect(session.getAppearance().userMessage.foreground).toEqual({ kind: "custom", value: "rgb(1, 2, 3)" });
		h.handleFieldChange("userMessage.foreground", "custom:hsl(120, 50%, 50%)");
		expect(session.getAppearance().userMessage.foreground).toEqual({ kind: "custom", value: "hsl(120, 50%, 50%)" });
		h.handleFieldChange("userMessage.foreground", "theme:accent");
		expect(session.getAppearance().userMessage.foreground).toEqual({ kind: "theme", token: "accent" });
		expect(controllerDrafts.length).toBeGreaterThan(0);
	});

	test("preview scene switches without discarding the draft", () => {
		const { manager } = createFullManager();
		const controller = new InteractiveAppearanceController(manager);
		controller.beginPreview();
		const session = new CustomizationDraftSession(manager, controller, "dark", "dark");
		const { customizer } = open(session);
		const list = customizer.getSettingsList() as unknown as { onChange: (id: string, value: string) => void };
		list.onChange("preview.scene", "tools");
		const preview = (customizer as unknown as { preview: { getScene: () => string } }).preview;
		expect(preview.getScene()).toBe("tools");
	});

	test("profiles store description and can be appearance-only", () => {
		const { manager } = createFullManager();
		const controller = new InteractiveAppearanceController(manager);
		controller.beginPreview();
		const session = new CustomizationDraftSession(manager, controller, "dark", "dark");
		const { customizer } = open(session);
		const h = customizer as unknown as { handleFieldChange: (id: string, value: string) => void };
		h.handleFieldChange("profiles.includeTheme", "false");
		h.handleFieldChange("profiles.description", "my custom look");
		h.handleFieldChange("profiles.saveAs", "prof1");
		const profile = session.getProfileDraft().get("prof1");
		expect(profile?.description).toBe("my custom look");
		expect(profile?.themeSetting).toBeUndefined();
		expect(profile?.appearance?.version).toBe(2);
		// Include-theme stores the current typed setting.
		h.handleFieldChange("profiles.includeTheme", "true");
		h.handleFieldChange("profiles.description", "with theme");
		h.handleFieldChange("profiles.saveAs", "prof2");
		const withTheme = session.getProfileDraft().get("prof2");
		expect(withTheme?.themeSetting).toEqual({ mode: "fixed", theme: "dark" });
	});

	test("loading a profile with an automatic pair stages both members", () => {
		const { manager } = createFullManager();
		const controller = new InteractiveAppearanceController(manager);
		controller.beginPreview();
		const session = new CustomizationDraftSession(manager, controller, "dark", "dark");
		const { customizer } = open(session);
		const result = session.getProfileDraft().save(
			{
				version: 2,
				name: "auto-profile",
				themeSetting: { mode: "automatic", light: "light", dark: "dark" },
				appearance: { ...createDefaultAppearance(), version: 2 },
			},
			{ replace: true },
		);
		expect(result.success).toBe(true);
		const h = customizer as unknown as { handleFieldChange: (id: string, value: string) => void };
		h.handleFieldChange("profiles.apply:auto-profile", "preview");
		expect(session.getThemeSetting()).toEqual({ mode: "automatic", light: "light", dark: "dark" });
	});

	test("bundle import shows a preview and stages collision resolutions", () => {
		const { manager } = createFullManager();
		const controller = new InteractiveAppearanceController(manager);
		controller.beginPreview();
		const session = new CustomizationDraftSession(manager, controller, "dark", "dark");
		const { customizer } = open(session);
		const h = customizer as unknown as {
			handleFieldChange: (id: string, value: string) => void;
			pendingBundleImport: {
				themeCollisions: Array<{ name: string; replaceable: boolean }>;
				profileCollisions: string[];
			} | null;
		};
		// Create a disk custom theme + profile that collide with the bundle.
		expect(cloneTheme("dark", "dup")).toEqual({ success: true });
		expect(
			saveProfile({ version: 2, name: "p1", appearance: { ...createDefaultAppearance(), version: 2 } }, false)
				.success,
		).toBe(true);
		const dupTheme = JSON.parse(JSON.stringify(session.getThemeDraft().getThemeData("dup"))) as Record<
			string,
			unknown
		>;
		dupTheme.name = "dup";
		const bundle = {
			version: 2,
			name: "test-bundle",
			themes: [dupTheme],
			profiles: [
				{
					version: 2,
					name: "p1",
					appearance: { version: 2, markdown: { tableStyle: "ascii" } },
				},
			],
			appearance: { version: 2, markdown: { tableStyle: "ascii" } },
		};
		h.handleFieldChange("bundle.import", JSON.stringify(bundle));
		// "dup" is a custom theme on disk, so the collision is replaceable.
		expect(h.pendingBundleImport?.themeCollisions).toEqual([{ name: "dup", replaceable: true }]);
		expect(h.pendingBundleImport?.profileCollisions).toEqual(["p1"]);
		// Built-in collisions are never replaceable.
		const builtinBundle = JSON.parse(JSON.stringify(bundle)) as typeof bundle;
		builtinBundle.themes = [
			JSON.parse(JSON.stringify(session.getThemeDraft().getThemeData("dark"))) as Record<string, unknown>,
		];
		h.handleFieldChange("bundle.import", JSON.stringify(builtinBundle));
		expect(h.pendingBundleImport?.themeCollisions).toEqual([{ name: "dark", replaceable: false }]);
		h.handleFieldChange("bundle.importConfirm", "cancel");
		// Resolve collisions explicitly, then stage.
		h.handleFieldChange("bundle.import", JSON.stringify(bundle));
		h.handleFieldChange("bundle.themeCollision:dup", "replace");
		h.handleFieldChange("bundle.profileCollision:p1", "replace");
		h.handleFieldChange("bundle.importConfirm", "stage");
		expect(h.pendingBundleImport).toBeNull();
		expect(session.getProfileDraft().exists("p1")).toBe(true);
		expect(session.getAppearance().markdown.tableStyle).toBe("ascii");
		// Cancel clears the pending import without staging.
		h.handleFieldChange("bundle.import", JSON.stringify(bundle));
		h.handleFieldChange("bundle.importConfirm", "cancel");
		expect(h.pendingBundleImport).toBeNull();
	});

	test("export bundle includes metadata and typed theme setting", () => {
		const { manager } = createFullManager();
		const controller = new InteractiveAppearanceController(manager);
		controller.beginPreview();
		const session = new CustomizationDraftSession(manager, controller, "dark", "dark");
		const { customizer } = open(session);
		const h = customizer as unknown as { handleFieldChange: (id: string, value: string) => void };
		h.handleFieldChange("bundle.name", "my-bundle");
		h.handleFieldChange("bundle.author", "me");
		const json = (customizer as unknown as { bundleJson: () => string }).bundleJson();
		const parsed = JSON.parse(json) as {
			name: string;
			author?: string;
			themeSetting?: { mode: string };
			profiles?: unknown[];
		};
		expect(parsed.name).toBe("my-bundle");
		expect(parsed.author).toBe("me");
		expect(parsed.themeSetting).toEqual({ mode: "fixed", theme: "dark" });
	});

	test("highlighter rules expose case sensitivity toggles", () => {
		const { manager } = createFullManager();
		const controller = new InteractiveAppearanceController(manager);
		controller.beginPreview();
		const session = new CustomizationDraftSession(manager, controller, "dark", "dark");
		const { customizer } = open(session);
		const h = customizer as unknown as { handleFieldChange: (id: string, value: string) => void };
		h.handleFieldChange("highlighters.addCustom", "TODO");
		const id = session.getAppearance().inputHighlighters[0]?.id;
		expect(id).toBeDefined();
		expect(session.getAppearance().inputHighlighters[0]?.matcher.caseSensitive).toBe(true);
		h.handleFieldChange(`highlighters.case:${id}`, "false");
		expect(session.getAppearance().inputHighlighters[0]?.matcher.caseSensitive).toBe(false);
	});

	test("status indicator labels expose color editing", () => {
		const { manager } = createFullManager();
		const controller = new InteractiveAppearanceController(manager);
		controller.beginPreview();
		const session = new CustomizationDraftSession(manager, controller, "dark", "dark");
		const { customizer } = open(session);
		const h = customizer as unknown as { handleFieldChange: (id: string, value: string) => void };
		h.handleFieldChange("statusIndicators.working.label.foreground", "theme:warning");
		expect(session.getAppearance().statusIndicators.working.label.foreground).toEqual({
			kind: "theme",
			token: "warning",
		});
	});

	test("theme editor navigates token groups instead of one flat token list", () => {
		const { manager } = createFullManager();
		const controller = new InteractiveAppearanceController(manager);
		controller.beginPreview();
		const session = new CustomizationDraftSession(manager, controller, "dark", "dark");
		const { customizer } = open(session);
		const h = customizer as unknown as {
			themeEditor: (done: (v?: string) => void) => { render: (width: number) => string[] };
			themeTokenGroupRows: (group: string) => { id: string }[];
			themeVariableRows: () => { id: string }[];
		};
		const rendered = h
			.themeEditor(() => {})
			.render(80)
			.join("\n");
		for (const group of ["Core", "Messages", "Tools", "Markdown", "Diff", "Syntax", "Thinking levels", "Variables"]) {
			expect(rendered).toContain(group);
		}
		// Group screens only expose their own tokens.
		const coreRows = h.themeTokenGroupRows("Core").map((row) => row.id);
		expect(coreRows).toContain("theme.token:accent");
		expect(coreRows).not.toContain("theme.token:syntaxKeyword");
		expect(coreRows.some((id) => id.startsWith("theme.token:"))).toBe(true);
		const syntaxRows = h.themeTokenGroupRows("Syntax").map((row) => row.id);
		expect(syntaxRows).toContain("theme.token:syntaxKeyword");
		expect(syntaxRows).not.toContain("theme.token:accent");
		// Variable screen offers creation plus per-variable rename/delete.
		const varRows = h.themeVariableRows().map((row) => row.id);
		expect(varRows).toContain("theme.varAdd");
	});
});

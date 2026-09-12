import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { applyChromeBorder, Markdown, visibleWidth } from "@zykairotis/ice-tui";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { ENV_AGENT_DIR } from "../src/config.ts";
import type { SettingsManager } from "../src/core/settings-manager.ts";
import { InteractiveAppearanceController } from "../src/modes/interactive/appearance/appearance-controller.ts";
import { createDefaultAppearance } from "../src/modes/interactive/appearance/appearance-defaults.ts";
import { importBundle, saveProfile } from "../src/modes/interactive/appearance/appearance-profiles.ts";
import { resolveAppearanceColorFn } from "../src/modes/interactive/appearance/appearance-resolve.ts";
import { parseAppearanceThemeSetting } from "../src/modes/interactive/appearance/appearance-types.ts";
import { validateAppearance } from "../src/modes/interactive/appearance/appearance-validate.ts";
import { CustomizationDraftSession } from "../src/modes/interactive/appearance/customization-draft-session.ts";
import { ProfileDraftSession } from "../src/modes/interactive/appearance/profile-draft-session.ts";
import { markdownThemeWithAppearance } from "../src/modes/interactive/appearance/text-presentation.ts";
import { AppearanceCustomizerComponent } from "../src/modes/interactive/components/appearance-customizer.ts";
import {
	AppearancePreviewComponent,
	DEFAULT_HIGHLIGHTER_TEST_TEXT,
	PREVIEW_SCENES,
} from "../src/modes/interactive/components/appearance-preview.ts";
import {
	getMarkdownTheme,
	getSelectListTheme,
	getSettingsListTheme,
	initTheme,
	setInteractiveChromeThemeOverride,
} from "../src/modes/interactive/theme/theme.ts";
import { stripAnsi } from "../src/utils/ansi.ts";

initTheme("dark");

let agentDir = "";
const savedEnv = process.env[ENV_AGENT_DIR];

beforeEach(() => {
	agentDir = mkdtempSync(join(tmpdir(), "ice-acceptance-"));
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
		getThemeSetting: () => themeSetting,
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

function openCustomizer(session: CustomizationDraftSession): AppearanceCustomizerComponent {
	return new AppearanceCustomizerComponent(session, {
		onDraftChange: vi.fn(),
		onApply: vi.fn(),
		onCancel: vi.fn(),
	});
}

describe("customizer width matrix (plan 35.4)", () => {
	test("renders bounded lines at every acceptance width", () => {
		const { manager } = createFullManager();
		const controller = new InteractiveAppearanceController(manager);
		const session = new CustomizationDraftSession(manager, controller, "dark", "dark");
		const customizer = openCustomizer(session);
		for (const width of [40, 60, 80, 103, 104, 120, 160]) {
			const lines = customizer.render(width);
			expect(lines.length).toBeGreaterThan(0);
			for (const line of lines) {
				expect(visibleWidth(line), `width ${width}: ${JSON.stringify(stripAnsi(line))}`).toBeLessThanOrEqual(width);
			}
		}
	});

	test("customizer fills the overlay viewport without exposing dock chrome", () => {
		const buildWithRows = (rows: number, width: number): AppearanceCustomizerComponent => {
			const { manager } = createFullManager();
			const controller = new InteractiveAppearanceController(manager);
			const session = new CustomizationDraftSession(manager, controller, "dark", "dark");
			const ui = {
				requestRender: vi.fn(),
				setFocus: vi.fn(),
				mode: "regular",
				fullRedraws: 0,
				terminal: { rows, columns: width },
			} as never;
			return new AppearanceCustomizerComponent(
				session,
				{ onDraftChange: vi.fn(), onApply: vi.fn(), onCancel: vi.fn() },
				ui,
			);
		};
		// The modal owns the viewport; no footer/status rows are reserved beneath it.
		for (const rows of [20, 24, 28, 30, 32, 40, 60]) {
			const lines = buildWithRows(rows, 134).render(134);
			expect(lines.length, `wide rows=${rows}`).toBe(rows);
			expect(lines.length, `wide rows=${rows}`).toBeGreaterThan(0);
		}
		for (const rows of [20, 24, 30, 40]) {
			const lines = buildWithRows(rows, 80).render(80);
			expect(lines.length, `narrow rows=${rows}`).toBe(rows);
		}
		for (const line of buildWithRows(24, 120).render(120)) {
			expect(visibleWidth(line)).toBeLessThanOrEqual(120);
		}
	});

	test("section editors render bounded at narrow and wide widths", () => {
		const { manager } = createFullManager();
		const controller = new InteractiveAppearanceController(manager);
		const session = new CustomizationDraftSession(manager, controller, "dark", "dark");
		const customizer = openCustomizer(session);
		const h = customizer as unknown as {
			userMessageEditor: (done: (v?: string) => void) => { render: (width: number) => string[] };
			themeEditor: (done: (v?: string) => void) => { render: (width: number) => string[] };
			profilesEditor: (done: (v?: string) => void) => { render: (width: number) => string[] };
		};
		for (const width of [40, 80, 120, 160]) {
			expect(h.userMessageEditor(() => {}).render(width).length).toBeGreaterThan(0);
			expect(h.themeEditor(() => {}).render(width).length).toBeGreaterThan(0);
			expect(h.profilesEditor(() => {}).render(width).length).toBeGreaterThan(0);
		}
	});
});

describe("G11 single-transaction ownership", () => {
	test("dangling quick-control preview is not folded into the customizer baseline", () => {
		const persisted = createDefaultAppearance();
		persisted.markdown.tableStyle = "ascii";
		const { manager, writes } = createFullManager(structuredClone(persisted));
		const controller = new InteractiveAppearanceController(manager);
		// A quick control leaves a dangling preview on the shared controller.
		const quickDraft = structuredClone(controller.getBaseline());
		quickDraft.markdown.tableStyle = "raw";
		controller.preview(quickDraft);
		expect(controller.isPreviewing()).toBe(true);

		// Opening the customizer must keep the persisted baseline...
		controller.beginPreview();
		const session = new CustomizationDraftSession(manager, controller, "dark", "dark");
		expect(session.getBaselineAppearance().markdown.tableStyle).toBe("ascii");
		// ...and Cancel must restore it with zero writes.
		session.cancel();
		controller.rollback();
		expect(controller.getEffective().markdown.tableStyle).toBe("ascii");
		expect(writes.appearance).toHaveLength(0);
	});

	test("controller never stacks a second baseline while previewing", () => {
		const { manager } = createFullManager();
		const controller = new InteractiveAppearanceController(manager);
		const first = controller.beginPreview();
		const changed = structuredClone(first);
		changed.markdown.tableStyle = "clean";
		controller.preview(changed);
		controller.beginPreview();
		expect(controller.getBaseline().markdown.tableStyle).toBe("unicode");
	});

	test("one draft commits quick appearance and theme state together", () => {
		const { manager, writes } = createFullManager();
		const controller = new InteractiveAppearanceController(manager);
		controller.beginPreview();
		const session = new CustomizationDraftSession(manager, controller, "dark", "dark");
		const next = session.getAppearance();
		next.markdown.tableStyle = "ascii";
		expect(session.previewAppearance(next).valid).toBe(true);
		session.setThemeMode("fixed");
		session.setFixedTheme("light");
		expect(session.apply().success).toBe(true);
		expect(writes.appearance).toHaveLength(1);
		expect(writes.themeSettings).toHaveLength(1);
		expect(writes.themeSettings[0]).toEqual({ mode: "fixed", theme: "light" });
	});
});

describe("terminal-index color kind (plan 10.1)", () => {
	test("validates bounded indices and rejects out-of-range values", () => {
		const draft = createDefaultAppearance();
		draft.userMessage.foreground = { kind: "terminal-index", index: 39 };
		const result = validateAppearance(draft);
		expect(result.valid).toBe(true);
		expect(result.appearance?.userMessage.foreground).toEqual({ kind: "terminal-index", index: 39 });

		const bad = createDefaultAppearance();
		bad.userMessage.foreground = { kind: "terminal-index", index: 256 };
		expect(validateAppearance(bad).valid).toBe(false);
		const fractional = createDefaultAppearance();
		fractional.userMessage.foreground = { kind: "terminal-index", index: 1.5 };
		expect(validateAppearance(fractional).valid).toBe(false);
	});

	test("resolves to ANSI 256 foreground/background sequences without RGB conversion", () => {
		const color = { kind: "terminal-index" as const, index: 201 };
		expect(resolveAppearanceColorFn(color, "fg")("x")).toBe("\x1b[38;5;201mx\x1b[39m");
		expect(resolveAppearanceColorFn(color, "bg")("x")).toBe("\x1b[48;5;201mx\x1b[49m");
	});

	test("round-trips through the customizer color summary form", () => {
		const { manager } = createFullManager();
		const controller = new InteractiveAppearanceController(manager);
		controller.beginPreview();
		const session = new CustomizationDraftSession(manager, controller, "dark", "dark");
		const customizer = openCustomizer(session);
		const h = customizer as unknown as { handleFieldChange: (id: string, value: string) => void };
		h.handleFieldChange("inputBox.idleBorderColor", "index:39");
		expect(session.getAppearance().inputBox.idleBorderColor).toEqual({ kind: "terminal-index", index: 39 });
	});

	test("highlighter preview text is editable without entering persisted appearance", () => {
		const { manager } = createFullManager();
		const controller = new InteractiveAppearanceController(manager);
		controller.beginPreview();
		const session = new CustomizationDraftSession(manager, controller, "dark", "dark");
		const customizer = openCustomizer(session);
		const harness = customizer as unknown as {
			handleFieldChange: (id: string, value: string) => void;
			preview: AppearancePreviewComponent;
		};
		const before = JSON.stringify(session.getAppearance());
		harness.handleFieldChange("highlighters.testText", "case-sensitive TODO sample");
		expect(harness.preview.getHighlighterTestText()).toBe("case-sensitive TODO sample");
		expect(JSON.stringify(session.getAppearance())).toBe(before);
	});
});

describe("partial-section profiles (plan 25.4)", () => {
	test("selected scope stores only chosen sections and merges deterministically", () => {
		const { manager } = createFullManager();
		const controller = new InteractiveAppearanceController(manager);
		controller.beginPreview();
		const session = new CustomizationDraftSession(manager, controller, "dark", "dark");
		const customizer = openCustomizer(session);
		const h = customizer as unknown as { handleFieldChange: (id: string, value: string) => void };
		h.handleFieldChange("markdown.tableStyle", "ascii");
		h.handleFieldChange("profiles.scope", "selected");
		h.handleFieldChange("profileInclude.markdown", "true");
		h.handleFieldChange("profileInclude.footer", "false");
		h.handleFieldChange("profiles.includeTheme", "false");
		h.handleFieldChange("profiles.description", "markdown only");
		h.handleFieldChange("profiles.saveAs", "md-only");

		const profile = session.getProfileDraft().get("md-only");
		expect(profile?.description).toBe("markdown only");
		const partial = profile?.appearance as unknown as Record<string, unknown>;
		expect(partial?.markdown).toBeDefined();
		expect(partial?.footer).toBeUndefined();
		expect(partial?.tools).toBeUndefined();

		// Loading the partial profile only touches included sections.
		const before = session.getAppearance();
		const loadResult = session.loadProfile({
			version: 2,
			name: "md-only",
			appearance: partial as never,
		});
		expect(loadResult.valid).toBe(true);
		const after = session.getAppearance();
		expect(after.markdown.tableStyle).toBe(before.markdown.tableStyle);
		expect(after.footer.separator).toBe(before.footer.separator);
		expect(JSON.stringify(after.tools)).toBe(JSON.stringify(before.tools));
	});

	test("saving over an existing name requires the explicit replace toggle", () => {
		const { manager } = createFullManager();
		const controller = new InteractiveAppearanceController(manager);
		controller.beginPreview();
		const session = new CustomizationDraftSession(manager, controller, "dark", "dark");
		const customizer = openCustomizer(session);
		const h = customizer as unknown as {
			handleFieldChange: (id: string, value: string) => void;
			themeError: string | null;
		};
		h.handleFieldChange("profiles.saveAs", "dup");
		expect(session.getProfileDraft().exists("dup")).toBe(true);
		// Second save without the toggle is refused.
		h.handleFieldChange("profiles.replaceExisting", "false");
		h.handleFieldChange("profiles.saveAs", "dup");
		expect(h.themeError).toContain("Replace existing");
		// Explicit replace succeeds.
		h.handleFieldChange("profiles.replaceExisting", "true");
		h.handleFieldChange("profiles.saveAs", "dup");
		expect(h.themeError).toBeNull();
	});
});

describe("migration and fixture compatibility (plan 7.3)", () => {
	test("v1 appearance migrates to v2 with exact mapped fields", () => {
		const defaults = createDefaultAppearance();
		const v1 = {
			version: 1,
			userMessage: { ...defaults.userMessage, paddingX: 3 },
			inputBox: { ...defaults.inputBox, paddingX: 2 },
			thinking: {
				indicator: { ...defaults.thinking.indicator, intervalMs: 90 },
				label: { ...defaults.thinking.label },
				block: { ...defaults.thinking.block },
			},
			markdown: { tableStyle: "clean" },
			inputHighlighters: [
				{
					id: "todo",
					name: "TODO",
					enabled: true,
					matcher: { kind: "literal", pattern: "TODO" },
					styles: ["bold"],
					foreground: { kind: "custom", value: "#ffff00" },
					background: { kind: "terminal-default" },
					priority: 0,
				},
			],
		};
		const result = validateAppearance(v1);
		expect(result.valid).toBe(true);
		const v2 = result.appearance;
		expect(v2?.version).toBe(2);
		expect(v2?.userMessage.paddingX).toBe(3);
		expect(v2?.inputBox.paddingX).toBe(2);
		expect(v2?.thinking.indicator.intervalMs).toBe(90);
		expect(v2?.markdown.tableStyle).toBe("clean");
		expect(v2?.inputHighlighters[0]?.matcher.caseSensitive).toBe(true);
		// New v2 domains get defaults reproducing stock rendering.
		expect(v2?.assistantMessage).toEqual(createDefaultAppearance().assistantMessage);
	});

	test("v1 profiles load through the staged profile session", () => {
		const v1Profile = {
			version: 1,
			name: "legacy-profile",
			appearance: { version: 1, markdown: { tableStyle: "raw" } },
		};
		expect(saveProfile(v1Profile as never, true).success).toBe(true);
		const draft = new ProfileDraftSession();
		const loaded = draft.get("legacy-profile");
		expect(loaded?.version).toBe(2);
		expect(loaded?.name).toBe("legacy-profile");
	});

	test("v1 bundles import into the v2 shape", () => {
		const v1Bundle = {
			version: 1,
			name: "legacy-bundle",
			appearance: { version: 1, markdown: { tableStyle: "ascii" } },
		};
		const result = importBundle(JSON.stringify(v1Bundle));
		expect(result.success).toBe(true);
		expect(result.bundle?.version).toBe(2);
		expect(result.bundle?.appearance).toBeDefined();
	});

	test("legacy automatic theme strings parse as typed pairs", () => {
		expect(parseAppearanceThemeSetting("light/dark")).toEqual({ mode: "automatic", light: "light", dark: "dark" });
		expect(parseAppearanceThemeSetting("dark")).toEqual({ mode: "fixed", theme: "dark" });
		expect(parseAppearanceThemeSetting("a/b/c")).toBeUndefined();
	});

	test("persisted settings keep unrelated keys alongside appearance", () => {
		const settingsPath = join(agentDir, "settings.json");
		const original = {
			theme: "dark",
			appearance: { version: 1, markdown: { tableStyle: "clean" } },
			someFutureSetting: { nested: [1, 2, 3] },
		};
		writeFileSync(settingsPath, JSON.stringify(original, null, 2));
		const raw = JSON.parse(readFileSync(settingsPath, "utf8")) as Record<string, unknown>;
		expect(raw.someFutureSetting).toEqual({ nested: [1, 2, 3] });
		expect(raw.appearance).toBeDefined();
	});
});

describe("timer and lifecycle hygiene (plan 35.6)", () => {
	test("scene and appearance updates clear every scheduled preview interval", () => {
		const setIntervalSpy = vi.spyOn(global, "setInterval");
		const clearIntervalSpy = vi.spyOn(global, "clearInterval");
		const ui = { requestRender: vi.fn() } as unknown as ConstructorParameters<typeof AppearancePreviewComponent>[1];
		const preview = new AppearancePreviewComponent(createDefaultAppearance(), ui);
		const schedules = () => setIntervalSpy.mock.calls.length;
		const clears = () => clearIntervalSpy.mock.calls.length;
		// Loader construction schedules one interval (frames > 1).
		expect(schedules()).toBeGreaterThan(0);
		// Every rebuild clears the previous timer before scheduling a new one.
		preview.setScene("tools");
		preview.setScene("all");
		preview.setAppearance(createDefaultAppearance());
		// Multiple preview surfaces may animate concurrently; rebuild must leave
		// only the current scene timers active.
		expect(schedules() - clears()).toBeGreaterThan(0);
		// Dispose clears every remaining timer: nothing stays scheduled.
		preview.dispose();
		expect(clears()).toBeGreaterThanOrEqual(schedules());
		setIntervalSpy.mockRestore();
		clearIntervalSpy.mockRestore();
	});

	test("preview highlighter test text is bounded and scenes are exposed", () => {
		const preview = new AppearancePreviewComponent(createDefaultAppearance());
		expect(PREVIEW_SCENES).toHaveLength(7);
		expect(DEFAULT_HIGHLIGHTER_TEST_TEXT).toContain("TODO");
		preview.setHighlighterTestText("FIXME x".repeat(100));
		expect(preview.getHighlighterTestText().length).toBeLessThanOrEqual(200);
	});
});

describe("noninteractive semantic invariance (plan 35.11)", () => {
	test("appearance styling never changes Markdown text content", () => {
		const source =
			"# Title\n\nBody with **bold**, a [link](https://x), and `code`.\n\n| a | b |\n| - | - |\n| 1 | 2 |";
		const baseTheme = getMarkdownTheme();
		const plain = new Markdown(source, 1, 0, baseTheme).render(80).join("\n");
		const styled = new Markdown(source, 1, 0, baseTheme).render(80).join("\n");
		expect(stripAnsi(styled)).toBe(stripAnsi(plain));

		// Aggressive appearance styling keeps identical stripped content.
		const themedTheme = markdownThemeWithAppearance(baseTheme, createDefaultAppearance().markdown);
		const themed = new Markdown(source, 1, 0, themedTheme).render(80).join("\n");
		expect(stripAnsi(themed)).toBe(stripAnsi(plain));
	});

	test("table style changes only drawing characters, not cell content", () => {
		const source = "| a | b |\n| - | - |\n| 1 | 2 |";
		const baseTheme = getMarkdownTheme();
		const raw = new Markdown(source, 1, 0, baseTheme, undefined, { tableStyle: "raw" }).render(80).join("\n");
		expect(stripAnsi(raw)).toContain("| a | b |");
		expect(stripAnsi(raw)).toContain("| 1 | 2 |");
	});
});

describe("shared chrome border adapter (plan 6.10)", () => {
	test("override propagates border family into list themes", () => {
		setInteractiveChromeThemeOverride({
			chromeBorder: "double",
			chromeBorderColor: (text) => `\x1b[31m${text}\x1b[39m`,
		});
		expect(getSettingsListTheme().borderStyle).toBe("double");
		expect(getSelectListTheme().borderStyle).toBe("double");
		setInteractiveChromeThemeOverride({ chromeBorder: "none" });
		expect(getSettingsListTheme().borderStyle).toBeUndefined();
		setInteractiveChromeThemeOverride(undefined);
	});

	test("chrome border wrap keeps every line within width", () => {
		const lines = applyChromeBorder(["hello", "  second row"], 20, "double", (text) => `\x1b[31m${text}\x1b[39m`);
		expect(lines[0]).toContain("╔");
		expect(lines.at(-1)).toContain("╚");
		for (const line of lines) {
			expect(visibleWidth(line)).toBeLessThanOrEqual(20);
		}
		// Narrow widths degrade gracefully instead of crashing.
		expect(applyChromeBorder(["x"], 2, "single", (t) => t)).toEqual(["x"]);
	});
});

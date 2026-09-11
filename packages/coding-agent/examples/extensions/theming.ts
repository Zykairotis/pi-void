/**
 * Theme editor in `/settings` (Theming) and `/theming`.
 *
 * Dropdowns preview as you move. Enter keeps the choice. Esc restores the
 * previous value. Color edits save to ~/.ice/agent/themes/user.json.
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { ExtensionAPI, ExtensionContext, ExtensionUIContext } from "@zykairotis/ice-coding-agent";
import { getAgentDir, getSelectListTheme, getSettingsListTheme } from "@zykairotis/ice-coding-agent";
import {
	type Component,
	Container,
	getKeybindings,
	Input,
	type SelectItem,
	SelectList,
	type SettingItem,
	SettingsList,
	Spacer,
	Text,
} from "@zykairotis/ice-tui";

const USER_THEME = "user";
const SCHEMA =
	"https://raw.githubusercontent.com/Zykairotis/ice/void/packages/coding-agent/src/modes/interactive/theme/theme-schema.json";

const PALETTE: { id: string; hex: string }[] = [
	{ id: "default", hex: "" },
	{ id: "cyan", hex: "#00ffff" },
	{ id: "teal", hex: "#2ee6d6" },
	{ id: "blue", hex: "#4da3ff" },
	{ id: "indigo", hex: "#6b7cff" },
	{ id: "purple", hex: "#8c1eff" },
	{ id: "violet", hex: "#b44aff" },
	{ id: "gold", hex: "#ffd319" },
	{ id: "orange", hex: "#ff901f" },
	{ id: "coral", hex: "#ff5c4d" },
	{ id: "red", hex: "#ff3b3b" },
	{ id: "green", hex: "#3dff8a" },
	{ id: "mint", hex: "#7dffa3" },
	{ id: "chrome", hex: "#c0c0c8" },
	{ id: "silver", hex: "#8b8b95" },
	{ id: "white", hex: "#f2f2f7" },
	{ id: "navy", hex: "#1a0e2e" },
	{ id: "black", hex: "#0c0c0c" },
];

const GROUPS: { id: string; label: string; keys: string[] }[] = [
	{
		id: "core",
		label: "Core UI",
		keys: ["accent", "border", "borderAccent", "borderMuted", "success", "error", "warning", "muted", "dim", "text"],
	},
	{
		id: "content",
		label: "Messages & tools",
		keys: [
			"thinkingText",
			"selectedBg",
			"scrollbarThumb",
			"userMessageBg",
			"userMessageText",
			"customMessageBg",
			"customMessageText",
			"customMessageLabel",
			"toolPendingBg",
			"toolSuccessBg",
			"toolErrorBg",
			"toolTitle",
			"toolOutput",
		],
	},
	{
		id: "markdown",
		label: "Markdown",
		keys: [
			"mdHeading",
			"mdLink",
			"mdLinkUrl",
			"mdCode",
			"mdCodeBlock",
			"mdCodeBlockBorder",
			"mdQuote",
			"mdQuoteBorder",
			"mdHr",
			"mdListBullet",
		],
	},
	{
		id: "diff",
		label: "Diffs",
		keys: ["toolDiffAdded", "toolDiffRemoved", "toolDiffContext"],
	},
	{
		id: "syntax",
		label: "Syntax",
		keys: [
			"syntaxComment",
			"syntaxKeyword",
			"syntaxFunction",
			"syntaxVariable",
			"syntaxString",
			"syntaxNumber",
			"syntaxType",
			"syntaxOperator",
			"syntaxPunctuation",
		],
	},
	{
		id: "thinking",
		label: "Thinking & bash",
		keys: [
			"thinkingOff",
			"thinkingMinimal",
			"thinkingLow",
			"thinkingMedium",
			"thinkingHigh",
			"thinkingXhigh",
			"thinkingMax",
			"thinkingUltra",
			"bashMode",
		],
	},
];

interface ThemeFile {
	$schema?: string;
	name: string;
	vars?: Record<string, string | number>;
	colors: Record<string, string | number>;
	export?: { pageBg?: string | number; cardBg?: string | number; infoBg?: string | number };
}

interface ThemingState {
	baseTheme: string;
}

function themesDir(): string {
	return join(getAgentDir(), "themes");
}

function userThemePath(): string {
	return join(themesDir(), `${USER_THEME}.json`);
}

function statePath(): string {
	return join(getAgentDir(), "theming.json");
}

function readState(): ThemingState {
	try {
		const parsed: unknown = JSON.parse(readFileSync(statePath(), "utf8"));
		if (typeof parsed === "object" && parsed !== null && !Array.isArray(parsed)) {
			const baseTheme = (parsed as { baseTheme?: unknown }).baseTheme;
			if (typeof baseTheme === "string" && baseTheme.length > 0) return { baseTheme };
		}
	} catch {
		// missing or invalid
	}
	return { baseTheme: "dark" };
}

function writeState(state: ThemingState): void {
	mkdirSync(getAgentDir(), { recursive: true });
	writeFileSync(statePath(), `${JSON.stringify(state, undefined, "\t")}\n`);
}

function parseThemeFile(raw: string, label: string): ThemeFile {
	const parsed: unknown = JSON.parse(raw);
	if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
		throw new Error(`Theme ${label} is not an object`);
	}
	const record = parsed as Record<string, unknown>;
	if (typeof record.name !== "string" || typeof record.colors !== "object" || record.colors === null) {
		throw new Error(`Theme ${label} is missing name or colors`);
	}
	return parsed as ThemeFile;
}

function loadThemeFromPath(path: string): ThemeFile {
	return parseThemeFile(readFileSync(path, "utf8"), path);
}

function currentThemeName(ui: ExtensionUIContext): string {
	return ui.theme.name && ui.theme.name !== "<in-memory>" ? ui.theme.name : readState().baseTheme;
}

function findThemePath(ui: ExtensionUIContext, name: string): string | undefined {
	return ui.getAllThemes().find((entry) => entry.name === name)?.path;
}

function loadNamedTheme(ui: ExtensionUIContext, name: string): ThemeFile {
	const path = findThemePath(ui, name);
	if (path && existsSync(path)) return loadThemeFromPath(path);
	if (name === USER_THEME && existsSync(userThemePath())) return loadThemeFromPath(userThemePath());
	throw new Error(`Theme not found: ${name}`);
}

function resolveToken(themeFile: ThemeFile, value: string | number | undefined): string {
	if (value === undefined) return "";
	if (typeof value === "number") return String(value);
	if (value === "" || value.startsWith("#")) return value;
	const vars = themeFile.vars ?? {};
	const next = vars[value];
	if (next === undefined) return value;
	if (typeof next === "number") return String(next);
	if (next === "" || next.startsWith("#")) return next;
	return next;
}

function rgb(hex: string): { r: number; g: number; b: number } | undefined {
	if (!hex.startsWith("#") || hex.length !== 7) return undefined;
	const r = Number.parseInt(hex.slice(1, 3), 16);
	const g = Number.parseInt(hex.slice(3, 5), 16);
	const b = Number.parseInt(hex.slice(5, 7), 16);
	if ([r, g, b].some((channel) => Number.isNaN(channel))) return undefined;
	return { r, g, b };
}

function swatch(value: string): string {
	const channels = rgb(value);
	if (!channels) return "  ";
	return `\x1b[38;2;${channels.r};${channels.g};${channels.b}m██\x1b[39m`;
}

function paint(value: string, text: string): string {
	const channels = rgb(value);
	if (!channels) return text;
	return `\x1b[38;2;${channels.r};${channels.g};${channels.b}m${text}\x1b[39m`;
}

function normalizeHex(raw: string): string | undefined {
	const trimmed = raw.trim();
	if (trimmed === "") return "";
	const match = trimmed.match(/^#?([0-9a-fA-F]{6})$/);
	if (!match) return undefined;
	return `#${match[1].toLowerCase()}`;
}

function writeUserTheme(themeFile: ThemeFile): void {
	mkdirSync(themesDir(), { recursive: true });
	const payload: ThemeFile = {
		$schema: SCHEMA,
		name: USER_THEME,
		vars: themeFile.vars,
		colors: themeFile.colors,
		export: themeFile.export,
	};
	writeFileSync(userThemePath(), `${JSON.stringify(payload, undefined, "\t")}\n`);
}

function ensureUserTheme(ui: ExtensionUIContext): ThemeFile {
	const active = currentThemeName(ui);
	if (active === USER_THEME && existsSync(userThemePath())) {
		return loadThemeFromPath(userThemePath());
	}
	const sourceName = active === USER_THEME ? readState().baseTheme : active;
	const cloned = structuredClone(loadNamedTheme(ui, sourceName));
	writeState({ baseTheme: sourceName });
	writeUserTheme(cloned);
	const applied = ui.setTheme(USER_THEME);
	if (!applied.success) {
		ui.notify(applied.error ?? "Could not switch to user theme", "error");
	}
	return loadThemeFromPath(userThemePath());
}

function applyColor(ui: ExtensionUIContext, key: string, value: string, quiet: boolean): void {
	const themeFile = ensureUserTheme(ui);
	themeFile.colors[key] = value;
	writeUserTheme(themeFile);
	const applied = ui.setTheme(USER_THEME);
	if (!applied.success) {
		ui.notify(applied.error ?? "Could not apply color", "error");
		return;
	}
	if (!quiet) ui.notify(`${key} → ${value || "default"}`, "info");
}

function themePreview(ui: ExtensionUIContext, name: string): string {
	try {
		const file = loadNamedTheme(ui, name);
		const accent = resolveToken(file, file.colors.accent);
		const success = resolveToken(file, file.colors.success);
		const warning = resolveToken(file, file.colors.warning);
		const error = resolveToken(file, file.colors.error);
		return `${swatch(accent)} ${swatch(success)} ${swatch(warning)} ${swatch(error)}`;
	} catch {
		return "";
	}
}

class HexEditor implements Component {
	private readonly ui: ExtensionUIContext;
	private readonly label: string;
	private readonly onDone: (value?: string) => void;
	private readonly input = new Input();
	private error: string | undefined;

	constructor(ui: ExtensionUIContext, label: string, current: string, onDone: (value?: string) => void) {
		this.ui = ui;
		this.label = label;
		this.onDone = onDone;
		this.input.setValue(current);
		this.input.focused = true;
		this.input.onSubmit = (value) => {
			const normalized = normalizeHex(value);
			if (normalized === undefined) {
				this.error = "Use #rrggbb or leave empty for terminal default";
				return;
			}
			this.onDone(normalized);
		};
		this.input.onEscape = () => this.onDone();
	}

	invalidate(): void {}

	handleInput(data: string): void {
		this.error = undefined;
		this.input.handleInput(data);
	}

	render(width: number): string[] {
		const t = this.ui.theme;
		const lines = [
			t.bold(t.fg("accent", this.label)),
			"",
			t.fg("muted", "Hex color (#rrggbb). Empty uses the terminal default."),
			"",
			...this.input.render(width),
			"",
		];
		if (this.error) lines.push(t.fg("error", this.error), "");
		lines.push(t.fg("dim", "  Enter to apply · Esc to cancel"));
		return lines;
	}
}

class PreviewSelect extends Container {
	constructor(
		ui: ExtensionUIContext,
		title: string,
		hint: string,
		items: SelectItem[],
		currentValue: string,
		onPreview: (value: string) => void,
		onSelect: (value: string) => void,
		onCancel: () => void,
	) {
		super();
		const t = ui.theme;
		this.addChild(new Text(t.bold(t.fg("accent", title)), 0, 0));
		this.addChild(new Spacer(1));
		this.addChild(new Text(t.fg("muted", hint), 0, 0));
		this.addChild(new Spacer(1));
		const list = new SelectList(items, Math.min(Math.max(items.length, 1), 12), getSelectListTheme(), {
			minPrimaryColumnWidth: 14,
			maxPrimaryColumnWidth: 28,
		});
		const currentIndex = items.findIndex((item) => item.value === currentValue);
		if (currentIndex >= 0) list.setSelectedIndex(currentIndex);
		list.onSelectionChange = (item) => onPreview(item.value);
		list.onSelect = (item) => onSelect(item.value);
		list.onCancel = () => onCancel();
		this.addChild(list);
		this.addChild(new Spacer(1));
		this.addChild(new Text(t.fg("dim", "  Move to preview · Enter to keep · Esc to restore"), 0, 0));
	}

	handleInput(data: string): void {
		for (const child of this.children) child.handleInput?.(data);
	}
}

class ColorGroupPanel extends Container {
	private readonly keys: string[];
	private readonly ui: ExtensionUIContext;
	private readonly onBack: () => void;
	private focus: { handleInput(data: string): void } | undefined;

	constructor(keys: string[], ui: ExtensionUIContext, onBack: () => void) {
		super();
		this.keys = keys;
		this.ui = ui;
		this.onBack = onBack;
		this.showList();
	}

	handleInput(data: string): void {
		this.focus?.handleInput(data);
	}

	private showList(): void {
		this.clear();
		let themeFile: ThemeFile;
		try {
			themeFile = ensureUserTheme(this.ui);
		} catch (error) {
			this.ui.notify(error instanceof Error ? error.message : String(error), "error");
			this.onBack();
			return;
		}
		const items: SettingItem[] = this.keys.map((key) => {
			const resolved = resolveToken(themeFile, themeFile.colors[key]);
			return {
				id: key,
				label: key,
				description: "Move through colors to preview. Enter keeps it.",
				currentValue: `${swatch(resolved)} ${paletteName(resolved)}`,
				submenu: (_current, finish) => this.createPalette(key, resolved, finish),
			};
		});
		const list = new SettingsList(
			items,
			Math.min(Math.max(items.length, 1), 12),
			getSettingsListTheme(),
			() => {},
			() => this.onBack(),
			{ enableSearch: true },
		);
		this.addChild(list);
		this.addChild(new Spacer(1));
		this.addChild(new Text(this.ui.theme.fg("dim", "  Enter for color dropdown · Esc to go back"), 0, 0));
		this.focus = list;
	}

	private createPalette(key: string, current: string, finish: (selectedValue?: string) => void): Component {
		const previous = current;
		const choices = paletteChoices(current);
		const items: SelectItem[] = [
			...choices.map((choice) => ({
				value: choice.hex,
				label: `${swatch(choice.hex)}  ${choice.id}`,
				description: choice.hex ? paint(choice.hex, `${key} sample`) : "terminal default",
			})),
			{
				value: "__custom__",
				label: "custom hex",
				description: "Type a #rrggbb value",
			},
		];
		return new PreviewSelect(
			this.ui,
			key,
			`${swatch(current)} ${current || "default"}  ·  preview applies immediately`,
			items,
			current,
			(value) => {
				if (value !== "__custom__") applyColor(this.ui, key, value, true);
			},
			(value) => {
				if (value === "__custom__") {
					finish();
					queueMicrotask(() => this.openHex(key, previous, finish));
					return;
				}
				applyColor(this.ui, key, value, false);
				finish(value);
				queueMicrotask(() => this.showList());
			},
			() => {
				applyColor(this.ui, key, previous, true);
				finish();
				queueMicrotask(() => this.showList());
			},
		);
	}

	private openHex(key: string, previous: string, finish: (selectedValue?: string) => void): void {
		this.clear();
		const editor = new HexEditor(this.ui, key, previous, (value) => {
			if (value === undefined) applyColor(this.ui, key, previous, true);
			else applyColor(this.ui, key, value, false);
			finish(value);
			this.showList();
		});
		this.addChild(editor);
		this.focus = editor;
	}
}

function paletteName(hex: string): string {
	const match = PALETTE.find((entry) => entry.hex === hex);
	if (match) return match.id;
	return hex || "default";
}

function paletteChoices(current: string): { id: string; hex: string }[] {
	if (PALETTE.some((entry) => entry.hex === current)) return PALETTE;
	return [{ id: "current", hex: current }, ...PALETTE];
}

class ThemingSubmenu extends Container {
	private readonly ui: ExtensionUIContext;
	private readonly onClose: (selectedValue?: string) => void;
	private focus: { handleInput(data: string): void } | undefined;

	constructor(ui: ExtensionUIContext, onClose: (selectedValue?: string) => void) {
		super();
		this.ui = ui;
		this.onClose = onClose;
		this.showHome();
	}

	handleInput(data: string): void {
		this.focus?.handleInput(data);
	}

	private showHome(): void {
		this.clear();
		const active = currentThemeName(this.ui);
		const t = this.ui.theme;
		this.addChild(new Text(t.bold(t.fg("accent", "Theming")), 0, 0));
		this.addChild(new Spacer(1));
		this.addChild(new Text(t.fg("muted", `Active: ${active}`), 0, 0));
		this.addChild(new Spacer(1));
		const items: SettingItem[] = [
			{
				id: "theme",
				label: "Theme",
				description: "Dropdown previews each theme as you move",
				currentValue: active,
				submenu: (_current, done) => this.createThemeDropdown(done),
			},
			...GROUPS.map((group) => ({
				id: group.id,
				label: group.label,
				description: `Dropdown preview for ${group.keys.length} colors`,
				currentValue: "edit",
				submenu: (_current: string, done: (selectedValue?: string) => void) =>
					new ColorGroupPanel(group.keys, this.ui, () => done()),
			})),
			{
				id: "reset",
				label: "Reset to base",
				description: "Switch back to the last loaded base theme",
				currentValue: readState().baseTheme,
				values: ["reset"],
			},
		];
		const list = new SettingsList(
			items,
			Math.min(items.length, 12),
			getSettingsListTheme(),
			(id) => {
				if (id === "reset") this.resetToBase();
			},
			() => this.onClose(currentThemeName(this.ui)),
			{ enableSearch: true },
		);
		this.addChild(list);
		this.addChild(new Spacer(1));
		this.addChild(new Text(this.ui.theme.fg("dim", "  Enter for dropdown · Esc to close"), 0, 0));
		this.focus = list;
	}

	private createThemeDropdown(done: (selectedValue?: string) => void): Component {
		const previous = currentThemeName(this.ui);
		const names = this.ui.getAllThemes().map((entry) => entry.name);
		const items: SelectItem[] = names.map((name) => ({
			value: name,
			label: name,
			description: themePreview(this.ui, name),
		}));
		return new PreviewSelect(
			this.ui,
			"Theme",
			"Move to preview the whole UI. Enter keeps it.",
			items,
			previous,
			(value) => {
				this.ui.setTheme(value);
			},
			(value) => {
				const applied = this.ui.setTheme(value);
				if (applied.success && value !== USER_THEME) writeState({ baseTheme: value });
				done(value);
				queueMicrotask(() => this.showHome());
			},
			() => {
				this.ui.setTheme(previous);
				done();
			},
		);
	}

	private resetToBase(): void {
		const base = readState().baseTheme;
		const applied = this.ui.setTheme(base);
		if (!applied.success) {
			this.ui.notify(applied.error ?? `Could not restore ${base}`, "error");
			return;
		}
		this.ui.notify(`Restored ${base}`, "info");
		this.showHome();
	}
}

class UnavailableTheming extends Container {
	private readonly onClose: () => void;

	constructor(onClose: () => void) {
		super();
		this.onClose = onClose;
	}

	handleInput(data: string): void {
		if (getKeybindings().matches(data, "tui.select.cancel")) this.onClose();
	}

	override render(_width: number): string[] {
		return ["Theming is unavailable until a session starts", "", "  Esc"];
	}
}

function createThemingSubmenu(ctx: ExtensionContext | undefined, done: (selectedValue?: string) => void): Component {
	if (!ctx) return new UnavailableTheming(() => done());
	return new ThemingSubmenu(ctx.ui, done);
}

export default function (ice: ExtensionAPI): void {
	let sessionCtx: ExtensionContext | undefined;
	ice.on("session_start", (_event, ctx) => {
		sessionCtx = ctx;
	});
	ice.on("session_shutdown", () => {
		sessionCtx = undefined;
	});

	ice.registerSettings("theming", {
		items: [
			{
				id: "theming",
				label: "Theming",
				description: "Preview themes and colors in a dropdown. Saves custom colors to user.json",
				currentValue: "edit",
				submenu: (_current, done) => createThemingSubmenu(sessionCtx, done),
			},
		],
		onChange: () => {},
	});

	ice.registerCommand("theming", {
		description: "Open the theme dropdown editor",
		handler: async (_args, ctx) => {
			await ctx.ui.custom((_tui, _theme, _keys, done) => createThemingSubmenu(ctx, () => done(undefined)));
		},
	});
}

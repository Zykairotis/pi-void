import {
	type Component,
	Container,
	getKeybindings,
	type SettingItem,
	SettingsList,
	Spacer,
	Text,
	type TUI,
	truncateToWidth,
	visibleWidth,
} from "@zykairotis/ice-tui";
import { parseCustomColorToRgb } from "../appearance/appearance-colors.ts";
import { createDefaultAppearance } from "../appearance/appearance-defaults.ts";
import { applyProfileToAppearance, exportBundle, importBundle } from "../appearance/appearance-profiles.ts";
import { resolveAppearanceColorFn } from "../appearance/appearance-resolve.ts";
import type {
	AppearanceBundleV2,
	AppearanceColor,
	AppearanceProfileV2,
	AppearanceSettingsV2,
	AppearanceTextStyle,
	DeepPartial,
} from "../appearance/appearance-types.ts";
import type {
	AppearanceSectionId,
	CustomizationDraftSession,
	ThemePreviewSide,
} from "../appearance/customization-draft-session.ts";
import type { ThemeDraftSession } from "../appearance/theme-draft-session.ts";
import { isValidThemeColorValue } from "../appearance/theme-library.ts";
import { getSettingsListTheme, type Theme, theme } from "../theme/theme.ts";
import { AppearancePreviewComponent, PREVIEW_SCENES, type PreviewScene } from "./appearance-preview.ts";
import { ExtensionInputComponent } from "./extension-input.ts";

export interface AppearanceProfileActionResult {
	appearance?: AppearanceSettingsV2;
	theme?: string;
}

export interface AppearanceCustomizerCallbacks {
	onDraftChange: (draft: AppearanceSettingsV2) => void;
	onApply: () => void;
	onCancel: () => void;
	onThemePreview?: (theme: Theme, name: string) => void;
	onProfileAction?: (
		action: string,
		name: string | undefined,
		draft: AppearanceSettingsV2,
		themeName: string,
	) => AppearanceProfileActionResult | undefined;
}

const SECTION_LABELS: Record<string, string> = {
	"user-messages": "User messages",
	"input-box": "Input box",
	"thinking-indicator": "Thinking indicator",
	"thinking-verbs": "Thinking verbs",
	"thinking-block": "Thinking block",
	assistant: "Assistant message",
	markdown: "Markdown",
	tools: "Tool execution",
	bash: "Bash execution",
	diff: "Diffs",
	"system-cards": "System cards",
	"status-indicators": "Status indicators",
	footer: "Footer",
	chrome: "Shared chrome",
	"agent-chrome": "Agent chrome",
};

const APPEARANCE_SECTIONS: AppearanceSectionId[] = [
	"userMessage",
	"assistantMessage",
	"inputBox",
	"thinking.indicator",
	"thinking.label",
	"thinking.block",
	"statusIndicators",
	"markdown",
	"tools",
	"bash",
	"diff",
	"systemCards",
	"footer",
	"chrome",
	"subagentChrome",
	"inputHighlighters",
];

const SECTION_ID_LABELS: Record<AppearanceSectionId, string> = {
	userMessage: "User messages",
	assistantMessage: "Assistant message",
	inputBox: "Input box",
	"thinking.indicator": "Thinking indicator",
	"thinking.label": "Thinking verbs",
	"thinking.block": "Thinking block",
	statusIndicators: "Status indicators",
	markdown: "Markdown",
	tools: "Tool execution",
	bash: "Bash execution",
	diff: "Diffs",
	systemCards: "System cards",
	footer: "Footer",
	chrome: "Shared chrome",
	subagentChrome: "Agent chrome",
	inputHighlighters: "Input highlighters",
};

const TEXT_STYLES: AppearanceTextStyle[] = ["bold", "italic", "underline", "strikethrough", "inverse"];
const BORDER_STYLES = [
	"none",
	"single",
	"round",
	"double",
	"bold",
	"single-double",
	"double-single",
	"classic",
	"top-bottom-single",
	"top-bottom-double",
	"top-bottom-bold",
];

/** Semantic theme-token groups (plan 11.3). One group per editor screen. */
const THEME_TOKEN_GROUPS: Record<string, string[]> = {
	Core: [
		"accent",
		"border",
		"borderAccent",
		"borderMuted",
		"success",
		"error",
		"warning",
		"muted",
		"dim",
		"text",
		"selectedBg",
		"scrollbarThumb",
	],
	Messages: [
		"thinkingText",
		"userMessageBg",
		"userMessageText",
		"customMessageBg",
		"customMessageText",
		"customMessageLabel",
	],
	Tools: ["toolPendingBg", "toolSuccessBg", "toolErrorBg", "toolTitle", "toolOutput", "bashMode"],
	Markdown: [
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
	Diff: ["toolDiffAdded", "toolDiffRemoved", "toolDiffContext"],
	Syntax: [
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
	"Thinking levels": [
		"thinkingOff",
		"thinkingMinimal",
		"thinkingLow",
		"thinkingMedium",
		"thinkingHigh",
		"thinkingXhigh",
		"thinkingMax",
		"thinkingUltra",
	],
};

function colorSummary(kind: string, detail: string): string {
	return `${kind}:${detail}`;
}

function colorToSummary(color: { kind: string; token?: string; value?: string; index?: number }): string {
	if (color.kind === "theme") return colorSummary("theme", color.token ?? "?");
	if (color.kind === "custom") return colorSummary("custom", color.value ?? "?");
	if (color.kind === "terminal-index") return colorSummary("index", String(color.index ?? 0));
	return color.kind;
}

type DeepPartialAppearance = DeepPartial<AppearanceSettingsV2> & { version: 2 };

interface ShellHandle {
	component: Component;
	rebuild: () => void;
	getList: () => SettingsList | null;
}

/**
 * Dedicated appearance customizer (F2). Owns one in-memory draft; every field
 * edit updates the draft and calls onDraftChange (routed through controller
 * preview, zero writes). Apply commits once; Cancel/Esc rolls back.
 */
export class AppearanceCustomizerComponent extends Container {
	private settingsList: SettingsList;
	private preview: AppearancePreviewComponent;
	private readonly session: CustomizationDraftSession;
	private draft: AppearanceSettingsV2;
	private readonly ui?: TUI;

	private readonly callbacks: AppearanceCustomizerCallbacks;

	private selectedTheme = "";
	private themeError: string | null = null;
	private previewScene: PreviewScene = "all";

	/** Pending theme JSON import blocked on a name collision (plan 11.6). */
	private pendingThemeImport: { name: string; json: string } | null = null;
	/** Pending bundle import staged for preview/confirmation (plan 26.3). */
	private pendingBundleImport: {
		bundle: AppearanceBundleV2;
		themeCollisions: string[];
		profileCollisions: string[];
		themeResolutions: Record<string, "replace" | "skip">;
		profileResolutions: Record<string, "replace" | "skip">;
	} | null = null;

	private profileIncludeTheme = true;
	private profileDescription = "";
	private profileReplaceExisting = false;
	private profileScope: "everything" | "selected" = "everything";
	private profileSections: Partial<Record<AppearanceSectionId, boolean>> = {};
	private bundleMeta = { name: "ice-appearance", description: "", author: "" };
	/** Live shell of the import/export screen (rebuild target for import previews). */
	private bundleShell: ShellHandle | null = null;
	/** Live shell of the theme editor (rebuild target for structural theme ops). */
	private themeShell: ShellHandle | null = null;

	constructor(session: CustomizationDraftSession, callbacks: AppearanceCustomizerCallbacks, ui?: TUI) {
		super();
		this.session = session;
		this.callbacks = callbacks;
		this.ui = ui;
		this.draft = session.getAppearance();
		this.selectedTheme = session.getSelectedTheme();
		this.settingsList = new SettingsList(
			this.buildItems(),
			Math.min(this.buildItems().length, 20),
			getSettingsListTheme(),
			(id, newValue) => this.handleChange(id, newValue),
			() => this.callbacks.onCancel(),
			{ enableSearch: true },
		);
		this.preview = new AppearancePreviewComponent(session.getAppearance(), ui);
		this.addChild(this.settingsList);
		this.addChild(this.preview);
	}

	getSettingsList(): SettingsList {
		return this.settingsList;
	}

	private previewFocused = false;
	private previewOffset = 0;
	private previewPageHeight = 1;
	private previewLineCount = 0;
	private settingsHeight = 48;

	/** Keep settings navigation and preview scrolling independent. */
	handleInput(data: string): void {
		const keys = getKeybindings();
		if (keys.matches(data, "tui.input.tab")) {
			this.previewFocused = !this.previewFocused;
		} else if (this.previewFocused) {
			if (keys.matches(data, "tui.select.cancel")) this.previewFocused = false;
			else if (keys.matches(data, "tui.select.up")) this.previewOffset -= 1;
			else if (keys.matches(data, "tui.select.down")) this.previewOffset += 1;
			else if (keys.matches(data, "tui.select.pageUp")) this.previewOffset -= this.previewPageHeight;
			else if (keys.matches(data, "tui.select.pageDown")) this.previewOffset += this.previewPageHeight;
			this.previewOffset = Math.max(0, Math.min(this.previewOffset, this.previewLineCount - this.previewPageHeight));
		} else {
			this.settingsList.handleInput(data);
		}
		this.ui?.requestRender();
	}

	dispose(): void {
		this.preview.dispose();
	}

	override render(width: number): string[] {
		const height = Math.max(1, this.ui?.terminal.rows ?? 48);
		const bodyHeight = Math.max(0, height - 2);
		const lines = [theme.bold(theme.fg("accent", " Appearance customization"))];
		if (width < 104) {
			// Reserve preview space instead of giving the list the entire viewport.
			const previewHeight = Math.min(10, Math.floor(bodyHeight * 0.4));
			this.settingsHeight = bodyHeight - previewHeight;
			const left = this.renderListToFit(width, this.settingsHeight);
			for (let row = 0; row < this.settingsHeight; row++) lines.push(left[row] ?? "");
			lines.push(...this.renderPreview(width, previewHeight));
		} else {
			const leftWidth = Math.min(56, Math.floor((width - 3) * 0.45));
			const rightWidth = width - leftWidth - 3;
			this.settingsHeight = bodyHeight;
			const left = this.renderListToFit(leftWidth, bodyHeight);
			const right = this.renderPreview(rightWidth, bodyHeight);
			for (let row = 0; row < bodyHeight; row++) {
				const lhs = truncateToWidth(left[row] ?? "", leftWidth, "");
				lines.push(
					`${lhs}${" ".repeat(Math.max(0, leftWidth - visibleWidth(lhs)))} ${theme.fg("borderMuted", "│")} ${right[row] ?? ""}`,
				);
			}
		}
		const keys = getKeybindings();
		const tab = keys.getKeys("tui.input.tab").join("/");
		const cancel = keys.getKeys("tui.select.cancel").join("/");
		lines.push(
			theme.fg(
				"dim",
				this.previewFocused
					? ` ${tab}: settings · ${keys.getKeys("tui.select.pageUp").join("/")}/${keys.getKeys("tui.select.pageDown").join("/")}: scroll · ${cancel}: settings`
					: ` ${tab}: scroll preview · ${cancel}: back/cancel · Apply saves draft`,
			),
		);
		// Fixed-size opaque terminal cells cover the old editor/footer and keep
		// descriptions, submenus and spinner ticks from moving the viewport.
		return lines.slice(0, height).map((line) => {
			const clipped = truncateToWidth(line, width, "");
			return clipped + " ".repeat(Math.max(0, width - visibleWidth(clipped)));
		});
	}

	private renderPreview(width: number, height: number): string[] {
		if (height < 1) return [];
		// The preview's own heading has a spacer above and below it. Keep a
		// persistent pane heading here while scrolling only its sample content.
		const content = this.preview.render(width).slice(3);
		this.previewPageHeight = Math.max(1, height - 1);
		this.previewLineCount = content.length;
		this.previewOffset = Math.max(0, Math.min(this.previewOffset, content.length - this.previewPageHeight));
		const end = Math.min(content.length, this.previewOffset + this.previewPageHeight);
		const heading = `${this.previewFocused ? "→" : "─"} Live appearance preview — ${this.preview.getScene()} (${this.previewOffset + 1}-${end}/${content.length})`;
		const lines = [theme.fg(this.previewFocused ? "accent" : "muted", truncateToWidth(heading, width, ""))];
		for (let row = 0; row < height - 1; row++) lines.push(content[this.previewOffset + row] ?? "");
		return lines;
	}

	/** Shrink visible settings, not the selected row or the list's navigation. */
	private renderListToFit(width: number, availableHeight: number): string[] {
		let maxVisible = Math.max(1, Math.min(this.settingsList.getItemCount(), availableHeight));
		this.settingsList.setMaxVisible(maxVisible);
		let lines = this.settingsList.render(width);
		while (lines.length > availableHeight && maxVisible > 1) {
			this.settingsList.setMaxVisible(--maxVisible);
			lines = this.settingsList.render(width);
		}
		return lines.slice(0, availableHeight);
	}

	private get themeDraft(): ThemeDraftSession {
		return this.session.getThemeDraft();
	}

	private emit(): void {
		const result = this.session.previewAppearance(this.draft);
		if (!result.valid) {
			this.themeError = result.issues.map((issue) => `${issue.path}: ${issue.message}`).join("; ");
			this.draft = this.session.getAppearance();
			this.refreshItems();
			return;
		}
		this.draft = structuredClone(result.appearance);
		this.preview.setAppearance(this.draft);
		this.callbacks.onDraftChange(structuredClone(this.draft));
		this.refreshItems();
	}

	// --- Shell factory (persistent screens, breadcrumbs, inline errors) ---

	private makeShell(opts: {
		breadcrumb: string[];
		rows: () => SettingItem[];
		onChange: (rowId: string, value: string) => void;
		onCancel: () => void;
		search?: boolean;
	}): ShellHandle {
		const container = new Container();
		let list: SettingsList | null = null;
		const render = container.render.bind(container);
		container.render = (width: number): string[] => {
			let maxVisible = Math.max(1, Math.min(list?.getItemCount() ?? 1, this.settingsHeight));
			list?.setMaxVisible(maxVisible);
			let lines = render(width);
			while (lines.length > this.settingsHeight && maxVisible > 1) {
				list?.setMaxVisible(--maxVisible);
				lines = render(width);
			}
			return lines;
		};
		const breadcrumb = opts.breadcrumb.join(" > ");
		const rebuild = (): void => {
			const rows = opts.rows();
			container.clear();
			list = new SettingsList(
				rows,
				Math.min(rows.length, 14),
				getSettingsListTheme(),
				opts.onChange,
				opts.onCancel,
				{ enableSearch: opts.search ?? true },
			);
			container.addChild(new Text(theme.fg("dim", breadcrumb), 0, 0));
			container.addChild(
				new Text(theme.bold(theme.fg("accent", opts.breadcrumb[opts.breadcrumb.length - 1] ?? "")), 0, 0),
			);
			container.addChild(new Spacer(1));
			container.addChild(list);
			container.addChild(new Spacer(1));
			if (this.themeError) {
				container.addChild(new Text(theme.fg("error", truncateToWidth(`  ${this.themeError}`, 100)), 0, 0));
			}
			container.addChild(new Text(theme.fg("dim", "  Enter to change · Esc to go back"), 0, 0));
			const inner = container as Container & { handleInput?: (data: string) => void };
			inner.handleInput = (data: string) => list?.handleInput(data);
		};
		rebuild();
		return { component: container, rebuild, getList: () => list };
	}

	/** Push recomputed row values into an existing shell list (no rebuild). */
	private syncShellValues(shell: ShellHandle, rows: () => SettingItem[]): void {
		const list = shell.getList();
		if (!list) return;
		for (const item of rows()) {
			list.updateItem(item.id, {
				currentValue: item.currentValue,
				description: item.description,
				label: item.label,
			});
		}
	}

	private refreshItems(): void {
		for (const item of this.buildItems()) {
			this.settingsList.updateItem(item.id, {
				label: item.label,
				description: item.description,
				currentValue: item.currentValue,
			});
		}
	}

	// --- Root items ---

	private sectionDirtyLabel(section: AppearanceSectionId): boolean {
		return this.session.isSectionDirty(section);
	}

	private markDirty(label: string, dirty: boolean): string {
		return dirty ? `${label} *` : label;
	}

	private buildItems(): SettingItem[] {
		const d = this.draft;
		const themeSetting = this.session.getThemeSetting();
		const themeSummary =
			themeSetting.mode === "automatic" ? `auto ${themeSetting.light}/${themeSetting.dark}` : this.selectedTheme;
		return [
			{
				id: "section:theme",
				label: this.markDirty("Theme", this.themeDraft.hasStagedChanges() || this.session.isThemeSettingDirty()),
				description: this.themeError ?? "Select, preview, clone, and edit custom themes",
				currentValue: themeSummary,
				submenu: (_current, done) => this.themeEditor(done),
			},
			{
				id: "section:user-messages",
				label: this.markDirty("User messages", this.sectionDirtyLabel("userMessage")),
				description: "Format, styles, colors, border, padding, fit",
				currentValue: `${d.userMessage.borderStyle} pad${d.userMessage.paddingX}/${d.userMessage.paddingY}${d.userMessage.fitToContent ? " fit" : ""}`,
				submenu: (_current, done) => this.userMessageEditor(done),
			},
			{
				id: "section:input-box",
				label: this.markDirty("Input box", this.sectionDirtyLabel("inputBox")),
				description: "Border style, idle/active colors, padding",
				currentValue: `${d.inputBox.borderStyle} pad${d.inputBox.paddingX}`,
				submenu: (_current, done) => this.inputBoxEditor(done),
			},
			{
				id: "section:thinking-indicator",
				label: this.markDirty("Thinking indicator", this.sectionDirtyLabel("thinking.indicator")),
				description: "Frames, interval, mirror, color",
				currentValue: `${d.thinking.indicator.frames.length} frames ${d.thinking.indicator.intervalMs}ms${d.thinking.indicator.reverseMirror ? " mirror" : ""}`,
				submenu: (_current, done) => this.thinkingIndicatorEditor(done),
			},
			{
				id: "section:thinking-verbs",
				label: this.markDirty("Thinking verbs", this.sectionDirtyLabel("thinking.label")),
				description: "Label format, verb list, selection",
				currentValue: `${d.thinking.label.verbs.length} verbs ${d.thinking.label.selection}`,
				submenu: (_current, done) => this.thinkingVerbsEditor(done),
			},
			{
				id: "section:thinking-block",
				label: this.markDirty("Thinking block", this.sectionDirtyLabel("thinking.block")),
				description: "Default visibility, label, styles, color",
				currentValue: d.thinking.block.showByDefault ? "shown" : "hidden",
				submenu: (_current, done) => this.thinkingBlockEditor(done),
			},
			{
				id: "section:assistant",
				label: this.markDirty("Assistant message", this.sectionDirtyLabel("assistantMessage")),
				description: "Container padding, border, background",
				currentValue: `pad${d.assistantMessage.paddingX}/${d.assistantMessage.paddingY} ${d.assistantMessage.borderStyle}`,
				submenu: (_current, done) => this.assistantEditor(done),
			},
			{
				id: "section:markdown",
				label: this.markDirty("Markdown", this.sectionDirtyLabel("markdown")),
				description: "Table style, headings, emphasis, code, quotes, lists",
				currentValue: d.markdown.tableStyle,
				submenu: (_current, done) => this.markdownEditor(done),
			},
			{
				id: "section:tools",
				label: this.markDirty("Tool execution", this.sectionDirtyLabel("tools")),
				description: "Title, output, pending/success/error backgrounds",
				currentValue: "tools",
				submenu: (_current, done) => this.toolsEditor(done),
			},
			{
				id: "section:bash",
				label: this.markDirty("Bash execution", this.sectionDirtyLabel("bash")),
				description: "Border, command, output, status presentation",
				currentValue: `${d.bash.borderStyle} pad${d.bash.paddingX}`,
				submenu: (_current, done) => this.bashEditor(done),
			},
			{
				id: "section:diff",
				label: this.markDirty("Diffs", this.sectionDirtyLabel("diff")),
				description: "Added, removed, context presentation",
				currentValue: "diff",
				submenu: (_current, done) => this.diffEditor(done),
			},
			{
				id: "section:system-cards",
				label: this.markDirty("System cards", this.sectionDirtyLabel("systemCards")),
				description: "Border, padding, label, body presentation",
				currentValue: `${d.systemCards.borderStyle} pad${d.systemCards.paddingX}`,
				submenu: (_current, done) => this.systemCardsEditor(done),
			},
			{
				id: "section:status-indicators",
				label: this.markDirty("Status indicators", this.sectionDirtyLabel("statusIndicators")),
				description: "Working, retry, compaction, branch summary",
				currentValue: "indicators",
				submenu: (_current, done) => this.statusIndicatorsEditor(done),
			},
			{
				id: "section:footer",
				label: this.markDirty("Footer", this.sectionDirtyLabel("footer")),
				description: "Field visibility/order, separator, primary and secondary text",
				currentValue: d.footer.separator,
				submenu: (_current, done) => this.footerEditor(done),
			},
			{
				id: "section:chrome",
				label: this.markDirty("Shared chrome", this.sectionDirtyLabel("chrome")),
				description: "Selectors, settings lists, editor borders, scrollbar roles",
				currentValue: d.chrome.borderStyle,
				submenu: (_current, done) => this.chromeEditor(done),
			},
			{
				id: "section:agent-chrome",
				label: this.markDirty("Agent chrome", this.sectionDirtyLabel("subagentChrome")),
				description: "Agent switcher selection and runtime-state presentation",
				currentValue: d.subagentChrome.borderStyle,
				submenu: (_current, done) => this.agentChromeEditor(done),
			},
			{
				id: "section:highlighters",
				label: this.markDirty("Input highlighters", this.sectionDirtyLabel("inputHighlighters")),
				description: "Literal pattern rules applied at render time",
				currentValue: `${d.inputHighlighters.length} rules`,
				submenu: (_current, done) => this.highlightersEditor(done),
			},
			{
				id: "section:profiles",
				label: this.markDirty("Profiles", this.session.getProfileDraft().hasStagedChanges()),
				description: "Save, load, rename, duplicate, and delete named profiles",
				currentValue: "profiles",
				submenu: (_current, done) => this.profilesEditor(done),
			},
			{
				id: "section:import-export",
				label: "Import / export",
				description: "Versioned data-only appearance + theme bundle",
				currentValue: "bundle",
				submenu: (_current, done) => this.importExportEditor(done),
			},
			{
				id: "preview.scene",
				label: "Preview scene",
				description: "Focus the live preview on one surface",
				currentValue: this.previewScene,
				values: [...PREVIEW_SCENES],
			},
			{
				id: "apply",
				label: "Apply",
				description: "Validate and persist the draft exactly once",
				currentValue: "apply",
				values: ["apply"],
			},
			{
				id: "reset-section",
				label: "Reset draft",
				description: "Reset the draft to persisted settings (no write)",
				currentValue: "reset",
				values: ["reset"],
			},
		];
	}

	private handleChange(id: string, newValue: string): void {
		if (id === "apply") {
			this.callbacks.onApply();
			return;
		}
		if (id === "reset-section") {
			this.session.resetAll();
			this.draft = this.session.getAppearance();
			this.selectedTheme = this.session.getSelectedTheme();
			this.pendingThemeImport = null;
			this.pendingBundleImport = null;
			this.emit();
			return;
		}
		if (id === "preview.scene") {
			this.previewScene = newValue as PreviewScene;
			this.previewOffset = 0;
			this.preview.setScene(this.previewScene);
			return;
		}
	}

	// --- Row helpers ---

	private selectRow(
		id: string,
		label: string,
		description: string,
		currentValue: string,
		values: string[],
	): SettingItem {
		return { id, label, description, currentValue, values };
	}

	private textRow(id: string, label: string, description: string, currentValue: string): SettingItem {
		return {
			id,
			label,
			description,
			currentValue,
			submenu: (current, done) =>
				new ExtensionInputComponent(
					label,
					undefined,
					(value) => done(value),
					() => done(),
					{ initialValue: current },
				),
		};
	}

	/**
	 * Read-mostly text field whose value can be large (export JSON). The row
	 * shows a bounded one-line preview; opening the editor reveals the full
	 * lossless value (plan 26.4: no massive single-line editing UX).
	 */
	private longTextRow(id: string, label: string, description: string, fullValue: string): SettingItem {
		const oneLine = fullValue.replace(/\s+/g, " ").trim();
		const preview = oneLine.length > 60 ? `${oneLine.slice(0, 59)}…` : oneLine;
		return {
			id,
			label,
			description,
			currentValue: preview,
			submenu: (_current, done) =>
				new ExtensionInputComponent(
					label,
					undefined,
					(value) => done(value),
					() => done(),
					{ initialValue: fullValue },
				),
		};
	}

	/** Color field row: Enter opens the shared color editor for this field. */
	private colorRow(
		id: string,
		label: string,
		color: AppearanceColor,
		role: "fg" | "bg",
		allowNone: boolean,
		breadcrumb: string[],
	): SettingItem {
		return {
			id,
			label,
			description: `Current ${colorToSummary(color)}`,
			currentValue: colorToSummary(color),
			submenu: (_current, done) => this.colorEditor([...breadcrumb, label], id, color, role, allowNone, done),
		};
	}

	private resetRow(section: AppearanceSectionId): SettingItem {
		return this.selectRow(
			`reset:${section}`,
			"Reset section",
			"Restore persisted values for this section (no write)",
			"keep",
			["keep", "reset"],
		);
	}

	private sectionShell(
		title: string,
		section: AppearanceSectionId,
		rowsFn: () => SettingItem[],
		done: (v?: string) => void,
	): Component {
		const shell = this.makeShell({
			breadcrumb: ["Appearance", SECTION_LABELS[title] ?? title],
			rows: () => [...rowsFn(), this.resetRow(section)],
			onChange: (rowId, value) => {
				this.handleFieldChange(rowId, value);
				if (rowId.startsWith("reset:")) {
					if (value === "reset") shell.rebuild();
					return;
				}
				this.syncShellValues(shell, () => [...rowsFn(), this.resetRow(section)]);
			},
			onCancel: () => done(),
		});
		return shell.component;
	}

	// --- Shared color editor (plan 10) ---

	private colorTokenChoices(role: "fg" | "bg"): string[] {
		if (role === "bg") {
			return [
				"selectedBg",
				"scrollbarThumb",
				"userMessageBg",
				"customMessageBg",
				"toolPendingBg",
				"toolSuccessBg",
				"toolErrorBg",
			];
		}
		return [
			"accent",
			"border",
			"borderAccent",
			"borderMuted",
			"success",
			"error",
			"warning",
			"muted",
			"dim",
			"text",
			"thinkingText",
			"userMessageText",
			"customMessageText",
			"customMessageLabel",
			"toolTitle",
			"toolOutput",
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
			"toolDiffAdded",
			"toolDiffRemoved",
			"toolDiffContext",
			"thinkingOff",
			"thinkingMinimal",
			"thinkingLow",
			"thinkingMedium",
			"thinkingHigh",
			"thinkingXhigh",
			"thinkingMax",
			"thinkingUltra",
			"bashMode",
		];
	}

	/**
	 * Keyboard-first color editor: swatch preview, mode selection, token/hex/
	 * rgb/hsl authoring. Accept returns the color summary to the parent row;
	 * Esc discards the local edit (plan 10.3: text remains authoritative).
	 */
	private colorEditor(
		breadcrumb: string[],
		_rowId: string,
		color: AppearanceColor,
		role: "fg" | "bg",
		allowNone: boolean,
		done: (v?: string) => void,
	): Component {
		let current: AppearanceColor = structuredClone(color);
		let mode: "theme" | "hex" | "rgb" | "hsl" | "index" | "terminal-default" | "none" =
			current.kind === "theme"
				? "theme"
				: current.kind === "custom"
					? current.value.startsWith("rgb(")
						? "rgb"
						: current.value.startsWith("hsl(")
							? "hsl"
							: "hex"
					: current.kind === "terminal-index"
						? "index"
						: current.kind === "none"
							? "none"
							: "terminal-default";
		let index = current.kind === "terminal-index" ? current.index : 5;
		let rgb = { r: 255, g: 255, b: 255 };
		const hslState = { h: 0, s: 100, l: 50 };
		const syncRgb = (): void => {
			if (current.kind === "custom") {
				const parsed = parseCustomColorToRgb(current.value);
				if (parsed) rgb = parsed;
			}
			if (current.kind === "custom" && current.value.startsWith("hsl(")) {
				const hsl = parseHslComponents(current.value);
				if (hsl) {
					hslState.h = hsl.h;
					hslState.s = hsl.s;
					hslState.l = hsl.l;
				}
			}
		};
		syncRgb();

		const modes: string[] = [
			"theme",
			"hex",
			"rgb",
			"hsl",
			"index",
			"terminal-default",
			...(allowNone ? ["none"] : []),
		];

		const rows = (): SettingItem[] => {
			const swatchFn = resolveAppearanceColorFn(current, role);
			const items: SettingItem[] = [
				{
					id: "color.swatch",
					label: swatchFn("  ██████████  "),
					description: "Live preview of the selected color",
					currentValue: colorToSummary(current),
				},
				this.selectRow("color.mode", "Mode", "Color authoring mode", mode, modes),
			];
			if (mode === "theme") {
				const tokens = this.colorTokenChoices(role);
				const token = current.kind === "theme" ? current.token : (tokens[0] ?? "accent");
				items.push(this.selectRow("color.token", "Theme token", "Semantic theme reference", token, tokens));
			} else if (mode === "hex") {
				items.push(
					this.textRow(
						"color.hex",
						"HEX value",
						"#rgb or #rrggbb",
						current.kind === "custom" && current.value.startsWith("#") ? current.value : "#ffffff",
					),
				);
			} else if (mode === "rgb") {
				items.push(
					this.textRow("color.r", "R", "0-255", String(rgb.r)),
					this.textRow("color.g", "G", "0-255", String(rgb.g)),
					this.textRow("color.b", "B", "0-255", String(rgb.b)),
				);
			} else if (mode === "hsl") {
				items.push(
					this.textRow("color.h", "H", "0-360 degrees", String(Math.round(hslState.h))),
					this.textRow("color.s", "S", "0-100 percent", String(Math.round(hslState.s))),
					this.textRow("color.l", "L", "0-100 percent", String(Math.round(hslState.l))),
				);
			} else if (mode === "index") {
				items.push(
					this.selectRow("color.index", "Terminal index", "ANSI 256 palette index 0-255", String(index), [
						"0",
						"1",
						"2",
						"3",
						"4",
						"5",
						"6",
						"7",
						"8",
						"9",
						"15",
						"39",
						"201",
						"255",
					]),
					this.textRow("color.indexText", "Exact index", "Terminal palette index 0-255", String(index)),
				);
			}
			items.push(
				this.selectRow(
					"color.accept",
					"Accept color",
					"Apply to the draft (text form stays authoritative)",
					"keep",
					["keep", "accept"],
				),
			);
			return items;
		};

		const shell = this.makeShell({
			breadcrumb,
			rows,
			onChange: (id, value) => {
				if (id === "color.mode") {
					if (value === "theme") current = { kind: "theme", token: this.colorTokenChoices(role)[0] ?? "accent" };
					else if (value === "terminal-default") current = { kind: "terminal-default" };
					else if (value === "none") current = { kind: "none" };
					else if (value === "hex")
						current = {
							kind: "custom",
							value: `#${rgb.r.toString(16).padStart(2, "0")}${rgb.g.toString(16).padStart(2, "0")}${rgb.b.toString(16).padStart(2, "0")}`,
						};
					else if (value === "rgb") current = { kind: "custom", value: `rgb(${rgb.r}, ${rgb.g}, ${rgb.b})` };
					else if (value === "hsl") current = { kind: "custom", value: rgbToHslString(rgb.r, rgb.g, rgb.b) };
					else if (value === "index") current = { kind: "terminal-index", index };
					mode = value as typeof mode;
					syncRgb();
					shell.rebuild();
					return;
				}
				if (id === "color.token" && current.kind === "theme") {
					current = { kind: "theme", token: value };
					this.syncShellValues(shell, rows);
					return;
				}
				if (id === "color.hex") {
					const clean = value.trim();
					if (clean.startsWith("#") && parseCustomColorToRgb(clean)) current = { kind: "custom", value: clean };
					syncRgb();
					this.syncShellValues(shell, rows);
					return;
				}
				if (id === "color.r" || id === "color.g" || id === "color.b") {
					const n = Number.parseInt(value, 10);
					if (Number.isFinite(n)) {
						rgb[id === "color.r" ? "r" : id === "color.g" ? "g" : "b"] = Math.max(0, Math.min(255, n));
						current = { kind: "custom", value: `rgb(${rgb.r}, ${rgb.g}, ${rgb.b})` };
					}
					this.syncShellValues(shell, rows);
					return;
				}
				if (id === "color.h" || id === "color.s" || id === "color.l") {
					const n = Number.parseFloat(value);
					if (Number.isFinite(n)) {
						hslState[id === "color.h" ? "h" : id === "color.s" ? "s" : "l"] = Math.max(
							0,
							Math.min(id === "color.h" ? 360 : 100, n),
						);
						current = {
							kind: "custom",
							value: `hsl(${Math.round(hslState.h)}, ${Math.round(hslState.s)}%, ${Math.round(hslState.l)}%)`,
						};
						syncRgb();
					}
					this.syncShellValues(shell, rows);
					return;
				}
				if (id === "color.index") {
					const n = Number.parseInt(value, 10);
					if (Number.isInteger(n) && n >= 0 && n <= 255) {
						index = n;
						current = { kind: "terminal-index", index };
					}
					this.syncShellValues(shell, rows);
					return;
				}
				if (id === "color.indexText") {
					const n = Number.parseInt(value, 10);
					if (Number.isInteger(n) && n >= 0 && n <= 255) {
						index = n;
						current = { kind: "terminal-index", index };
					} else {
						this.themeError = "terminal index must be an integer 0-255";
						shell.rebuild();
						return;
					}
					this.syncShellValues(shell, rows);
					return;
				}
				if (id === "color.accept" && value === "accept") {
					done(colorToSummary(current));
				}
			},
			onCancel: () => done(),
		});
		return shell.component;
	}

	private parseColorChoice(value: string): { kind: string; token?: string; value?: string; index?: number } | null {
		if (value === "none" || value === "terminal-default") return { kind: value };
		if (value.startsWith("theme:")) return { kind: "theme", token: value.slice("theme:".length) };
		if (value.startsWith("custom:")) return { kind: "custom", value: value.slice("custom:".length) };
		if (value.startsWith("index:")) {
			const index = Number.parseInt(value.slice("index:".length), 10);
			if (Number.isInteger(index) && index >= 0 && index <= 255) return { kind: "terminal-index", index };
		}
		return null;
	}

	// --- Section editors ---

	private userMessageEditor(done: (v?: string) => void): Component {
		const d = () => this.draft.userMessage;
		const crumb = ["Appearance", "User messages"];
		return this.sectionShell(
			"user-messages",
			"userMessage",
			() => [
				this.textRow(
					"userMessage.format",
					"Format",
					"Must contain {message}; no executable interpolation",
					d().format,
				),
				this.selectRow("userMessage.borderStyle", "Border style", "Box border family", d().borderStyle, [
					"none",
					"single",
					"double",
					"round",
					"bold",
					"single-double",
					"double-single",
					"classic",
					"top-bottom-single",
					"top-bottom-double",
					"top-bottom-bold",
				]),
				this.selectRow(
					"userMessage.fitToContent",
					"Fit to content",
					"Compact width vs full width",
					String(d().fitToContent),
					["true", "false"],
				),
				this.selectRow("userMessage.paddingX", "Padding X", "Horizontal padding 0-8", String(d().paddingX), [
					"0",
					"1",
					"2",
					"3",
					"4",
					"6",
					"8",
				]),
				this.selectRow("userMessage.paddingY", "Padding Y", "Vertical padding 0-4", String(d().paddingY), [
					"0",
					"1",
					"2",
					"3",
					"4",
				]),
				...TEXT_STYLES.map((style) =>
					this.selectRow(
						`userMessage.style:${style}`,
						`Style ${style}`,
						`Toggle ${style}`,
						String(d().styles.includes(style)),
						["true", "false"],
					),
				),
				this.colorRow("userMessage.foreground", "Foreground", d().foreground, "fg", false, crumb),
				this.colorRow("userMessage.background", "Background", d().background, "bg", true, crumb),
				this.colorRow("userMessage.borderColor", "Border color", d().borderColor, "fg", false, crumb),
			],
			done,
		);
	}

	private inputBoxEditor(done: (v?: string) => void): Component {
		const d = () => this.draft.inputBox;
		const crumb = ["Appearance", "Input box"];
		return this.sectionShell(
			"input-box",
			"inputBox",
			() => [
				this.selectRow("inputBox.borderStyle", "Border style", "Prompt box border", d().borderStyle, [
					"none",
					"single",
					"double",
					"round",
					"bold",
				]),
				this.selectRow("inputBox.paddingX", "Padding X", "Editor padding 0-8", String(d().paddingX), [
					"0",
					"1",
					"2",
					"3",
					"4",
					"6",
					"8",
				]),
				this.colorRow("inputBox.idleBorderColor", "Idle border color", d().idleBorderColor, "fg", false, crumb),
				this.colorRow(
					"inputBox.activeBorderColor",
					"Active border color",
					d().activeBorderColor,
					"fg",
					false,
					crumb,
				),
			],
			done,
		);
	}

	private thinkingIndicatorEditor(done: (v?: string) => void): Component {
		const d = () => this.draft.thinking.indicator;
		return this.sectionShell(
			"thinking-indicator",
			"thinking.indicator",
			() => [
				this.selectRow(
					"thinking.indicator.intervalMs",
					"Interval ms",
					"Frame interval 16-5000",
					String(d().intervalMs),
					["40", "80", "120", "200", "500"],
				),
				this.selectRow(
					"thinking.indicator.reverseMirror",
					"Reverse mirror",
					"Ping-pong frames",
					String(d().reverseMirror),
					["true", "false"],
				),
				this.colorRow("thinking.indicator.color", "Color", d().color, "fg", false, [
					"Appearance",
					"Thinking indicator",
				]),
				this.selectRow(
					"thinking.indicator.frames",
					"Frames preset",
					`Current: ${d().frames.join(" ")} — replace whole set`,
					`${d().frames.length} frames`,
					["dots", "line", "arc", "blocks"],
				),
				this.textRow(
					"thinking.indicator.framesText",
					"Exact frames",
					"Pipe-separated frame list, e.g. ⠋|⠙|⠹",
					d().frames.join("|"),
				),
			],
			done,
		);
	}

	private thinkingVerbsEditor(done: (v?: string) => void): Component {
		const d = () => this.draft.thinking.label;
		return this.sectionShell(
			"thinking-verbs",
			"thinking.label",
			() => [
				this.textRow("thinking.label.format", "Label format", "Must contain {verb}", d().format),
				this.selectRow("thinking.label.selection", "Selection", "Cycle or random", d().selection, [
					"cycle",
					"random",
				]),
				this.selectRow(
					"thinking.label.verbs",
					"Verb preset",
					`Current: ${d().verbs.join(", ")}`,
					`${d().verbs.length} verbs`,
					["default", "minimal"],
				),
				this.textRow("thinking.label.verbsText", "Exact verbs", "Pipe-separated verb list", d().verbs.join("|")),
			],
			done,
		);
	}

	private thinkingBlockEditor(done: (v?: string) => void): Component {
		const d = () => this.draft.thinking.block;
		return this.sectionShell(
			"thinking-block",
			"thinking.block",
			() => [
				this.textRow(
					"thinking.block.hiddenLabel",
					"Hidden label",
					"Label shown when thinking is collapsed",
					d().hiddenLabel,
				),
				this.selectRow(
					"thinking.block.showByDefault",
					"Show by default",
					"Presentation default",
					String(d().showByDefault),
					["true", "false"],
				),
				...TEXT_STYLES.map((style) =>
					this.selectRow(
						`thinking.block.style:${style}`,
						`Style ${style}`,
						`Toggle ${style}`,
						String(d().styles.includes(style)),
						["true", "false"],
					),
				),
				this.colorRow("thinking.block.foreground", "Foreground", d().foreground, "fg", false, [
					"Appearance",
					"Thinking block",
				]),
			],
			done,
		);
	}

	private assistantEditor(done: (v?: string) => void): Component {
		const d = () => this.draft.assistantMessage;
		return this.sectionShell(
			"assistant",
			"assistantMessage",
			() => [
				this.selectRow("assistantMessage.paddingX", "Padding X", "Horizontal padding 0-8", String(d().paddingX), [
					"0",
					"1",
					"2",
					"4",
					"8",
				]),
				this.selectRow("assistantMessage.paddingY", "Padding Y", "Vertical padding 0-4", String(d().paddingY), [
					"0",
					"1",
					"2",
					"4",
				]),
				this.selectRow("assistantMessage.borderStyle", "Border style", "Box border family", d().borderStyle, [
					"none",
					"single",
					"double",
					"round",
					"bold",
					"single-double",
					"double-single",
					"classic",
					"top-bottom-single",
					"top-bottom-double",
					"top-bottom-bold",
				]),
				this.colorRow("assistantMessage.borderColor", "Border color", d().borderColor, "fg", false, [
					"Appearance",
					"Assistant message",
				]),
				this.colorRow("assistantMessage.background", "Background", d().background, "bg", true, [
					"Appearance",
					"Assistant message",
				]),
			],
			done,
		);
	}

	private markdownEditor(done: (v?: string) => void): Component {
		const d = () => this.draft.markdown;
		const crumb = ["Appearance", "Markdown"];
		return this.sectionShell(
			"markdown",
			"markdown",
			() => [
				this.selectRow("markdown.tableStyle", "Table style", "Table border strategy", d().tableStyle, [
					"unicode",
					"ascii",
					"clean",
					"clean-top-bottom",
					"raw",
				]),
				this.colorRow("markdown.body", "Body text", d().body.foreground, "fg", false, crumb),
				this.colorRow("markdown.headings.base", "Headings", d().headings.base.foreground, "fg", false, crumb),
				this.colorRow("markdown.strong", "Bold text", d().strong.foreground, "fg", false, crumb),
				this.colorRow("markdown.emphasis", "Emphasis", d().emphasis.foreground, "fg", false, crumb),
				this.colorRow("markdown.link", "Links", d().link.foreground, "fg", false, crumb),
				this.colorRow("markdown.inlineCode", "Inline code", d().inlineCode.foreground, "fg", false, crumb),
				this.selectRow(
					"markdown.codeBlock.borderStyle",
					"Code block border",
					"Code block border family",
					d().codeBlock.borderStyle,
					BORDER_STYLES,
				),
				this.selectRow(
					"markdown.quote.borderStyle",
					"Quote border",
					"Quote border family",
					d().quote.borderStyle,
					BORDER_STYLES,
				),
				this.colorRow("markdown.listBullet", "List bullets", d().listBullet.foreground, "fg", false, crumb),
				this.colorRow(
					"markdown.horizontalRule",
					"Horizontal rule",
					d().horizontalRule.foreground,
					"fg",
					false,
					crumb,
				),
			],
			done,
		);
	}

	private toolsEditor(done: (v?: string) => void): Component {
		const d = () => this.draft.tools;
		const crumb = ["Appearance", "Tool execution"];
		return this.sectionShell(
			"tools",
			"tools",
			() => [
				this.colorRow("tools.title", "Title", d().title.foreground, "fg", false, crumb),
				this.colorRow("tools.output", "Output", d().output.foreground, "fg", false, crumb),
				this.colorRow(
					"tools.states.pending.background",
					"Pending background",
					d().states.pending.background,
					"bg",
					true,
					crumb,
				),
				this.colorRow(
					"tools.states.success.background",
					"Success background",
					d().states.success.background,
					"bg",
					true,
					crumb,
				),
				this.colorRow(
					"tools.states.error.background",
					"Error background",
					d().states.error.background,
					"bg",
					true,
					crumb,
				),
			],
			done,
		);
	}

	private bashEditor(done: (v?: string) => void): Component {
		const d = () => this.draft.bash;
		const crumb = ["Appearance", "Bash execution"];
		return this.sectionShell(
			"bash",
			"bash",
			() => [
				this.selectRow("bash.borderStyle", "Border style", "Box border family", d().borderStyle, BORDER_STYLES),
				this.colorRow("bash.borderColor", "Border color", d().borderColor, "fg", false, crumb),
				this.selectRow("bash.paddingX", "Padding X", "Horizontal padding 0-8", String(d().paddingX), [
					"0",
					"1",
					"2",
					"4",
					"8",
				]),
				this.colorRow("bash.command", "Command", d().command.foreground, "fg", false, crumb),
				this.colorRow("bash.output", "Output", d().output.foreground, "fg", false, crumb),
				this.colorRow("bash.status", "Status", d().status.foreground, "fg", false, crumb),
			],
			done,
		);
	}

	private diffEditor(done: (v?: string) => void): Component {
		const d = () => this.draft.diff;
		const crumb = ["Appearance", "Diffs"];
		return this.sectionShell(
			"diff",
			"diff",
			() => [
				this.colorRow("diff.added", "Added lines", d().added.foreground, "fg", false, crumb),
				this.colorRow("diff.removed", "Removed lines", d().removed.foreground, "fg", false, crumb),
				this.colorRow("diff.context", "Context lines", d().context.foreground, "fg", false, crumb),
			],
			done,
		);
	}

	private systemCardsEditor(done: (v?: string) => void): Component {
		const d = () => this.draft.systemCards;
		const crumb = ["Appearance", "System cards"];
		return this.sectionShell(
			"system-cards",
			"systemCards",
			() => [
				this.selectRow(
					"systemCards.borderStyle",
					"Border style",
					"Box border family",
					d().borderStyle,
					BORDER_STYLES,
				),
				this.colorRow("systemCards.borderColor", "Border color", d().borderColor, "fg", false, crumb),
				this.selectRow("systemCards.paddingX", "Padding X", "Horizontal padding 0-8", String(d().paddingX), [
					"0",
					"1",
					"2",
					"4",
					"8",
				]),
				this.selectRow("systemCards.paddingY", "Padding Y", "Vertical padding 0-4", String(d().paddingY), [
					"0",
					"1",
					"2",
					"4",
				]),
				this.colorRow("systemCards.label", "Label", d().label.foreground, "fg", false, crumb),
				this.colorRow("systemCards.body", "Body", d().body.foreground, "fg", false, crumb),
			],
			done,
		);
	}

	private statusIndicatorsEditor(done: (v?: string) => void): Component {
		const kinds = ["working", "retry", "compaction", "branchSummary"] as const;
		const rows = (): SettingItem[] => {
			const items: SettingItem[] = [];
			for (const kind of kinds) {
				const entry = this.draft.statusIndicators[kind];
				items.push(
					this.colorRow(
						`statusIndicators.${kind}.indicator.color`,
						`${kind} spinner`,
						entry.indicator.color,
						"fg",
						false,
						["Appearance", "Status indicators"],
					),
					this.selectRow(
						`statusIndicators.${kind}.indicator.intervalMs`,
						`${kind} interval`,
						`Spinner interval ${entry.indicator.intervalMs}ms`,
						String(entry.indicator.intervalMs),
						["40", "80", "120", "200", "400"],
					),
					this.colorRow(
						`statusIndicators.${kind}.label.foreground`,
						`${kind} label`,
						entry.label.foreground,
						"fg",
						false,
						["Appearance", "Status indicators"],
					),
				);
			}
			return items;
		};
		return this.sectionShell("status-indicators", "statusIndicators", rows, done);
	}

	private footerEditor(done: (v?: string) => void): Component {
		const f = () => this.draft.footer;
		const crumb = ["Appearance", "Footer"];
		const rows = (): SettingItem[] => [
			this.textRow(
				"footer.separator",
				"Separator",
				"Plain-text separator between visible footer fields",
				f().separator,
			),
			this.textRow("footer.order", "Field order", "Comma-separated semantic field ids", f().order.join(",")),
			this.colorRow("footer.primary", "Primary text", f().primary.foreground, "fg", false, crumb),
			this.colorRow("footer.secondary", "Secondary text", f().secondary.foreground, "fg", false, crumb),
			this.colorRow("footer.extensions", "Extension text", f().extensions.foreground, "fg", false, crumb),
			...f().order.map((field) =>
				this.selectRow(
					`footer.visible.${field}`,
					`Show ${field}`,
					"Footer field visibility",
					String(f().visible[field]),
					["true", "false"],
				),
			),
		];
		return this.sectionShell("footer", "footer", rows, done);
	}

	private chromeEditor(done: (v?: string) => void): Component {
		const c = () => this.draft.chrome;
		const crumb = ["Appearance", "Shared chrome"];
		return this.sectionShell(
			"chrome",
			"chrome",
			() => [
				this.selectRow(
					"chrome.borderStyle",
					"Border style",
					"Shared selector/editor chrome border",
					c().borderStyle,
					BORDER_STYLES,
				),
				this.colorRow("chrome.borderColor", "Border color", c().borderColor, "fg", false, crumb),
				this.colorRow(
					"chrome.selectedForeground",
					"Selected foreground",
					c().selectedForeground,
					"fg",
					false,
					crumb,
				),
				this.colorRow(
					"chrome.selectedBackground",
					"Selected background",
					c().selectedBackground,
					"bg",
					true,
					crumb,
				),
				this.colorRow("chrome.description", "Description", c().description.foreground, "fg", false, crumb),
				this.colorRow("chrome.hint", "Hints", c().hint.foreground, "fg", false, crumb),
				this.colorRow("chrome.scrollbarTrack", "Scrollbar track", c().scrollbarTrack, "bg", true, crumb),
				this.colorRow("chrome.scrollbarThumb", "Scrollbar thumb", c().scrollbarThumb, "bg", true, crumb),
			],
			done,
		);
	}

	private agentChromeEditor(done: (v?: string) => void): Component {
		const c = () => this.draft.subagentChrome;
		const crumb = ["Appearance", "Agent chrome"];
		return this.sectionShell(
			"agent-chrome",
			"subagentChrome",
			() => [
				this.selectRow(
					"subagentChrome.borderStyle",
					"Border style",
					"Agent switcher border style",
					c().borderStyle,
					BORDER_STYLES,
				),
				this.colorRow("subagentChrome.borderColor", "Border color", c().borderColor, "fg", false, crumb),
				this.colorRow(
					"subagentChrome.selectedForeground",
					"Selected foreground",
					c().selectedForeground,
					"fg",
					false,
					crumb,
				),
				this.colorRow(
					"subagentChrome.selectedBackground",
					"Selected background",
					c().selectedBackground,
					"bg",
					true,
					crumb,
				),
				this.colorRow("subagentChrome.running", "Running", c().running.foreground, "fg", false, crumb),
				this.colorRow("subagentChrome.completed", "Completed", c().completed.foreground, "fg", false, crumb),
				this.colorRow("subagentChrome.failed", "Failed", c().failed.foreground, "fg", false, crumb),
				this.colorRow("subagentChrome.attention", "Needs attention", c().attention.foreground, "fg", false, crumb),
				this.colorRow("subagentChrome.muted", "Muted", c().muted.foreground, "fg", false, crumb),
			],
			done,
		);
	}

	private buildProfileAppearance(): DeepPartialAppearance {
		if (this.profileScope === "everything") {
			return { ...structuredClone(this.draft), version: 2 };
		}
		const draft = this.draft as unknown as Record<string, unknown>;
		const partial: Record<string, unknown> = { version: 2 };
		for (const section of APPEARANCE_SECTIONS) {
			if (this.profileSections[section] && section in draft) {
				partial[section] = structuredClone(draft[section]);
			}
		}
		return partial as DeepPartialAppearance;
	}

	// --- Field changes ---

	private nextHighlighterId(pattern: string): string {
		const base =
			pattern
				.toLowerCase()
				.replace(/[^a-z0-9]+/g, "-")
				.replace(/^-|-$/g, "")
				.slice(0, 32) || "rule";
		const existing = new Set(this.draft.inputHighlighters.map((rule) => rule.id));
		let candidate = base;
		let n = 2;
		while (existing.has(candidate)) candidate = `${base}-${n++}`;
		return candidate;
	}

	private addHighlighter(pattern: string): void {
		const clean = pattern.trim();
		if (!clean || clean.length > 128 || this.draft.inputHighlighters.length >= 64) return;
		this.draft.inputHighlighters = [
			...this.draft.inputHighlighters,
			{
				id: this.nextHighlighterId(clean),
				name: clean.slice(0, 64),
				enabled: true,
				matcher: { kind: "literal", pattern: clean, caseSensitive: true },
				styles: ["bold"],
				foreground: { kind: "custom", value: "#ffff00" },
				background: { kind: "terminal-default" },
				priority: this.draft.inputHighlighters.length,
			},
		];
	}

	private handleFieldChange(rowId: string, value: string): void {
		const d = this.draft;
		if (rowId === "highlighters.testText") {
			this.preview.setHighlighterTestText(value);
			return;
		}
		if (rowId.startsWith("reset:")) {
			if (value === "reset") {
				this.session.resetSection(rowId.slice("reset:".length) as AppearanceSectionId);
				this.draft = this.session.getAppearance();
				this.emit();
			}
			return;
		}
		if (rowId === "profiles.scope") {
			this.profileScope = value === "selected" ? "selected" : "everything";
			return;
		}
		if (rowId === "profiles.replaceExisting") {
			this.profileReplaceExisting = value === "true";
			return;
		}
		if (rowId.startsWith("profileInclude.")) {
			const section = rowId.slice("profileInclude.".length) as AppearanceSectionId;
			this.profileSections[section] = value === "true";
			return;
		}
		if (rowId === "highlighters.add") {
			if (value === "clear-all") d.inputHighlighters = [];
			else this.addHighlighter(value);
			this.emit();
			return;
		}
		if (rowId === "highlighters.addCustom") {
			this.addHighlighter(value);
			this.emit();
			return;
		}
		if (rowId.startsWith("highlighters.toggle:")) {
			const id = rowId.slice("highlighters.toggle:".length);
			d.inputHighlighters = d.inputHighlighters.map((rule) =>
				rule.id === id ? { ...rule, enabled: value === "true" } : rule,
			);
			this.emit();
			return;
		}
		if (rowId.startsWith("highlighters.case:")) {
			const id = rowId.slice("highlighters.case:".length);
			d.inputHighlighters = d.inputHighlighters.map((rule) =>
				rule.id === id ? { ...rule, matcher: { ...rule.matcher, caseSensitive: value === "true" } } : rule,
			);
			this.emit();
			return;
		}
		for (const field of ["name", "pattern", "priority", "move", "delete"] as const) {
			const prefix = `highlighters.${field}:`;
			if (!rowId.startsWith(prefix)) continue;
			const id = rowId.slice(prefix.length);
			const index = d.inputHighlighters.findIndex((rule) => rule.id === id);
			if (index < 0) return;
			const rule = d.inputHighlighters[index];
			if (!rule) return;
			if (field === "name") rule.name = value.slice(0, 64);
			else if (field === "pattern") rule.matcher.pattern = value;
			else if (field === "priority") {
				const parsed = Number.parseInt(value, 10);
				if (Number.isFinite(parsed)) rule.priority = Math.max(0, Math.min(1000, parsed));
			} else if (field === "move" && value !== "keep") {
				const target = value === "up" ? index - 1 : index + 1;
				if (target >= 0 && target < d.inputHighlighters.length) {
					[d.inputHighlighters[index], d.inputHighlighters[target]] = [
						d.inputHighlighters[target]!,
						d.inputHighlighters[index]!,
					];
				}
			} else if (field === "delete" && value === "delete") {
				d.inputHighlighters.splice(index, 1);
			}
			this.emit();
			return;
		}
		for (const field of ["foreground", "background"] as const) {
			const prefix = `highlighters.${field}:`;
			if (!rowId.startsWith(prefix)) continue;
			const id = rowId.slice(prefix.length);
			const index = d.inputHighlighters.findIndex((rule) => rule.id === id);
			if (index < 0) return;
			const rule = d.inputHighlighters[index];
			if (!rule) return;
			const parsed = this.parseColorChoice(value);
			if (parsed && (field === "background" || parsed.kind !== "none")) {
				rule[field] = parsed as typeof rule.foreground;
			}
			this.emit();
			return;
		}
		if (rowId.startsWith("highlighters.style:")) {
			const [, id, styleName] = rowId.split(":");
			const style = styleName as AppearanceTextStyle;
			d.inputHighlighters = d.inputHighlighters.map((rule) =>
				rule.id === id
					? {
							...rule,
							styles:
								value === "true"
									? [...new Set([...rule.styles, style])]
									: rule.styles.filter((item) => item !== style),
						}
					: rule,
			);
			this.emit();
			return;
		}

		// --- Profiles ---
		if (rowId === "profiles.description") {
			this.profileDescription = value.trim().slice(0, 200);
			return;
		}
		if (rowId === "profiles.includeTheme") {
			this.profileIncludeTheme = value === "true";
			return;
		}
		if (rowId === "profiles.saveAs" || rowId === "profiles.save") {
			const name = rowId === "profiles.saveAs" ? value.trim() : "default-profile";
			const draft = this.session.getProfileDraft();
			const exists = draft.exists(name);
			if (exists && !this.profileReplaceExisting) {
				this.themeError = `Profile "${name}" already exists — set "Replace existing" to overwrite it`;
				this.refreshItems();
				return;
			}
			const appearance = this.buildProfileAppearance();
			const result = draft.save(
				{
					version: 2,
					name,
					description: this.profileDescription || undefined,
					themeSetting: this.profileIncludeTheme ? this.session.getThemeSetting() : undefined,
					appearance,
				},
				{ replace: exists },
			);
			if (!result.success) this.themeError = result.error ?? "profile save failed";
			else {
				this.themeError = null;
				this.profileReplaceExisting = false;
			}
			this.emit();
			return;
		}
		if (rowId.startsWith("profiles.rename:") || rowId.startsWith("profiles.duplicate:")) {
			const rename = rowId.startsWith("profiles.rename:");
			const prefix = rename ? "profiles.rename:" : "profiles.duplicate:";
			const source = rowId.slice(prefix.length);
			const dest = value.trim();
			const draft = this.session.getProfileDraft();
			const result = rename ? draft.rename(source, dest) : draft.duplicate(source, dest);
			if (!result.success) this.themeError = result.error ?? "profile operation failed";
			else this.themeError = null;
			this.emit();
			return;
		}
		if (rowId.startsWith("profiles.editDescription:")) {
			const name = rowId.slice("profiles.editDescription:".length);
			const profile = this.session.getProfileDraft().get(name);
			if (profile) {
				const result = this.session
					.getProfileDraft()
					.save({ ...profile, description: value.trim().slice(0, 200) || undefined }, { replace: true });
				if (!result.success) this.themeError = result.error ?? "profile update failed";
				else this.themeError = null;
			}
			return;
		}
		if (rowId === "profiles.save" || rowId.startsWith("profiles.apply:")) {
			const action = value;
			const name = rowId.slice("profiles.apply:".length);
			if (action === "delete") {
				const result = this.session.getProfileDraft().delete(name);
				if (!result.success) this.themeError = result.error ?? "profile delete failed";
				else this.themeError = null;
				this.emit();
				return;
			}
			const profile = this.session.getProfileDraft().get(name);
			if (!profile) {
				this.themeError = `Profile "${name}" not found`;
				this.refreshItems();
				return;
			}
			const result = this.session.loadProfile(profile);
			if (!result.valid) {
				this.themeError = result.issues.map((issue) => `${issue.path}: ${issue.message}`).join("; ");
				this.refreshItems();
				return;
			}
			this.applyProfileThemeSetting(profile);
			this.emit();
			return;
		}

		// --- Bundle import/export ---
		if (rowId === "bundle.export") return;
		if (rowId === "bundle.name") {
			this.bundleMeta.name = value.trim().slice(0, 64) || "ice-appearance";
			return;
		}
		if (rowId === "bundle.description") {
			this.bundleMeta.description = value.trim().slice(0, 200);
			return;
		}
		if (rowId === "bundle.author") {
			this.bundleMeta.author = value.trim().slice(0, 64);
			return;
		}
		if (rowId === "bundle.resetDefaults" && value === "reset") {
			this.draft = createDefaultAppearance();
			this.emit();
			return;
		}
		if (rowId === "bundle.import") {
			this.beginBundleImport(value);
			return;
		}
		if (rowId === "bundle.importConfirm") {
			if (value === "stage" && this.pendingBundleImport) {
				const pending = this.pendingBundleImport;
				this.pendingBundleImport = null;
				this.stageBundle(pending.bundle, pending.themeResolutions, pending.profileResolutions);
			} else if (value === "cancel") {
				this.pendingBundleImport = null;
				this.themeError = null;
			}
			return;
		}
		if (rowId.startsWith("bundle.themeCollision:")) {
			const name = rowId.slice("bundle.themeCollision:".length);
			if (this.pendingBundleImport) {
				this.pendingBundleImport.themeResolutions[name] = value === "replace" ? "replace" : "skip";
			}
			return;
		}
		if (rowId.startsWith("bundle.profileCollision:")) {
			const name = rowId.slice("bundle.profileCollision:".length);
			if (this.pendingBundleImport) {
				this.pendingBundleImport.profileResolutions[name] = value === "replace" ? "replace" : "skip";
			}
			return;
		}

		this.applySectionField(rowId, value);
		this.emit();
	}

	private applyProfileThemeSetting(profile: AppearanceProfileV2): void {
		const setting = profile.themeSetting;
		if (!setting) return;
		if (setting.mode === "fixed") {
			this.session.setFixedTheme(setting.theme);
		} else {
			this.session.setThemeMode("automatic");
			this.session.setAutomaticMember("light", setting.light);
			this.session.setAutomaticMember("dark", setting.dark);
		}
		this.selectedTheme = this.session.getSelectedTheme();
		this.previewThemeDraft();
	}

	// --- Appearance section field routing ---

	private applySectionField(rowId: string, value: string): void {
		const d = this.draft;
		const num = (v: string, min: number, max: number, fallback: number): number => {
			const n = Number.parseInt(v, 10);
			if (!Number.isFinite(n)) return fallback;
			return Math.max(min, Math.min(max, Math.floor(n)));
		};
		const bool = (v: string): boolean => v === "true";
		const [scope, rest] = rowId.split(".", 2) as [string, string];
		if (scope === "userMessage") {
			const u = d.userMessage;
			if (rest === "format") u.format = value;
			else if (rest === "borderStyle") u.borderStyle = value as typeof u.borderStyle;
			else if (rest === "fitToContent") u.fitToContent = bool(value);
			else if (rest === "paddingX") u.paddingX = num(value, 0, 8, u.paddingX);
			else if (rest === "paddingY") u.paddingY = num(value, 0, 4, u.paddingY);
			else if (rest?.startsWith("style:")) {
				const style = rest.slice("style:".length) as AppearanceTextStyle;
				u.styles = bool(value) ? [...new Set([...u.styles, style])] : u.styles.filter((s) => s !== style);
			} else if (rest === "foreground" || rest === "background" || rest === "borderColor") {
				const parsed = this.parseColorChoice(value);
				if (
					parsed &&
					(parsed.kind === "theme" ||
						parsed.kind === "custom" ||
						parsed.kind === "terminal-default" ||
						(parsed.kind === "none" && rest === "background"))
				) {
					(u as unknown as Record<string, unknown>)[rest] = parsed;
				}
			}
		} else if (scope === "inputBox") {
			const b = d.inputBox;
			if (rest === "borderStyle") b.borderStyle = value as typeof b.borderStyle;
			else if (rest === "paddingX") b.paddingX = num(value, 0, 8, b.paddingX);
			else if (rest === "idleBorderColor" || rest === "activeBorderColor") {
				const parsed = this.parseColorChoice(value);
				if (parsed && parsed.kind !== "none") (b as unknown as Record<string, unknown>)[rest] = parsed;
			}
		} else if (scope === "thinking") {
			const t = d.thinking;
			const [, field, leaf] = rowId.split(".");
			if (field === "indicator" && leaf === "intervalMs")
				t.indicator.intervalMs = num(value, 16, 5000, t.indicator.intervalMs);
			else if (field === "indicator" && leaf === "reverseMirror") t.indicator.reverseMirror = bool(value);
			else if (field === "indicator" && leaf === "color") {
				const parsed = this.parseColorChoice(value);
				if (parsed && parsed.kind !== "none") t.indicator.color = parsed as typeof t.indicator.color;
			} else if (field === "indicator" && leaf === "framesText") {
				t.indicator.frames = value
					.split("|")
					.map((frame) => frame.trim())
					.filter(Boolean);
			} else if (field === "indicator" && leaf === "frames") {
				if (value === "dots") t.indicator.frames = ["⠋", "⠙", "⠹", "⠸", "⠼", "⠴", "⠦", "⠧", "⠇", "⠏"];
				else if (value === "line") t.indicator.frames = ["-", "\\", "|", "/"];
				else if (value === "arc") t.indicator.frames = ["◐", "◓", "◑", "◒"];
				else if (value === "blocks")
					t.indicator.frames = ["▁", "▂", "▃", "▄", "▅", "▆", "▇", "█", "▇", "▆", "▅", "▄", "▃", "▂"];
			} else if (field === "label" && leaf === "format") {
				t.label.format = value;
			} else if (field === "label" && leaf === "selection") {
				t.label.selection = value === "random" ? "random" : "cycle";
			} else if (field === "label" && leaf === "verbsText") {
				t.label.verbs = value
					.split("|")
					.map((verb) => verb.trim())
					.filter(Boolean);
			} else if (field === "label" && leaf === "verbs") {
				if (value === "default") {
					t.label.verbs = ["Thinking", "Reasoning", "Considering", "Working", "Analyzing", "Planning"];
				} else if (value === "minimal") {
					t.label.verbs = ["Working"];
				}
			} else if (field === "block" && leaf === "hiddenLabel") {
				t.block.hiddenLabel = value;
			} else if (field === "block" && leaf === "showByDefault") {
				t.block.showByDefault = bool(value);
			} else if (field === "block" && leaf === "foreground") {
				const parsed = this.parseColorChoice(value);
				if (parsed && parsed.kind !== "none") t.block.foreground = parsed as typeof t.block.foreground;
			} else if (field === "block" && leaf?.startsWith("style:")) {
				const style = (leaf as string).slice("style:".length) as AppearanceTextStyle;
				t.block.styles = bool(value)
					? [...new Set([...t.block.styles, style])]
					: t.block.styles.filter((s) => s !== style);
			}
		} else if (scope === "assistantMessage") {
			const a = d.assistantMessage;
			if (rest === "paddingX") a.paddingX = num(value, 0, 8, a.paddingX);
			else if (rest === "paddingY") a.paddingY = num(value, 0, 4, a.paddingY);
			else if (rest === "borderStyle") a.borderStyle = value as typeof a.borderStyle;
			else if (rest === "borderColor" || rest === "background") {
				const parsed = this.parseColorChoice(value);
				if (parsed && (parsed.kind !== "none" || rest === "background")) {
					(a as unknown as Record<string, unknown>)[rest] = parsed;
				}
			}
		} else if (scope === "markdown") {
			const m = d.markdown;
			const [, field, leaf] = rowId.split(".");
			if (field === "tableStyle") m.tableStyle = value as typeof m.tableStyle;
			else if (
				(field === "body" ||
					field === "strong" ||
					field === "emphasis" ||
					field === "link" ||
					field === "inlineCode" ||
					field === "listBullet" ||
					field === "horizontalRule") &&
				!leaf
			) {
				const parsed = this.parseColorChoice(value);
				if (parsed && parsed.kind !== "none") {
					(m[field] as unknown as { foreground: unknown }).foreground = parsed;
				}
			} else if (field === "headings" && leaf === "base") {
				const parsed = this.parseColorChoice(value);
				if (parsed && parsed.kind !== "none")
					m.headings.base.foreground = parsed as typeof m.headings.base.foreground;
			} else if (field === "codeBlock" && leaf === "borderStyle") {
				m.codeBlock.borderStyle = value as typeof m.codeBlock.borderStyle;
			} else if (field === "quote" && leaf === "borderStyle") {
				m.quote.borderStyle = value as typeof m.quote.borderStyle;
			}
		} else if (scope === "tools") {
			const t = d.tools;
			const [, field, leaf, leaf2] = rowId.split(".");
			if ((field === "title" || field === "output") && !leaf) {
				const parsed = this.parseColorChoice(value);
				if (parsed && parsed.kind !== "none") {
					(t[field] as unknown as { foreground: unknown }).foreground = parsed;
				}
			} else if (field === "states" && leaf2 === "background") {
				const parsed = this.parseColorChoice(value);
				if (parsed) {
					(t.states[leaf as "pending" | "success" | "error"] as unknown as { background: unknown }).background =
						parsed;
				}
			}
		} else if (scope === "bash") {
			const b = d.bash;
			if (rest === "borderStyle") b.borderStyle = value as typeof b.borderStyle;
			else if (rest === "paddingX") b.paddingX = num(value, 0, 8, b.paddingX);
			else if (rest === "borderColor") {
				const parsed = this.parseColorChoice(value);
				if (parsed && parsed.kind !== "none") b.borderColor = parsed as typeof b.borderColor;
			} else if (rest === "command" || rest === "output" || rest === "status") {
				const parsed = this.parseColorChoice(value);
				if (parsed && parsed.kind !== "none") {
					(b[rest] as unknown as { foreground: unknown }).foreground = parsed;
				}
			}
		} else if (scope === "diff") {
			const df = d.diff;
			if (rest === "added" || rest === "removed" || rest === "context") {
				const parsed = this.parseColorChoice(value);
				if (parsed && parsed.kind !== "none") {
					(df[rest] as unknown as { foreground: unknown }).foreground = parsed;
				}
			}
		} else if (scope === "systemCards") {
			const c = d.systemCards;
			if (rest === "borderStyle") c.borderStyle = value as typeof c.borderStyle;
			else if (rest === "paddingX") c.paddingX = num(value, 0, 8, c.paddingX);
			else if (rest === "paddingY") c.paddingY = num(value, 0, 4, c.paddingY);
			else if (rest === "borderColor") {
				const parsed = this.parseColorChoice(value);
				if (parsed && parsed.kind !== "none") c.borderColor = parsed as typeof c.borderColor;
			} else if (rest === "label" || rest === "body") {
				const parsed = this.parseColorChoice(value);
				if (parsed && parsed.kind !== "none") {
					(c[rest] as unknown as { foreground: unknown }).foreground = parsed;
				}
			}
		} else if (scope === "footer") {
			const f = d.footer;
			if (rest === "separator") f.separator = value;
			else if (rest === "order") {
				const allowed = new Set(f.order);
				const next = value
					.split(",")
					.map((part) => part.trim())
					.filter((part) => allowed.has(part as never));
				if (next.length) f.order = next as typeof f.order;
			} else if (rest?.startsWith("visible.")) {
				const field = rest.slice("visible.".length) as keyof typeof f.visible;
				if (field in f.visible) f.visible[field] = value === "true";
			} else if (rest === "primary" || rest === "secondary" || rest === "extensions") {
				const parsed = this.parseColorChoice(value);
				if (parsed && parsed.kind !== "none") f[rest].foreground = parsed as typeof f.primary.foreground;
			}
		} else if (scope === "chrome") {
			const c = d.chrome;
			if (rest === "borderStyle") c.borderStyle = value as typeof c.borderStyle;
			else if (rest === "description" || rest === "hint") {
				const parsed = this.parseColorChoice(value);
				if (parsed && parsed.kind !== "none") c[rest].foreground = parsed as typeof c.description.foreground;
			} else {
				const parsed = this.parseColorChoice(value);
				if (parsed) {
					if (rest === "borderColor" && parsed.kind !== "none") c.borderColor = parsed as typeof c.borderColor;
					else if (rest === "selectedForeground" && parsed.kind !== "none")
						c.selectedForeground = parsed as typeof c.selectedForeground;
					else if (rest === "selectedBackground") c.selectedBackground = parsed as typeof c.selectedBackground;
					else if (rest === "scrollbarTrack") c.scrollbarTrack = parsed as typeof c.scrollbarTrack;
					else if (rest === "scrollbarThumb") c.scrollbarThumb = parsed as typeof c.scrollbarThumb;
				}
			}
		} else if (scope === "subagentChrome") {
			const c = d.subagentChrome;
			if (rest === "borderStyle") c.borderStyle = value as typeof c.borderStyle;
			else if (["running", "completed", "failed", "attention", "muted"].includes(rest)) {
				const parsed = this.parseColorChoice(value);
				if (parsed && parsed.kind !== "none")
					(c[rest as "running"] as { foreground: typeof parsed }).foreground = parsed;
			} else {
				const parsed = this.parseColorChoice(value);
				if (parsed) {
					if (rest === "borderColor" && parsed.kind !== "none") c.borderColor = parsed as typeof c.borderColor;
					else if (rest === "selectedForeground" && parsed.kind !== "none")
						c.selectedForeground = parsed as typeof c.selectedForeground;
					else if (rest === "selectedBackground") c.selectedBackground = parsed as typeof c.selectedBackground;
				}
			}
		} else if (scope === "statusIndicators") {
			const [, kind, part, leaf] = rowId.split(".");
			const entry = d.statusIndicators[kind as keyof typeof d.statusIndicators];
			if (entry && part === "indicator" && leaf === "color") {
				const parsed = this.parseColorChoice(value);
				if (parsed && parsed.kind !== "none") entry.indicator.color = parsed as typeof entry.indicator.color;
			} else if (entry && part === "indicator" && leaf === "intervalMs") {
				entry.indicator.intervalMs = num(value, 16, 5000, entry.indicator.intervalMs);
			} else if (entry && part === "label" && leaf === "foreground") {
				const parsed = this.parseColorChoice(value);
				if (parsed && parsed.kind !== "none") entry.label.foreground = parsed as typeof entry.label.foreground;
			}
		}
	}

	// --- Highlighters editor ---

	private highlightersEditor(done: (v?: string) => void): Component {
		const rows = (): SettingItem[] => {
			const items: SettingItem[] = [
				this.textRow(
					"highlighters.testText",
					"Preview test text",
					"Temporary sample only; not persisted (max 200 characters)",
					this.preview.getHighlighterTestText(),
				),
				this.selectRow("highlighters.add", "Add preset", "Add TODO/FIXME/NOTE preset or clear all", "add", [
					"TODO",
					"FIXME",
					"NOTE",
					"clear-all",
				]),
				this.textRow(
					"highlighters.addCustom",
					"Add custom literal",
					"Type a literal pattern (1-128 characters)",
					"",
				),
			];
			const crumb = ["Appearance", "Input highlighters"];
			this.draft.inputHighlighters.forEach((rule, index) => {
				items.push(
					this.selectRow(
						`highlighters.toggle:${rule.id}`,
						`${index + 1}. ${rule.name}`,
						`Pattern "${rule.matcher.pattern}"`,
						String(rule.enabled),
						["true", "false"],
					),
					this.textRow(
						`highlighters.name:${rule.id}`,
						`Name ${rule.name}`,
						"Display name (max 64 chars)",
						rule.name,
					),
					this.textRow(
						`highlighters.pattern:${rule.id}`,
						`Pattern ${rule.name}`,
						"Literal matcher only; no regex execution",
						rule.matcher.pattern,
					),
					this.selectRow(
						`highlighters.case:${rule.id}`,
						`${rule.name} case sensitive`,
						"Case-sensitive literal matching",
						String(rule.matcher.caseSensitive),
						["true", "false"],
					),
					this.textRow(
						`highlighters.priority:${rule.id}`,
						`Priority ${rule.name}`,
						"0-1000; lower number wins overlapping ranges",
						String(rule.priority),
					),
					...TEXT_STYLES.map((style) =>
						this.selectRow(
							`highlighters.style:${rule.id}:${style}`,
							`${rule.name} ${style}`,
							`Toggle ${style}`,
							String(rule.styles.includes(style)),
							["true", "false"],
						),
					),
					this.colorRow(
						`highlighters.foreground:${rule.id}`,
						`${rule.name} foreground`,
						rule.foreground,
						"fg",
						false,
						crumb,
					),
					this.colorRow(
						`highlighters.background:${rule.id}`,
						`${rule.name} background`,
						rule.background,
						"bg",
						true,
						crumb,
					),
					this.selectRow(`highlighters.move:${rule.id}`, `Move ${rule.name}`, "Reorder rule", "keep", [
						"keep",
						"up",
						"down",
					]),
					this.selectRow(`highlighters.delete:${rule.id}`, `Delete ${rule.name}`, "Remove rule", "keep", [
						"keep",
						"delete",
					]),
				);
			});
			return items;
		};
		const shell = this.makeShell({
			breadcrumb: ["Appearance", "Input highlighters"],
			rows,
			onChange: (rowId, value) => {
				this.handleFieldChange(rowId, value);
				if (
					rowId === "highlighters.add" ||
					rowId === "highlighters.addCustom" ||
					rowId.startsWith("highlighters.delete:")
				) {
					shell.rebuild();
					return;
				}
				this.syncShellValues(shell, rows);
			},
			onCancel: () => done(),
		});
		return shell.component;
	}

	// --- Profiles editor ---

	private profilesEditor(done: (v?: string) => void): Component {
		const rows = (): SettingItem[] => {
			const names = this.session.getProfileDraft().listNames();
			const items: SettingItem[] = [
				this.textRow(
					"profiles.description",
					"Profile description",
					"Optional description stored with saved profiles",
					this.profileDescription,
				),
				this.selectRow(
					"profiles.scope",
					"Profile scope",
					"Save the entire appearance, or only the sections selected below",
					this.profileScope,
					["everything", "selected"],
				),
				this.selectRow(
					"profiles.replaceExisting",
					"Replace existing",
					"Explicitly overwrite a profile that already exists",
					String(this.profileReplaceExisting),
					["true", "false"],
				),
				this.selectRow(
					"profiles.includeTheme",
					"Include theme",
					"Store the current theme setting (fixed or automatic pair) in saved profiles",
					String(this.profileIncludeTheme),
					["true", "false"],
				),
			];
			if (this.profileScope === "selected") {
				for (const section of APPEARANCE_SECTIONS) {
					items.push(
						this.selectRow(
							`profileInclude.${section}`,
							`Include ${SECTION_ID_LABELS[section]}`,
							"Store this section in the saved profile; omitted sections stay untouched on load",
							String(this.profileSections[section] === true),
							["true", "false"],
						),
					);
				}
			}
			items.push(
				this.textRow(
					"profiles.saveAs",
					"Save as",
					"Create/replace a named global appearance profile",
					"new-profile",
				),
			);
			for (const name of names) {
				const profile = this.session.getProfileDraft().get(name);
				const themeSummary = profile?.themeSetting
					? profile.themeSetting.mode === "automatic"
						? `auto ${profile.themeSetting.light}/${profile.themeSetting.dark}`
						: profile.themeSetting.theme
					: "appearance only";
				items.push(
					this.selectRow(
						`profiles.apply:${name}`,
						`Load ${name}`,
						`Theme: ${themeSummary}${profile?.description ? ` — ${profile.description}` : ""}`,
						"preview",
						["preview", "delete"],
					),
					this.textRow(
						`profiles.editDescription:${name}`,
						`Describe ${name}`,
						"Update the staged profile description",
						profile?.description ?? "",
					),
					this.textRow(`profiles.rename:${name}`, `Rename ${name}`, "Rename profile with collision checks", name),
					this.textRow(
						`profiles.duplicate:${name}`,
						`Duplicate ${name}`,
						"Duplicate profile under a new name",
						`${name}-copy`,
					),
				);
			}
			return items;
		};
		const shell = this.makeShell({
			breadcrumb: ["Appearance", "Profiles"],
			rows,
			onChange: (rowId, value) => {
				this.handleFieldChange(rowId, value);
				if (
					rowId === "profiles.scope" ||
					rowId === "profiles.saveAs" ||
					rowId.startsWith("profiles.apply:") ||
					rowId.startsWith("profiles.rename:") ||
					rowId.startsWith("profiles.duplicate:")
				) {
					shell.rebuild();
					return;
				}
				this.syncShellValues(shell, rows);
			},
			onCancel: () => done(),
		});
		return shell.component;
	}

	// --- Import / export editor ---

	private bundleJson(): string {
		const themeSetting = this.session.getThemeSetting();
		const names = themeSetting.mode === "automatic" ? [themeSetting.light, themeSetting.dark] : [themeSetting.theme];
		const themes = [...new Set(names)]
			.map((name) => this.themeDraft.getThemeData(name))
			.filter((value): value is NonNullable<typeof value> => Boolean(value));
		const profiles = this.session
			.getProfileDraft()
			.listNames()
			.map((name) => this.session.getProfileDraft().get(name))
			.filter((profile): profile is AppearanceProfileV2 => Boolean(profile));
		return (
			exportBundle({
				version: 2,
				name: this.bundleMeta.name,
				description: this.bundleMeta.description || undefined,
				author: this.bundleMeta.author || undefined,
				themeSetting,
				themes: themes.length ? themes : undefined,
				appearance: { ...structuredClone(this.draft), version: 2 },
				profiles: profiles.length ? profiles : undefined,
			}).json ?? ""
		);
	}

	private bundleSummary(bundle: AppearanceBundleV2): string {
		const parts: string[] = [];
		parts.push(bundle.appearance ? "appearance sections: staged" : "appearance: none");
		const themes = bundle.themes ?? [];
		parts.push(`themes: ${themes.length ? themes.map((t) => String(t.name)).join(", ") : "none"}`);
		const profiles = bundle.profiles ?? [];
		parts.push(`profiles: ${profiles.length ? profiles.map((p) => p.name).join(", ") : "none"}`);
		if (bundle.themeSetting) {
			parts.push(
				bundle.themeSetting.mode === "automatic"
					? `theme setting: auto ${bundle.themeSetting.light}/${bundle.themeSetting.dark}`
					: `theme setting: ${bundle.themeSetting.theme}`,
			);
		}
		if (bundle.name) parts.push(`name: ${bundle.name}`);
		return parts.join(" · ");
	}

	private beginBundleImport(json: string): void {
		const imported = importBundle(json);
		if (!imported.success || !imported.bundle) {
			this.themeError = imported.error ?? "invalid appearance bundle";
			this.refreshItems();
			return;
		}
		const bundle = imported.bundle;
		const themeDraft = this.session.getThemeDraft();
		const themeCollisions: string[] = [];
		for (const embedded of bundle.themes ?? []) {
			const embeddedName = typeof embedded.name === "string" && embedded.name ? embedded.name : "imported-theme";
			if (themeDraft.listThemes().includes(embeddedName)) themeCollisions.push(embeddedName);
		}
		const profileDraft = this.session.getProfileDraft();
		const profileCollisions: string[] = (bundle.profiles ?? [])
			.map((profile) => profile.name)
			.filter((name) => profileDraft.exists(name));
		this.pendingBundleImport = {
			bundle,
			themeCollisions,
			profileCollisions,
			themeResolutions: {},
			profileResolutions: {},
		};
		this.themeError = null;
		this.bundleShell?.rebuild();
	}

	private stageBundle(
		bundle: AppearanceBundleV2,
		themeResolutions: Record<string, "replace" | "skip">,
		profileResolutions: Record<string, "replace" | "skip">,
	): void {
		const themeDraft = this.session.getThemeDraft();
		for (const embedded of bundle.themes ?? []) {
			const embeddedName = typeof embedded.name === "string" && embedded.name ? embedded.name : "imported-theme";
			const collision = themeDraft.listThemes().includes(embeddedName);
			if (collision && themeResolutions[embeddedName] !== "replace") continue;
			const themeResult = themeDraft.importTheme(embeddedName, JSON.stringify(embedded), {
				replace: collision,
			});
			if (!themeResult.success) {
				this.themeError = themeResult.error ?? "theme import failed";
				this.refreshItems();
				return;
			}
			this.selectedTheme = themeDraft.getSelectedName();
			this.previewThemeDraft();
		}
		const profileDraft = this.session.getProfileDraft();
		for (const profile of bundle.profiles ?? []) {
			const collision = profileDraft.exists(profile.name);
			if (collision && profileResolutions[profile.name] !== "replace") continue;
			const result = profileDraft.save(profile, { replace: collision });
			if (!result.success) {
				this.themeError = result.error ?? "profile import failed";
				this.refreshItems();
				return;
			}
		}
		if (bundle.appearance) {
			const merged = applyProfileToAppearance(
				{ version: 2, name: bundle.name ?? "imported", appearance: bundle.appearance },
				this.draft,
			);
			this.draft = merged;
			const result = this.session.previewAppearance(this.draft);
			if (!result.valid) {
				this.themeError = result.issues.map((issue) => `${issue.path}: ${issue.message}`).join("; ");
				this.refreshItems();
				return;
			}
		}
		if (bundle.themeSetting?.mode === "fixed") {
			this.session.setFixedTheme(bundle.themeSetting.theme);
			this.selectedTheme = this.session.getSelectedTheme();
			this.previewThemeDraft();
		} else if (bundle.themeSetting?.mode === "automatic") {
			this.session.setThemeMode("automatic");
			this.session.setAutomaticMember("light", bundle.themeSetting.light);
			this.session.setAutomaticMember("dark", bundle.themeSetting.dark);
			this.selectedTheme = this.session.getSelectedTheme();
			this.previewThemeDraft();
		}
		this.emit();
	}

	private importExportEditor(done: (v?: string) => void): Component {
		const rows = (): SettingItem[] => {
			const items: SettingItem[] = [
				this.textRow("bundle.name", "Bundle name", "Metadata stored in exported bundles", this.bundleMeta.name),
				this.textRow(
					"bundle.description",
					"Bundle description",
					"Optional bundle metadata",
					this.bundleMeta.description,
				),
				this.textRow("bundle.author", "Bundle author", "Optional bundle metadata", this.bundleMeta.author),
				this.longTextRow(
					"bundle.export",
					"Export bundle JSON",
					"Open prefilled validated data-only bundle for copying",
					this.bundleJson(),
				),
				this.textRow(
					"bundle.import",
					"Import bundle JSON",
					"Paste a versioned data-only bundle; preview only until root Apply",
					"",
				),
				this.selectRow(
					"bundle.resetDefaults",
					"Reset appearance defaults",
					"Preview built-in appearance defaults",
					"keep",
					["keep", "reset"],
				),
			];
			if (this.pendingBundleImport) {
				const pending = this.pendingBundleImport;
				const collisionNote =
					pending.themeCollisions.length + pending.profileCollisions.length
						? ` · collisions: ${[...pending.themeCollisions, ...pending.profileCollisions].join(", ")}`
						: "";
				items.push(
					this.selectRow(
						"bundle.importConfirm",
						"Stage import",
						`${this.bundleSummary(pending.bundle)}${collisionNote}`,
						"review",
						["review", "stage", "cancel"],
					),
				);
				for (const name of pending.themeCollisions) {
					items.push(
						this.selectRow(
							`bundle.themeCollision:${name}`,
							`Theme "${name}" exists`,
							"Replace the existing custom theme or skip it (built-ins cannot be replaced)",
							"skip",
							["skip", "replace"],
						),
					);
				}
				for (const name of pending.profileCollisions) {
					items.push(
						this.selectRow(
							`bundle.profileCollision:${name}`,
							`Profile "${name}" exists`,
							"Replace the existing profile or skip it",
							"skip",
							["skip", "replace"],
						),
					);
				}
			}
			return items;
		};
		const shell = this.makeShell({
			breadcrumb: ["Appearance", "Import / export"],
			rows,
			onChange: (rowId, value) => {
				this.handleFieldChange(rowId, value);
				if (rowId === "bundle.importConfirm" && (value === "stage" || value === "cancel")) {
					shell.rebuild();
					this.emit();
					return;
				}
				this.syncShellValues(shell, rows);
			},
			onCancel: () => done(),
		});
		this.bundleShell = shell;
		return shell.component;
	}

	// --- Theme editor (plan 11) ---

	private previewThemeDraft(): void {
		try {
			this.callbacks.onThemePreview?.(this.themeDraft.createPreviewTheme(), this.selectedTheme);
			this.preview.setAppearance(this.draft);
		} catch (error) {
			this.themeError = error instanceof Error ? error.message : String(error);
		}
	}

	private cloneCandidate(): string {
		const base = this.selectedTheme.replace(/-custom(\d*)$/, "");
		let candidate = `${base}-custom`;
		let n = 2;
		while (this.themeDraft.listThemes().includes(candidate)) candidate = `${base}-custom${n++}`;
		return candidate;
	}

	private themeValueChoices(current: string): string[] {
		const presets = [
			"#ffffff",
			"#000000",
			"#8abeb7",
			"#5f87ff",
			"#b5bd68",
			"#cc6666",
			"#ffff00",
			"#808080",
			"#d4d4d4",
			"0",
			"8",
			"15",
		];
		if (presets.includes(current)) return presets;
		return [current, ...presets];
	}

	/** Token rows for one semantic group (value select + exact text + reset). */
	private themeTokenGroupRows(groupName: string): SettingItem[] {
		const rows: SettingItem[] = [];
		let data: ReturnType<ThemeDraftSession["getThemeData"]>;
		try {
			data = this.themeDraft.getThemeData(this.selectedTheme);
		} catch {
			return [];
		}
		const colors = data.colors as Record<string, unknown>;
		for (const token of THEME_TOKEN_GROUPS[groupName] ?? []) {
			if (!(token in colors)) continue;
			const current = String(colors[token]);
			rows.push(
				this.selectRow(
					`theme.token:${token}`,
					token,
					`Current ${current}`,
					current,
					this.themeValueChoices(current),
				),
				this.textRow(
					`theme.tokenText:${token}`,
					`Exact ${token}`,
					"Native value: hex, 0-255 terminal index, or theme variable reference",
					current,
				),
				this.selectRow(`theme.reset:${token}`, `Reset ${token}`, "Reset from clone base", "keep", [
					"keep",
					"reset",
				]),
			);
		}
		return rows;
	}

	/** Variable screen rows: add, edit, rename, delete, with reference info. */
	private themeVariableRows(): SettingItem[] {
		const rows: SettingItem[] = [
			this.textRow(
				"theme.varAdd",
				"Add variable",
				"Create a theme variable (letters, digits, dash, underscore)",
				"",
			),
		];
		let data: ReturnType<ThemeDraftSession["getThemeData"]>;
		try {
			data = this.themeDraft.getThemeData(this.selectedTheme);
		} catch {
			return rows;
		}
		for (const [name, value] of Object.entries(data.vars ?? {})) {
			const refs = this.themeDraft.variableReferences(name);
			rows.push(
				this.textRow(
					`theme.var:${name}`,
					`Variable ${name}`,
					refs.length
						? `Referenced by: ${refs.join(", ")} — value: ${String(value)}`
						: "No references — value: hex, terminal index, or another variable",
					String(value),
				),
				this.textRow(`theme.varRename:${name}`, `Rename ${name}`, "Rename and rewrite exact references", name),
				this.selectRow(`theme.varDelete:${name}`, `Delete ${name}`, "Fails while references remain", "keep", [
					"keep",
					"delete",
				]),
			);
		}
		return rows;
	}

	private themeEditor(done: (v?: string) => void): Component {
		const rows = (): SettingItem[] => {
			const setting = this.session.getThemeSetting();
			const themes = this.themeDraft.listThemes();
			const items: SettingItem[] = [
				this.selectRow("theme.mode", "Mode", "Fixed theme, or automatic light/dark pair", setting.mode, [
					"fixed",
					"automatic",
				]),
			];
			if (setting.mode === "fixed") {
				items.push(
					this.selectRow(
						"theme.select",
						"Theme",
						"Preview only; root Apply persists selection and edits",
						this.selectedTheme,
						themes,
					),
				);
			} else {
				items.push(
					this.selectRow(
						"theme.light",
						"Light theme",
						"Used when the terminal reports a light background",
						setting.light,
						themes,
					),
					this.selectRow(
						"theme.dark",
						"Dark theme",
						"Used when the terminal reports a dark background",
						setting.dark,
						themes,
					),
					this.selectRow(
						"theme.previewSide",
						"Preview side",
						"Which member of the pair to preview/edit",
						this.session.getPreviewSide(),
						["terminal", "light", "dark"],
					),
				);
			}
			items.push(
				this.textRow(
					"theme.clone",
					"Clone as custom",
					"Destination name for a staged editable clone (no file until Apply)",
					this.cloneCandidate(),
				),
				this.textRow(
					"theme.importJson",
					"Import theme JSON",
					"Stage a native theme JSON object; collisions resolve explicitly",
					"",
				),
				this.longTextRow(
					"theme.exportJson",
					"Export selected theme JSON",
					"Open prefilled native theme JSON for copying",
					this.themeDraft.exportSelected().json ?? "",
				),
			);
			if (this.pendingThemeImport) {
				items.push(
					this.selectRow(
						"theme.importResolve",
						`Import "${this.pendingThemeImport.name}"`,
						"Name already exists: replace the custom theme or cancel",
						"choose",
						["choose", "replace", "cancel"],
					),
					this.textRow(
						"theme.importRename",
						"Rename incoming",
						"Import under a new name instead of replacing",
						`${this.pendingThemeImport.name}-imported`,
					),
				);
			}
			if (this.themeDraft.isEditable(this.selectedTheme)) {
				items.push(
					this.textRow(
						"theme.rename",
						"Rename custom theme",
						"Stage rename with collision checks",
						this.selectedTheme,
					),
					this.selectRow(
						"theme.resetAll",
						"Reset custom theme",
						"Reset from clone base (dark for legacy custom themes)",
						"keep",
						["keep", "reset"],
					),
					this.selectRow(
						"theme.delete",
						"Delete custom theme",
						"Stage deletion; root Cancel restores it",
						"keep",
						["keep", "confirm-delete"],
					),
				);
			}
			for (const group of Object.keys(THEME_TOKEN_GROUPS)) {
				items.push({
					id: `theme.group:${group}`,
					label: `Tokens: ${group}`,
					description: `Edit ${THEME_TOKEN_GROUPS[group].length} semantic tokens in the ${group} group`,
					currentValue: "edit",
					submenu: (_current, groupDone) => {
						const groupRows = (): SettingItem[] => this.themeTokenGroupRows(group);
						const groupShell = this.makeShell({
							breadcrumb: ["Appearance", "Theme", group],
							rows: groupRows,
							onChange: (rowId, value) => {
								this.handleThemeChange(rowId, value);
								this.syncShellValues(groupShell, groupRows);
							},
							onCancel: () => groupDone(),
						});
						return groupShell.component;
					},
				});
			}
			items.push({
				id: "theme.group:variables",
				label: "Variables",
				description: "Add, edit, rename, and delete theme variables safely",
				currentValue: "edit",
				submenu: (_current, groupDone) => {
					const groupRows = (): SettingItem[] => this.themeVariableRows();
					const groupShell = this.makeShell({
						breadcrumb: ["Appearance", "Theme", "Variables"],
						rows: groupRows,
						onChange: (rowId, value) => {
							this.handleThemeChange(rowId, value);
							if (
								rowId === "theme.varAdd" ||
								rowId.startsWith("theme.varRename:") ||
								rowId.startsWith("theme.varDelete:")
							) {
								groupShell.rebuild();
								return;
							}
							this.syncShellValues(groupShell, groupRows);
						},
						onCancel: () => groupDone(),
					});
					return groupShell.component;
				},
			});
			return items;
		};
		const shell = this.makeShell({
			breadcrumb: ["Appearance", "Theme"],
			rows,
			onChange: (rowId, value) => {
				this.handleThemeChange(rowId, value);
				// Structural theme operations rebuild the whole screen below.
				this.syncShellValues(shell, rows);
			},
			onCancel: () => done(),
		});
		this.themeShell = shell;
		return shell.component;
	}

	private handleThemeChange(rowId: string, value: string): void {
		this.themeError = null;
		const structural = (): void => {
			this.themeShell?.rebuild();
		};
		if (rowId === "theme.mode") {
			this.session.setThemeMode(value === "automatic" ? "automatic" : "fixed");
			this.selectedTheme = this.session.getSelectedTheme();
			this.previewThemeDraft();
			structural();
			return;
		}
		if (rowId === "theme.light" || rowId === "theme.dark") {
			this.session.setAutomaticMember(rowId === "theme.light" ? "light" : "dark", value);
			this.selectedTheme = this.session.getSelectedTheme();
			this.previewThemeDraft();
			return;
		}
		if (rowId === "theme.previewSide") {
			this.session.setPreviewSide(value as ThemePreviewSide);
			this.selectedTheme = this.session.getSelectedTheme();
			this.previewThemeDraft();
			structural();
			return;
		}
		if (rowId === "theme.select") {
			const result = this.themeDraft.select(value);
			if (!result.success) this.themeError = result.error ?? "theme not found";
			else {
				this.selectedTheme = this.themeDraft.getSelectedName();
				this.previewThemeDraft();
			}
			structural();
			return;
		}
		if (rowId === "theme.exportJson") return;
		if (rowId === "theme.importJson") {
			try {
				const raw = JSON.parse(value) as { name?: unknown };
				const name = typeof raw.name === "string" && raw.name.trim() ? raw.name.trim() : "imported-theme";
				if (this.themeDraft.listThemes().includes(name)) {
					this.pendingThemeImport = { name, json: value };
					structural();
					return;
				}
				const result = this.themeDraft.importTheme(name, value);
				if (!result.success) this.themeError = result.error ?? "theme import failed";
				else {
					this.selectedTheme = this.themeDraft.getSelectedName();
					this.previewThemeDraft();
				}
			} catch (error) {
				this.themeError = error instanceof Error ? error.message : String(error);
			}
			structural();
			return;
		}
		if (rowId === "theme.importResolve" && this.pendingThemeImport) {
			const pending = this.pendingThemeImport;
			if (value === "replace") {
				const result = this.themeDraft.importTheme(pending.name, pending.json, { replace: true });
				if (!result.success) this.themeError = result.error ?? "theme import failed";
				else {
					this.pendingThemeImport = null;
					this.selectedTheme = this.themeDraft.getSelectedName();
					this.previewThemeDraft();
				}
			} else if (value === "cancel") {
				this.pendingThemeImport = null;
			}
			structural();
			return;
		}
		if (rowId === "theme.importRename" && this.pendingThemeImport) {
			const pending = this.pendingThemeImport;
			const result = this.themeDraft.importTheme(value.trim(), pending.json);
			if (!result.success) this.themeError = result.error ?? "theme import failed";
			else {
				this.pendingThemeImport = null;
				this.selectedTheme = this.themeDraft.getSelectedName();
				this.previewThemeDraft();
			}
			structural();
			return;
		}
		if (rowId === "theme.rename") {
			const result = this.themeDraft.renameSelected(value.trim());
			if (!result.success) this.themeError = result.error ?? "rename failed";
			else {
				this.selectedTheme = this.themeDraft.getSelectedName();
				this.previewThemeDraft();
			}
			structural();
			return;
		}
		if (rowId === "theme.resetAll" && value === "reset") {
			const result = this.themeDraft.resetSelected();
			if (!result.success) this.themeError = result.error ?? "theme reset failed";
			else this.previewThemeDraft();
			structural();
			return;
		}
		if (rowId === "theme.clone") {
			const name = value.trim() || this.cloneCandidate();
			const result = this.themeDraft.cloneSelected(name);
			if (!result.success) this.themeError = result.error ?? "clone failed";
			else {
				this.selectedTheme = this.themeDraft.getSelectedName();
				this.previewThemeDraft();
			}
			structural();
			return;
		}
		if (rowId === "theme.delete") {
			if (value !== "confirm-delete") return;
			const result = this.themeDraft.deleteSelected();
			if (!result.success) this.themeError = result.error ?? "delete failed";
			else {
				this.selectedTheme = this.themeDraft.getSelectedName();
				this.previewThemeDraft();
			}
			structural();
			return;
		}
		if (rowId === "theme.varAdd") {
			const name = value.trim();
			const result = this.themeDraft.setVariable(name, "#000000");
			if (!result.success) this.themeError = result.error ?? "variable create failed";
			else this.previewThemeDraft();
			structural();
			return;
		}
		if (rowId.startsWith("theme.varRename:")) {
			const name = rowId.slice("theme.varRename:".length);
			const result = this.themeDraft.renameVariable(name, value.trim());
			if (!result.success) this.themeError = result.error ?? "variable rename failed";
			else this.previewThemeDraft();
			structural();
			return;
		}
		if (rowId.startsWith("theme.varDelete:")) {
			const name = rowId.slice("theme.varDelete:".length);
			if (value !== "delete") return;
			const result = this.themeDraft.deleteVariable(name);
			if (!result.success) this.themeError = result.error ?? "variable delete failed";
			else this.previewThemeDraft();
			structural();
			return;
		}
		if (rowId.startsWith("theme.var:")) {
			const name = rowId.slice("theme.var:".length);
			const parsed: string | number = /^\d+$/.test(value) ? Number(value) : value;
			if (!isValidThemeColorValue(parsed)) this.themeError = "Invalid variable color value";
			else {
				const result = this.themeDraft.setVariable(name, parsed);
				if (!result.success) this.themeError = result.error ?? "variable update failed";
				else this.previewThemeDraft();
			}
			return;
		}
		if (rowId.startsWith("theme.tokenText:") || rowId.startsWith("theme.token:")) {
			const prefix = rowId.startsWith("theme.tokenText:") ? "theme.tokenText:" : "theme.token:";
			const token = rowId.slice(prefix.length);
			const parsed: string | number = /^\d+$/.test(value) ? Number(value) : value;
			if (!isValidThemeColorValue(parsed)) {
				this.themeError = "Invalid color value";
				return;
			}
			const result = this.themeDraft.setToken(token, parsed);
			if (!result.success) this.themeError = result.error ?? "token update failed";
			else this.previewThemeDraft();
			return;
		}
		if (rowId.startsWith("theme.reset:") && value === "reset") {
			const token = rowId.slice("theme.reset:".length);
			const result = this.themeDraft.resetToken(token);
			if (!result.success) this.themeError = result.error ?? "reset failed";
			else this.previewThemeDraft();
		}
	}
}

// --- Color value helpers (shared by the color editor) ---

function parseHslComponents(value: string): { h: number; s: number; l: number } | null {
	const match = /^hsl\(\s*(\d{1,3}(?:\.\d+)?)\s*,\s*(\d{1,3}(?:\.\d+)?)%\s*,\s*(\d{1,3}(?:\.\d+)?)%\s*\)$/.exec(value);
	if (!match) return null;
	return { h: Number(match[1]), s: Number(match[2]), l: Number(match[3]) };
}

function rgbToHslString(r: number, g: number, b: number): string {
	const rn = r / 255;
	const gn = g / 255;
	const bn = b / 255;
	const max = Math.max(rn, gn, bn);
	const min = Math.min(rn, gn, bn);
	const l = (max + min) / 2;
	let h = 0;
	let s = 0;
	if (max !== min) {
		const delta = max - min;
		s = l > 0.5 ? delta / (2 - max - min) : delta / (max + min);
		if (max === rn) h = ((gn - bn) / delta + (gn < bn ? 6 : 0)) * 60;
		else if (max === gn) h = ((bn - rn) / delta + 2) * 60;
		else h = ((rn - gn) / delta + 4) * 60;
	}
	return `hsl(${Math.round(h)}, ${Math.round(s * 100)}%, ${Math.round(l * 100)}%)`;
}

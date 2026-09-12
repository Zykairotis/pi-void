/**
 * Native appearance data model (v2).
 *
 * A theme remains a semantic color palette. Appearance describes how TUI
 * components use layout, decoration, animation, and formatting. Appearance is
 * global user preference data only: no executable hooks, no file paths, no
 * repository-supplied values.
 *
 * v1 sub-shapes (userMessage, inputBox, thinking) are kept unchanged so the
 * existing presentation code keeps consuming the same objects. New v2 domains
 * default to values that reproduce current ICE rendering; the v1 -> v2
 * migration is deterministic (see appearance-migrate.ts).
 *
 * Footer, shared selector chrome, and subagent chrome are also modeled in v2.
 * Validation fills missing fields with defaults, so older v2 documents remain
 * backward compatible.
 */

import type { ThemeJson } from "../theme/theme.ts";

export type AppearanceTextStyle = "bold" | "italic" | "underline" | "strikethrough" | "inverse";

export type AppearanceBorderStyle =
	| "none"
	| "single"
	| "double"
	| "round"
	| "bold"
	| "single-double"
	| "double-single"
	| "classic"
	| "top-bottom-single"
	| "top-bottom-double"
	| "top-bottom-bold";

/** Input editor borders remain a narrow family matched by the TUI Editor. */
export type AppearanceInputBorderStyle = "none" | "single" | "double" | "round" | "bold";

export type AppearanceColor =
	| { kind: "theme"; token: string }
	| { kind: "custom"; value: string }
	/** Terminal palette index (ANSI 256); lossless, never converted to RGB. */
	| { kind: "terminal-index"; index: number }
	| { kind: "terminal-default" }
	| { kind: "none" };

/**
 * Shared text presentation. `terminal-default` foreground/background and an
 * empty style list mean "no override": the renderer keeps its current
 * built-in styling. This is what keeps v2 defaults pixel-compatible.
 */
export interface TextPresentation {
	foreground: AppearanceColor;
	background: AppearanceColor;
	styles: AppearanceTextStyle[];
}

export type AppearanceTableStyle = "unicode" | "ascii" | "clean" | "clean-top-bottom" | "raw";

export interface IndicatorAppearance {
	frames: string[];
	intervalMs: number;
	reverseMirror: boolean;
	color: AppearanceColor;
}

export interface StatusIndicatorAppearance {
	indicator: IndicatorAppearance;
	label: TextPresentation;
}

export interface UserMessageAppearance {
	format: string;
	styles: AppearanceTextStyle[];
	foreground: AppearanceColor;
	background: AppearanceColor;
	borderStyle: AppearanceBorderStyle;
	borderColor: AppearanceColor;
	paddingX: number;
	paddingY: number;
	fitToContent: boolean;
}

export interface InputBoxAppearance {
	borderStyle: AppearanceInputBorderStyle;
	idleBorderColor: AppearanceColor;
	activeBorderColor: AppearanceColor;
	paddingX: number;
}

export interface AssistantMessageAppearance {
	paddingX: number;
	paddingY: number;
	background: AppearanceColor;
	borderStyle: AppearanceBorderStyle;
	borderColor: AppearanceColor;
}

export interface ThinkingLabelAppearance {
	format: string;
	verbs: string[];
	selection: "cycle" | "random";
}

export interface ThinkingBlockAppearance {
	showByDefault: boolean;
	hiddenLabel: string;
	styles: AppearanceTextStyle[];
	foreground: AppearanceColor;
}

export interface MarkdownHeadingAppearance {
	/** Shared heading presentation applied to every level. */
	base: TextPresentation;
	/** Optional per-level refinements on top of the shared style. */
	overrides: {
		h1?: TextPresentation;
		h2?: TextPresentation;
		h3?: TextPresentation;
		h4?: TextPresentation;
		h5?: TextPresentation;
		h6?: TextPresentation;
	};
}

export interface MarkdownCodeBlockAppearance {
	text: TextPresentation;
	background: AppearanceColor;
	borderStyle: AppearanceBorderStyle;
	borderColor: AppearanceColor;
	paddingX: number;
	paddingY: number;
}

export interface MarkdownQuoteAppearance {
	text: TextPresentation;
	borderStyle: AppearanceBorderStyle;
	borderColor: AppearanceColor;
	paddingX: number;
}

export interface MarkdownAppearance {
	tableStyle: AppearanceTableStyle;
	body: TextPresentation;
	headings: MarkdownHeadingAppearance;
	strong: TextPresentation;
	emphasis: TextPresentation;
	strikethrough: TextPresentation;
	link: TextPresentation;
	linkUrl: TextPresentation;
	inlineCode: TextPresentation;
	codeBlock: MarkdownCodeBlockAppearance;
	quote: MarkdownQuoteAppearance;
	listBullet: TextPresentation;
	horizontalRule: TextPresentation;
}

export interface ToolStateAppearance {
	background: AppearanceColor;
}

export interface ToolAppearance {
	paddingX: number;
	paddingY: number;
	title: TextPresentation;
	output: TextPresentation;
	states: {
		pending: ToolStateAppearance;
		success: ToolStateAppearance;
		error: ToolStateAppearance;
	};
}

export interface BashAppearance {
	borderStyle: AppearanceBorderStyle;
	borderColor: AppearanceColor;
	paddingX: number;
	command: TextPresentation;
	output: TextPresentation;
	status: TextPresentation;
}

export interface DiffAppearance {
	added: TextPresentation;
	removed: TextPresentation;
	context: TextPresentation;
}

export interface SystemCardAppearance {
	borderStyle: AppearanceBorderStyle;
	borderColor: AppearanceColor;
	background: AppearanceColor;
	paddingX: number;
	paddingY: number;
	label: TextPresentation;
	body: TextPresentation;
}

export type FooterFieldId =
	| "cwd"
	| "branch"
	| "session"
	| "usage"
	| "cache"
	| "cost"
	| "context"
	| "provider"
	| "model"
	| "thinking"
	| "extensions";

export interface FooterAppearance {
	order: FooterFieldId[];
	visible: Record<FooterFieldId, boolean>;
	separator: string;
	primary: TextPresentation;
	secondary: TextPresentation;
	extensions: TextPresentation;
}

export interface ChromeAppearance {
	borderStyle: AppearanceBorderStyle;
	borderColor: AppearanceColor;
	selectedForeground: AppearanceColor;
	selectedBackground: AppearanceColor;
	selectedStyles: AppearanceTextStyle[];
	description: TextPresentation;
	hint: TextPresentation;
	scrollbarTrack: AppearanceColor;
	scrollbarThumb: AppearanceColor;
}

export interface SubagentChromeAppearance {
	borderStyle: AppearanceBorderStyle;
	borderColor: AppearanceColor;
	selectedForeground: AppearanceColor;
	selectedBackground: AppearanceColor;
	selectedStyles: AppearanceTextStyle[];
	running: TextPresentation;
	completed: TextPresentation;
	failed: TextPresentation;
	attention: TextPresentation;
	muted: TextPresentation;
}

export interface AppearanceInputHighlighterRule {
	id: string;
	name: string;
	enabled: boolean;
	matcher: {
		kind: "literal";
		pattern: string;
		/** v1 matching was case-sensitive; true preserves that behavior. */
		caseSensitive: boolean;
	};
	styles: AppearanceTextStyle[];
	foreground: AppearanceColor;
	background: AppearanceColor;
	priority: number;
}

export interface AppearanceSettingsV2 {
	version: 2;
	userMessage: UserMessageAppearance;
	assistantMessage: AssistantMessageAppearance;
	inputBox: InputBoxAppearance;
	thinking: {
		indicator: IndicatorAppearance;
		label: ThinkingLabelAppearance;
		block: ThinkingBlockAppearance;
	};
	statusIndicators: {
		working: StatusIndicatorAppearance;
		retry: StatusIndicatorAppearance;
		compaction: StatusIndicatorAppearance;
		branchSummary: StatusIndicatorAppearance;
	};
	markdown: MarkdownAppearance;
	tools: ToolAppearance;
	bash: BashAppearance;
	diff: DiffAppearance;
	systemCards: SystemCardAppearance;
	footer: FooterAppearance;
	chrome: ChromeAppearance;
	subagentChrome: SubagentChromeAppearance;
	inputHighlighters: AppearanceInputHighlighterRule[];
}

/**
 * Typed theme selection. The legacy SettingsManager slash encoding
 * ("light/dark") remains an internal persistence adapter only; the
 * customizer never reasons about automatic mode as an opaque string.
 */
export type AppearanceThemeSetting =
	| { mode: "fixed"; theme: string }
	| { mode: "automatic"; light: string; dark: string };

/**
 * Parse the persisted theme setting string into the typed representation.
 * Returns undefined when the string is not a usable theme setting (missing,
 * empty, or a path-like value that cannot be an automatic pair).
 */
export function parseAppearanceThemeSetting(raw: string | undefined): AppearanceThemeSetting | undefined {
	if (typeof raw !== "string" || raw.length === 0) return undefined;
	const slashIndex = raw.indexOf("/");
	if (slashIndex === -1) {
		return { mode: "fixed", theme: raw };
	}
	if (raw.indexOf("/", slashIndex + 1) !== -1) return undefined;
	const light = raw.slice(0, slashIndex).trim();
	const dark = raw.slice(slashIndex + 1).trim();
	if (!light || !dark) return undefined;
	return { mode: "automatic", light, dark };
}

export function serializeAppearanceThemeSetting(setting: AppearanceThemeSetting): string {
	if (setting.mode === "fixed") return setting.theme;
	return `${setting.light}/${setting.dark}`;
}

export type DeepPartial<T> = T extends (infer U)[]
	? U[]
	: T extends object
		? { [K in keyof T]?: DeepPartial<T[K]> }
		: T;

export interface AppearanceProfileV2 {
	version: 2;
	name: string;
	description?: string;
	themeSetting?: AppearanceThemeSetting;
	appearance?: DeepPartial<AppearanceSettingsV2> & { version: 2 };
}

export interface AppearanceBundleV2 {
	version: 2;
	name?: string;
	description?: string;
	author?: string;
	themeSetting?: AppearanceThemeSetting;
	themes?: ThemeJson[];
	appearance?: DeepPartial<AppearanceSettingsV2> & { version: 2 };
	profiles?: AppearanceProfileV2[];
}

// --- Legacy v1 shapes (kept for the deterministic migration + import paths) ---

export interface AppearanceSettingsV1 {
	version: 1;
	userMessage: UserMessageAppearance;
	inputBox: InputBoxAppearance;
	thinking: {
		indicator: IndicatorAppearance;
		label: ThinkingLabelAppearance;
		block: ThinkingBlockAppearance;
	};
	markdown: {
		tableStyle: AppearanceTableStyle;
	};
	inputHighlighters: {
		id: string;
		name: string;
		enabled: boolean;
		matcher: { kind: "literal"; pattern: string };
		styles: AppearanceTextStyle[];
		foreground: AppearanceColor;
		background: AppearanceColor;
		priority: number;
	}[];
}

export interface AppearanceProfileV1 {
	version: 1;
	name: string;
	description?: string;
	theme?: string;
	appearance: DeepPartial<AppearanceSettingsV1> & { version: 1 };
}

export interface AppearanceBundleV1 {
	version: 1;
	name?: string;
	description?: string;
	author?: string;
	themeName?: string;
	theme?: Record<string, unknown>;
	appearance?: DeepPartial<AppearanceSettingsV1> & { version: 1 };
}

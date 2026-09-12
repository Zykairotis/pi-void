import type { MarkdownTheme } from "@zykairotis/ice-tui";
import { resolveAppearanceColorFn } from "./appearance-resolve.ts";
import type { AppearanceSettingsV2, MarkdownAppearance, TextPresentation } from "./appearance-types.ts";

const STYLE_OPEN: Record<string, string> = {
	bold: "\x1b[1m",
	italic: "\x1b[3m",
	underline: "\x1b[4m",
	strikethrough: "\x1b[9m",
	inverse: "\x1b[7m",
};

const STYLE_CLOSE: Record<string, string> = {
	bold: "\x1b[22m",
	italic: "\x1b[23m",
	underline: "\x1b[24m",
	strikethrough: "\x1b[29m",
	inverse: "\x1b[27m",
};

/**
 * Apply a TextPresentation (foreground + background + styles) to text.
 * terminal-default colors emit reset-only wrappers so the underlying
 * renderer styling shows through; none is transparent.
 */
export function applyTextPresentation(presentation: TextPresentation, text: string): string {
	const fg = resolveAppearanceColorFn(presentation.foreground, "fg");
	const bg = resolveAppearanceColorFn(presentation.background, "bg");
	let styled = bg(fg(text));
	for (const style of presentation.styles) {
		const open = STYLE_OPEN[style];
		const close = STYLE_CLOSE[style];
		if (open && close) styled = `${open}${styled}${close}`;
	}
	return styled;
}

function isNoOverride(presentation: TextPresentation): boolean {
	return (
		presentation.foreground.kind === "terminal-default" &&
		presentation.background.kind === "terminal-default" &&
		presentation.styles.length === 0
	);
}

function composePresentation(base: (text: string) => string, presentation: TextPresentation): (text: string) => string {
	if (isNoOverride(presentation)) return base;
	return (text: string) => base(applyTextPresentation(presentation, text));
}

/** Translate the native Markdown appearance model into the TUI MarkdownTheme. */
export function markdownThemeWithAppearance(base: MarkdownTheme, appearance: MarkdownAppearance): MarkdownTheme {
	return {
		...base,
		heading: (text: string, level?: number) => {
			const key =
				level && level >= 1 && level <= 6
					? (`h${level}` as keyof MarkdownAppearance["headings"]["overrides"])
					: undefined;
			const presentation = (key ? appearance.headings.overrides[key] : undefined) ?? appearance.headings.base;
			return composePresentation((value) => base.heading(value, level), presentation)(text);
		},
		link: composePresentation(base.link, appearance.link),
		linkUrl: composePresentation(base.linkUrl, appearance.linkUrl),
		code: composePresentation(base.code, appearance.inlineCode),
		codeBlock: composePresentation(base.codeBlock, appearance.codeBlock.text),
		codeBlockBorder: (text: string) =>
			resolveAppearanceColorFn(appearance.codeBlock.borderColor, "fg")(base.codeBlockBorder(text)),
		quote: composePresentation(base.quote, appearance.quote.text),
		quoteBorder: (text: string) =>
			resolveAppearanceColorFn(appearance.quote.borderColor, "fg")(base.quoteBorder(text)),
		hr: composePresentation(base.hr, appearance.horizontalRule),
		listBullet: composePresentation(base.listBullet, appearance.listBullet),
		bold: composePresentation(base.bold, appearance.strong),
		italic: composePresentation(base.italic, appearance.emphasis),
		strikethrough: composePresentation(base.strikethrough, appearance.strikethrough),
		codeBlockIndent: " ".repeat(appearance.codeBlock.paddingX),
	};
}

/** Tool card background for a lifecycle state. */
export function toolStateBackground(
	appearance: AppearanceSettingsV2,
	state: "pending" | "success" | "error",
): (text: string) => string {
	return resolveAppearanceColorFn(appearance.tools.states[state].background, "bg");
}

/** Status indicator (spinner + label) color functions for a kind. */
export function statusIndicatorColors(
	appearance: AppearanceSettingsV2,
	kind: keyof AppearanceSettingsV2["statusIndicators"],
): { spinner: (text: string) => string; label: (text: string) => string } {
	const entry = appearance.statusIndicators[kind];
	return {
		spinner: resolveAppearanceColorFn(entry.indicator.color, "fg"),
		label: (text: string) => applyTextPresentation(entry.label, text),
	};
}

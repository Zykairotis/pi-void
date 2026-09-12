import { resolveAppearanceColorFn } from "./appearance-resolve.ts";
import type { AppearanceBorderStyle, AppearanceColor, AppearanceTextStyle } from "./appearance-types.ts";

export interface UserMessagePresentation {
	format: string;
	bold: boolean;
	italic: boolean;
	underline: boolean;
	strikethrough: boolean;
	inverse: boolean;
	borderStyle: AppearanceBorderStyle;
	paddingX: number;
	paddingY: number;
	fitToContent: boolean;
	color: (text: string) => string;
	background: (text: string) => string;
	borderColor: (text: string) => string;
}

export function applyUserMessageFormat(format: string, message: string): string {
	return format.split("{message}").join(message);
}

function identity(text: string): string {
	return text;
}

function styleWrappers(styles: AppearanceTextStyle[]): { prefix: string; suffix: string } {
	let prefix = "";
	let suffix = "";
	for (const style of styles) {
		switch (style) {
			case "bold":
				prefix += "\x1b[1m";
				suffix = `\x1b[22m${suffix}`;
				break;
			case "italic":
				prefix += "\x1b[3m";
				suffix = `\x1b[23m${suffix}`;
				break;
			case "underline":
				prefix += "\x1b[4m";
				suffix = `\x1b[24m${suffix}`;
				break;
			case "strikethrough":
				prefix += "\x1b[9m";
				suffix = `\x1b[29m${suffix}`;
				break;
			case "inverse":
				prefix += "\x1b[7m";
				suffix = `\x1b[27m${suffix}`;
				break;
		}
	}
	return { prefix, suffix };
}

export function resolveUserMessagePresentation(options: {
	format: string;
	styles: AppearanceTextStyle[];
	foreground: AppearanceColor;
	background: AppearanceColor;
	borderStyle: AppearanceBorderStyle;
	borderColor: AppearanceColor;
	paddingX: number;
	paddingY: number;
	fitToContent: boolean;
	themeForeground: (text: string) => string;
	themeBackground: (text: string) => string;
	themeBorder: (text: string) => string;
	customColor: (value: string) => (text: string) => string;
}): UserMessagePresentation {
	const resolve = (color: AppearanceColor, role: "fg" | "bg", fallback: (text: string) => string) => {
		// Legacy caller-supplied functions are fallbacks only. Validated theme
		// and custom colors resolve through the shared resolver so the exact
		// requested token is honored against the live theme.
		if (color.kind === "theme" || color.kind === "custom") return resolveAppearanceColorFn(color, role);
		if (color.kind === "terminal-default") return resolveAppearanceColorFn(color, role);
		if (color.kind === "none") return identity;
		return fallback;
	};

	const { prefix, suffix } = styleWrappers(options.styles);
	const color = (text: string): string => {
		const colored = resolve(options.foreground, "fg", options.themeForeground)(text);
		if (prefix.length === 0) return colored;
		return `${prefix}${colored}${suffix}`;
	};

	return {
		format: options.format,
		bold: options.styles.includes("bold"),
		italic: options.styles.includes("italic"),
		underline: options.styles.includes("underline"),
		strikethrough: options.styles.includes("strikethrough"),
		inverse: options.styles.includes("inverse"),
		borderStyle: options.borderStyle,
		paddingX: options.paddingX,
		paddingY: options.paddingY,
		fitToContent: options.fitToContent,
		color,
		background: resolve(options.background, "bg", options.themeBackground),
		borderColor: resolve(options.borderColor, "fg", options.themeBorder),
	};
}

const HORIZONTAL_BORDERS: Record<string, string> = {
	single: "─",
	double: "═",
	round: "─",
	bold: "━",
	classic: "-",
};

const VERTICAL_BORDERS: Record<string, string> = {
	single: "│",
	double: "║",
	round: "│",
	bold: "┃",
	classic: "|",
};

const CORNER_BORDERS: Record<string, [string, string, string, string]> = {
	single: ["┌", "┐", "└", "┘"],
	double: ["╔", "╗", "╚", "╝"],
	round: ["╭", "╮", "╰", "╯"],
	bold: ["┏", "┓", "┗", "┛"],
	classic: ["+", "+", "+", "+"],
	"single-double": ["┌", "┐", "└", "┘"],
	"double-single": ["╔", "╗", "╚", "╝"],
	"top-bottom-single": ["─", "─", "─", "─"],
	"top-bottom-double": ["═", "═", "═", "═"],
	"top-bottom-bold": ["━", "━", "━", "━"],
};

function isTopBottomOnly(style: AppearanceBorderStyle): boolean {
	return style === "top-bottom-single" || style === "top-bottom-double" || style === "top-bottom-bold";
}

export function renderUserMessageBorder(
	style: AppearanceBorderStyle,
	width: number,
	borderColor: (text: string) => string,
): { top: string | null; bottom: string | null; left: string; right: string } {
	if (style === "none" || width <= 0) {
		return { top: null, bottom: null, left: "", right: "" };
	}
	const safeWidth = Math.max(1, width);
	if (isTopBottomOnly(style)) {
		const glyph = HORIZONTAL_BORDERS[style.replace("top-bottom-", "")] ?? "─";
		const line = borderColor(glyph.repeat(safeWidth));
		return { top: line, bottom: line, left: "", right: "" };
	}
	const horizontal = HORIZONTAL_BORDERS[style] ?? "─";
	const vertical = VERTICAL_BORDERS[style] ?? "│";
	const corners = CORNER_BORDERS[style] ?? CORNER_BORDERS.single;
	const side = borderColor(vertical);
	if (safeWidth < 2) return { top: null, bottom: null, left: side, right: side };
	const top = borderColor(`${corners[0]}${horizontal.repeat(safeWidth - 2)}${corners[1]}`);
	const bottom = borderColor(`${corners[2]}${horizontal.repeat(safeWidth - 2)}${corners[3]}`);
	return { top, bottom, left: side, right: side };
}

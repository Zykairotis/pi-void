import { truncateToWidth, visibleWidth } from "./utils.ts";

/**
 * Shared chrome border families (appearance plan 6.10). Selectors and shared
 * chrome that opt into border rendering use one adapter so a configured
 * family changes every compatible surface consistently.
 */
export type ChromeBorderStyle =
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

interface ChromeBorderGlyphs {
	tl: string;
	tr: string;
	bl: string;
	br: string;
	h: string;
	v: string;
	sides: boolean;
}

const CHROME_BORDER_GLYPHS: Record<ChromeBorderStyle, ChromeBorderGlyphs | null> = {
	none: null,
	single: { tl: "┌", tr: "┐", bl: "└", br: "┘", h: "─", v: "│", sides: true },
	double: { tl: "╔", tr: "╗", bl: "╚", br: "╝", h: "═", v: "║", sides: true },
	round: { tl: "╭", tr: "╮", bl: "╰", br: "╯", h: "─", v: "│", sides: true },
	bold: { tl: "┏", tr: "┓", bl: "┗", br: "┛", h: "━", v: "┃", sides: true },
	"single-double": { tl: "┌", tr: "┐", bl: "╚", br: "╝", h: "─", v: "║", sides: true },
	"double-single": { tl: "╔", tr: "╗", bl: "└", br: "┘", h: "═", v: "│", sides: true },
	classic: { tl: "+", tr: "+", bl: "+", br: "+", h: "-", v: "|", sides: true },
	"top-bottom-single": { tl: "", tr: "", bl: "", br: "", h: "─", v: "", sides: false },
	"top-bottom-double": { tl: "", tr: "", bl: "", br: "", h: "═", v: "", sides: false },
	"top-bottom-bold": { tl: "", tr: "", bl: "", br: "", h: "━", v: "", sides: false },
};

export function chromeBorderGlyphs(style: ChromeBorderStyle): ChromeBorderGlyphs | null {
	return CHROME_BORDER_GLYPHS[style] ?? null;
}

/**
 * Wrap rendered lines with the configured chrome border. Widths below the
 * minimum needed for the requested family return the lines unchanged; every
 * returned line stays within `width` visible columns.
 */
export function applyChromeBorder(
	lines: string[],
	width: number,
	style: ChromeBorderStyle,
	color: (text: string) => string,
): string[] {
	const glyphs = chromeBorderGlyphs(style);
	if (!glyphs || width < 3) return lines;
	const inner = glyphs.sides ? width - 2 : width;
	const bordered: string[] = [];
	bordered.push(color(`${glyphs.tl}${glyphs.h.repeat(inner)}${glyphs.tr}`));
	for (const line of lines) {
		const cell = truncateToWidth(line, inner, "…");
		const padded = `${cell}${" ".repeat(Math.max(0, inner - visibleWidth(cell)))}`;
		bordered.push(glyphs.sides ? `${color(glyphs.v)}${padded}${color(glyphs.v)}` : padded);
	}
	bordered.push(color(`${glyphs.bl}${glyphs.h.repeat(inner)}${glyphs.br}`));
	return bordered;
}

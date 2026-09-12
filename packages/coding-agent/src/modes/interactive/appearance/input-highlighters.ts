import { resolveAppearanceColorDecoration } from "./appearance-resolve.ts";
import type { AppearanceColor, AppearanceInputHighlighterRule, AppearanceTextStyle } from "./appearance-types.ts";

/**
 * Bounded literal input highlighters (F9).
 *
 * Literal matchers only (case-sensitive or insensitive per rule). ANSI styling
 * is applied at render time on plain source text; cursor positions,
 * undo/history, paste, and autocomplete all operate on the unstyled source.
 * Overlap resolves by priority (lower number wins) then rule order; winning
 * rule claims its column range.
 */

export interface HighlightSpan {
	start: number;
	end: number;
	styles: AppearanceTextStyle[];
	foreground: string | null;
	background: string | null;
}

const MAX_RULES = 64;
const MAX_PATTERN_CHARS = 128;
const MAX_MATCHES_PER_RULE = 256;
const MAX_TOTAL_SPANS = 1024;

/**
 * Case-fold a single character code for offset-safe literal comparison.
 * Only ASCII letters fold; other code units compare exactly. This keeps
 * match offsets identical between the source line and the folded form
 * (full-string toLowerCase can change code-unit length, e.g. "İ").
 */
function foldCode(code: number): number {
	if (code >= 65 && code <= 90) return code + 32;
	return code;
}

function matchesFoldedAt(line: string, index: number, pattern: string): boolean {
	for (let i = 0; i < pattern.length; i++) {
		if (foldCode(line.charCodeAt(index + i)) !== foldCode(pattern.charCodeAt(i))) return false;
	}
	return true;
}

/** All indices a literal pattern matches, honoring per-rule case sensitivity. */
function findMatches(line: string, pattern: string, caseSensitive: boolean): number[] {
	if (pattern.length === 0) return [];
	if (caseSensitive) {
		const direct: number[] = [];
		let from = 0;
		while (from <= line.length - pattern.length) {
			const index = line.indexOf(pattern, from);
			if (index === -1) break;
			direct.push(index);
			from = index + pattern.length;
		}
		return direct;
	}
	// Case-insensitive scan with ASCII-only folding; offsets map 1:1.
	const indices: number[] = [];
	for (let i = 0; i + pattern.length <= line.length; i++) {
		if (matchesFoldedAt(line, i, pattern)) indices.push(i);
	}
	return indices;
}

function stylePrefix(styles: AppearanceTextStyle[]): { prefix: string; suffix: string } {
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

function colorToAnsi(color: AppearanceColor, role: "fg" | "bg"): string | null {
	const { prefix } = resolveAppearanceColorDecoration(color, role);
	return prefix || null;
}

export function computeHighlightSpans(line: string, rules: AppearanceInputHighlighterRule[]): HighlightSpan[] {
	const active = rules.filter((rule) => rule.enabled && rule.matcher.kind === "literal").slice(0, MAX_RULES);
	const sorted = [...active].sort((a, b) => a.priority - b.priority);
	const claimed: boolean[] = new Array(line.length).fill(false);
	const spans: HighlightSpan[] = [];
	for (const rule of sorted) {
		if (spans.length >= MAX_TOTAL_SPANS) break;
		const pattern = rule.matcher.pattern;
		if (!pattern || pattern.length > MAX_PATTERN_CHARS) continue;
		const matches = findMatches(line, pattern, rule.matcher.caseSensitive !== false);
		let claimedCount = 0;
		for (const index of matches) {
			if (claimedCount >= MAX_MATCHES_PER_RULE || spans.length >= MAX_TOTAL_SPANS) break;
			claimedCount++;
			let overlaps = false;
			for (let i = index; i < index + pattern.length; i++) {
				if (claimed[i]) {
					overlaps = true;
					break;
				}
			}
			if (!overlaps) {
				for (let i = index; i < index + pattern.length; i++) claimed[i] = true;
				spans.push({
					start: index,
					end: index + pattern.length,
					styles: [...rule.styles],
					foreground: colorToAnsi(rule.foreground, "fg"),
					background: colorToAnsi(rule.background, "bg"),
				});
			}
		}
	}
	return spans.sort((a, b) => a.start - b.start);
}

export interface TextDecorationSpan {
	start: number;
	end: number;
	prefix: string;
	suffix: string;
}

export function spanToDecoration(span: HighlightSpan): TextDecorationSpan {
	const { prefix, suffix } = stylePrefix(span.styles);
	const open = `${span.foreground ?? ""}${span.background ?? ""}`;
	const close = `${span.background ? "\x1b[49m" : ""}${span.foreground ? "\x1b[39m" : ""}`;
	return { start: span.start, end: span.end, prefix: `${open}${prefix}`, suffix: `${suffix}${close}` };
}

export function applyHighlightSpans(line: string, spans: HighlightSpan[]): string {
	if (spans.length === 0) return line;
	let result = "";
	let cursor = 0;
	for (const span of spans) {
		if (span.start < cursor) continue;
		result += line.slice(cursor, span.start);
		const { prefix, suffix } = stylePrefix(span.styles);
		const fgOpen = span.foreground ?? "";
		const bgOpen = span.background ?? "";
		const fgClose = span.foreground ? "\x1b[39m" : "";
		const bgClose = span.background ? "\x1b[49m" : "";
		result += `${fgOpen}${bgOpen}${prefix}${line.slice(span.start, span.end)}${suffix}${fgClose}${bgClose}`;
		cursor = span.end;
	}
	result += line.slice(cursor);
	return result;
}

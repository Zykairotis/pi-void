import type { AppearanceTextStyle, IndicatorAppearance } from "./appearance-types.ts";

/** Deterministic thinking-verb selector (cycle) with optional random mode. */
export class ThinkingVerbSelector {
	private index = 0;
	private readonly verbs: string[];

	constructor(verbs: string[] = []) {
		this.verbs = verbs;
	}

	next(): string {
		if (this.verbs.length === 0) return "Thinking";
		return this.verbs[this.index++ % this.verbs.length] ?? "Thinking";
	}

	randomVerb(random: () => number = Math.random): string {
		if (this.verbs.length === 0) return "Thinking";
		return this.verbs[Math.floor(random() * this.verbs.length)] ?? "Thinking";
	}

	reset(): void {
		this.index = 0;
	}
}

export function applyThinkingVerbFormat(format: string, verb: string): string {
	return format.split("{verb}").join(verb);
}

export function getThinkingIndicatorFrames(appearance: IndicatorAppearance): string[] {
	if (!appearance.reverseMirror) return [...appearance.frames];
	// Ping-pong without duplicated edge frames: [a, b, c] -> [a, b, c, b].
	// Single-frame indicators stay single; two frames alternate.
	const frames = [...appearance.frames];
	if (frames.length <= 1) return frames;
	if (frames.length === 2) return [frames[0], frames[1], frames[0]] as string[];
	const mirrored = frames.slice(1, -1).reverse();
	return [...frames, ...mirrored];
}

export function styleThinkingBlockText(
	text: string,
	styles: AppearanceTextStyle[],
	styleFns: {
		bold: (value: string) => string;
		italic: (value: string) => string;
		underline: (value: string) => string;
		strikethrough: (value: string) => string;
		inverse: (value: string) => string;
	},
): string {
	let styled = text;
	if (styles.includes("bold")) styled = styleFns.bold(styled);
	if (styles.includes("italic")) styled = styleFns.italic(styled);
	if (styles.includes("underline")) styled = styleFns.underline(styled);
	if (styles.includes("strikethrough")) styled = styleFns.strikethrough(styled);
	if (styles.includes("inverse")) styled = styleFns.inverse(styled);
	return styled;
}

/**
 * Custom appearance color support (hex/rgb/hsl -> ANSI).
 *
 * Theme-token colors keep flowing through live theme functions. Only explicit
 * custom colors from validated appearance settings use these wrappers.
 */

function clampByte(n: number): number {
	if (!Number.isFinite(n)) return 0;
	return Math.max(0, Math.min(255, Math.round(n)));
}

function hexToRgb(hex: string): { r: number; g: number; b: number } | null {
	const cleaned = hex.replace("#", "");
	const expanded =
		cleaned.length === 3
			? cleaned
					.split("")
					.map((c) => c + c)
					.join("")
			: cleaned;
	const match = /^([0-9a-fA-F]{6})([0-9a-fA-F]{2})?$/.exec(expanded);
	if (!match) return null;
	return {
		r: parseInt(match[1].slice(0, 2), 16),
		g: parseInt(match[1].slice(2, 4), 16),
		b: parseInt(match[1].slice(4, 6), 16),
	};
}

function rgbStringToRgb(value: string): { r: number; g: number; b: number } | null {
	const match = /^rgb\(\s*(\d{1,3})\s*,\s*(\d{1,3})\s*,\s*(\d{1,3})\s*\)$/.exec(value);
	if (!match) return null;
	const r = Number(match[1]);
	const g = Number(match[2]);
	const b = Number(match[3]);
	if ([r, g, b].some((n) => !Number.isInteger(n) || n < 0 || n > 255)) return null;
	return { r, g, b };
}

function hslStringToRgb(value: string): { r: number; g: number; b: number } | null {
	const match = /^hsl\(\s*(\d{1,3}(?:\.\d+)?)\s*,\s*(\d{1,3}(?:\.\d+)?)%\s*,\s*(\d{1,3}(?:\.\d+)?)%\s*\)$/.exec(value);
	if (!match) return null;
	const h = Number(match[1]);
	const s = Number(match[2]) / 100;
	const l = Number(match[3]) / 100;
	if (h < 0 || h > 360 || s < 0 || s > 1 || l < 0 || l > 1) return null;
	const c = (1 - Math.abs(2 * l - 1)) * s;
	const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
	const m = l - c / 2;
	let r = 0;
	let g = 0;
	let b = 0;
	if (h < 60) {
		r = c;
		g = x;
	} else if (h < 120) {
		r = x;
		g = c;
	} else if (h < 180) {
		g = c;
		b = x;
	} else if (h < 240) {
		g = x;
		b = c;
	} else if (h < 300) {
		r = x;
		b = c;
	} else {
		r = c;
		b = x;
	}
	return { r: clampByte((r + m) * 255), g: clampByte((g + m) * 255), b: clampByte((b + m) * 255) };
}

export function parseCustomColorToRgb(value: string): { r: number; g: number; b: number } | null {
	if (value.startsWith("#")) return hexToRgb(value);
	if (value.startsWith("rgb(")) return rgbStringToRgb(value);
	if (value.startsWith("hsl(")) return hslStringToRgb(value);
	return null;
}

export function customForeground(value: string): (text: string) => string {
	const rgb = parseCustomColorToRgb(value);
	if (!rgb) return (text) => text;
	return (text) => `\x1b[38;2;${rgb.r};${rgb.g};${rgb.b}m${text}\x1b[39m`;
}

export function customBackground(value: string): (text: string) => string {
	const rgb = parseCustomColorToRgb(value);
	if (!rgb) return (text) => text;
	return (text) => `\x1b[48;2;${rgb.r};${rgb.g};${rgb.b}m${text}\x1b[49m`;
}

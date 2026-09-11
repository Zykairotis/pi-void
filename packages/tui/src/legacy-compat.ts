export const ICE_CURSOR_MARKER = "\x1b_ice:c\x07";

export function normalizeCursorMarkers(line: string): string {
	return line;
}

export function getTuiEnv(name: string): string | undefined {
	return process.env[name];
}

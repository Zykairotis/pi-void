import { isThemeBgToken, isThemeColorToken, theme } from "../theme/theme.ts";
import { customBackground, customForeground } from "./appearance-colors.ts";
import type { AppearanceColor } from "./appearance-types.ts";

export type AppearanceColorRole = "fg" | "bg";

/**
 * One shared presentation-level resolver for AppearanceColor (F1).
 *
 * - theme: resolve the exact validated semantic token dynamically against the
 *   live theme, so switching themes updates appearance without rewriting it.
 * - custom: validated HEX/RGB/HSL mapped to ANSI fg/bg functions.
 * - terminal-default: terminal default fg/bg (reset-only wrappers).
 * - none: transparent, no styling.
 *
 * Foreground/background usage stays distinct via `role`.
 */
export function resolveAppearanceColorFn(color: AppearanceColor, role: AppearanceColorRole): (text: string) => string {
	switch (color.kind) {
		case "custom":
			return role === "bg" ? customBackground(color.value) : customForeground(color.value);
		case "theme": {
			if (role === "bg") {
				if (isThemeBgToken(color.token)) {
					const token = color.token;
					return (text: string) => theme.bg(token, text);
				}
				return (text: string) => text;
			}
			if (isThemeColorToken(color.token)) {
				const token = color.token;
				return (text: string) => theme.fg(token, text);
			}
			return (text: string) => text;
		}
		case "terminal-index": {
			const index = color.index;
			return role === "bg"
				? (text: string) => `\x1b[48;5;${index}m${text}\x1b[49m`
				: (text: string) => `\x1b[38;5;${index}m${text}\x1b[39m`;
		}
		case "terminal-default":
			return role === "bg" ? (text: string) => `${text}\x1b[49m` : (text: string) => `${text}\x1b[39m`;
		case "none":
			return (text: string) => text;
	}
}

/** Extract ANSI open/close sequences from the shared color resolver. */
export function resolveAppearanceColorDecoration(
	color: AppearanceColor,
	role: AppearanceColorRole,
): { prefix: string; suffix: string } {
	const sentinel = "\u0000";
	const styled = resolveAppearanceColorFn(color, role)(sentinel);
	const index = styled.indexOf(sentinel);
	if (index < 0) return { prefix: "", suffix: "" };
	return {
		prefix: styled.slice(0, index),
		suffix: styled.slice(index + sentinel.length),
	};
}

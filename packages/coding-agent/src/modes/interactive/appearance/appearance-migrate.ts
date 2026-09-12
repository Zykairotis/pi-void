import { createDefaultAppearance, defaultTextPresentation } from "./appearance-defaults.ts";
import type { AppearanceProfileV2, AppearanceSettingsV2, IndicatorAppearance } from "./appearance-types.ts";

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}

/**
 * Deterministic v1 -> v2 migration.
 *
 * Every v1 value maps to the corresponding v2 field. New v2 domains receive
 * defaults that reproduce current ICE rendering. The working status indicator
 * copies the v1 thinking indicator so a customized v1 spinner survives the
 * migration unchanged.
 */
export function migrateAppearanceV1ToV2(value: unknown): AppearanceSettingsV2 {
	const v2 = createDefaultAppearance();
	if (!isRecord(value)) return v2;

	const userMessage = isRecord(value.userMessage) ? value.userMessage : undefined;
	if (userMessage)
		v2.userMessage = { ...v2.userMessage, ...(structuredClone(userMessage) as unknown as typeof v2.userMessage) };

	const inputBox = isRecord(value.inputBox) ? value.inputBox : undefined;
	if (inputBox) v2.inputBox = { ...v2.inputBox, ...(structuredClone(inputBox) as unknown as typeof v2.inputBox) };

	const thinking = isRecord(value.thinking) ? value.thinking : undefined;
	if (thinking) {
		const indicator = isRecord(thinking.indicator) ? thinking.indicator : undefined;
		if (indicator) {
			v2.thinking.indicator = structuredClone(indicator) as unknown as IndicatorAppearance;
			// Preserve a customized working spinner across the migration.
			v2.statusIndicators.working = {
				indicator: structuredClone(indicator) as unknown as IndicatorAppearance,
				label: defaultTextPresentation(),
			};
		}
		const label = isRecord(thinking.label) ? thinking.label : undefined;
		if (label)
			v2.thinking.label = {
				...v2.thinking.label,
				...(structuredClone(label) as unknown as typeof v2.thinking.label),
			};
		const block = isRecord(thinking.block) ? thinking.block : undefined;
		if (block)
			v2.thinking.block = {
				...v2.thinking.block,
				...(structuredClone(block) as unknown as typeof v2.thinking.block),
			};
	}

	const markdown = isRecord(value.markdown) ? value.markdown : undefined;
	if (markdown && typeof markdown.tableStyle === "string") {
		v2.markdown.tableStyle = markdown.tableStyle as typeof v2.markdown.tableStyle;
	}

	const highlighters = value.inputHighlighters;
	if (Array.isArray(highlighters)) {
		v2.inputHighlighters = highlighters.map((entry) => {
			const rule = structuredClone(entry) as unknown as AppearanceSettingsV2["inputHighlighters"][number];
			// v1 matching was case-sensitive.
			rule.matcher = { kind: "literal", pattern: rule.matcher.pattern, caseSensitive: true };
			return rule;
		});
	}

	return v2;
}

/**
 * Legacy v1 profile data is migrated on import. The appearance payload stays
 * a partial so loading a profile merges onto the current draft instead of
 * resetting unwritten sections to defaults. v1 highlighter rules gain the
 * explicit caseSensitive flag (v1 matching was case-sensitive).
 */
export function migrateProfileV1ToV2(profile: {
	name: string;
	description?: string;
	theme?: string;
	appearance?: unknown;
	themeSetting?: unknown;
}): AppearanceProfileV2 {
	const result: AppearanceProfileV2 = { version: 2, name: profile.name };
	if (profile.description !== undefined) result.description = profile.description;
	if (typeof profile.theme === "string" && profile.theme.length > 0) {
		// Preserve plain v1 theme names as a fixed theme setting. Slash-encoded
		// automatic pairs ("light/dark") stay opaque here; typed automatic
		// settings are represented directly as themeSetting payloads.
		result.themeSetting = { mode: "fixed", theme: profile.theme };
	}
	if (profile.themeSetting !== undefined) {
		const setting = profile.themeSetting as AppearanceProfileV2["themeSetting"];
		if (
			setting !== null &&
			typeof setting === "object" &&
			((setting as { mode?: unknown }).mode === "fixed" || (setting as { mode?: unknown }).mode === "automatic")
		) {
			result.themeSetting = structuredClone(setting);
		}
	}
	if (isRecord(profile.appearance)) {
		const { version: _version, ...partial } = structuredClone(profile.appearance);
		const highlighters = partial.inputHighlighters;
		if (Array.isArray(highlighters)) {
			for (const rule of highlighters) {
				if (isRecord(rule) && isRecord(rule.matcher) && rule.matcher.caseSensitive === undefined) {
					rule.matcher.caseSensitive = true;
				}
			}
		}
		result.appearance = { ...partial, version: 2 } as AppearanceProfileV2["appearance"];
	}
	return result;
}

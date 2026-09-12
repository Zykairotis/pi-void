import { existsSync, mkdirSync, readdirSync, readFileSync, renameSync, unlinkSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { getAgentDir } from "../../../config.ts";
import { parseThemeJsonData, type ThemeJson } from "../theme/theme.ts";
import { createDefaultAppearance } from "./appearance-defaults.ts";
import { migrateProfileV1ToV2 } from "./appearance-migrate.ts";
import type {
	AppearanceBundleV2,
	AppearanceProfileV2,
	AppearanceSettingsV2,
	AppearanceThemeSetting,
	DeepPartial,
} from "./appearance-types.ts";
import { validateAppearance } from "./appearance-validate.ts";

export interface ProfileResult {
	success: boolean;
	error?: string;
}

/** Legacy v1 profile payload accepted on the save path for migration compatibility. */
type AppearanceProfileV1Shim = {
	version: 1;
	name: string;
	description?: string;
	theme?: string;
	appearance?: unknown;
};

function profilesDir(): string {
	return join(getAgentDir(), "appearance-profiles");
}

function profilePath(name: string): string {
	return join(profilesDir(), `${name}.json`);
}

function validateProfileName(name: string): string | null {
	if (!name || name.trim().length === 0) return "profile name must not be empty";
	if (name.length > 64) return "profile name is too long";
	if (!/^[A-Za-z0-9][A-Za-z0-9_-]*$/.test(name)) return "profile name must use letters, digits, dash, or underscore";
	return null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}

/**
 * Deep-merge a partial v2 appearance payload onto a full v2 base. Arrays
 * (frames, verbs, highlighter rules) are replaced wholesale; objects merge
 * recursively; scalars override when present.
 */
export function mergeAppearancePartial(base: AppearanceSettingsV2, partial: unknown): AppearanceSettingsV2 {
	if (!isRecord(partial)) return structuredClone(base);
	function deepMerge(target: Record<string, unknown>, patch: Record<string, unknown>): Record<string, unknown> {
		const result: Record<string, unknown> = { ...target };
		for (const [key, value] of Object.entries(patch)) {
			if (value === undefined) continue;
			const current = result[key];
			if (Array.isArray(value) || !isRecord(value) || !isRecord(current)) {
				result[key] = structuredClone(value);
			} else {
				result[key] = deepMerge(current, value);
			}
		}
		return result;
	}
	const { version: _version, ...rest } = partial;
	const merged = deepMerge(structuredClone(base) as unknown as Record<string, unknown>, rest);
	return validateAppearance(merged).appearance;
}

export function validateThemeSetting(
	setting: unknown,
	availableThemes: readonly string[],
): { valid: boolean; setting?: AppearanceThemeSetting; error?: string } {
	if (!isRecord(setting) || typeof setting.mode !== "string") {
		return { valid: false, error: "theme setting must be fixed or automatic" };
	}
	if (setting.mode === "fixed") {
		if (typeof setting.theme !== "string" || setting.theme.length === 0) {
			return { valid: false, error: "fixed theme setting needs a theme name" };
		}
		if (!availableThemes.includes(setting.theme)) {
			return { valid: false, error: `Theme "${setting.theme}" is not available` };
		}
		return { valid: true, setting: { mode: "fixed", theme: setting.theme } };
	}
	if (setting.mode === "automatic") {
		if (typeof setting.light !== "string" || typeof setting.dark !== "string" || !setting.light || !setting.dark) {
			return { valid: false, error: "automatic theme setting needs light and dark theme names" };
		}
		for (const member of [setting.light, setting.dark]) {
			if (!availableThemes.includes(member)) {
				return { valid: false, error: `Theme "${member}" is not available` };
			}
		}
		return { valid: true, setting: { mode: "automatic", light: setting.light, dark: setting.dark } };
	}
	return { valid: false, error: `unknown theme setting mode "${setting.mode}"` };
}

export function listProfiles(): string[] {
	try {
		if (!existsSync(profilesDir())) return [];
		return readdirSync(profilesDir())
			.filter((file) => file.endsWith(".json"))
			.map((file) => file.slice(0, -".json".length))
			.sort();
	} catch {
		return [];
	}
}

/**
 * Read a profile file as v2. v1 profiles are migrated transparently so the
 * library stays usable across the version bump.
 */
export function readProfile(name: string): AppearanceProfileV2 {
	const raw = JSON.parse(readFileSync(profilePath(name), "utf-8")) as unknown;
	if (!isRecord(raw) || typeof raw.name !== "string") {
		throw new Error(`Invalid profile "${name}"`);
	}
	if (raw.version === 1) {
		return migrateProfileV1ToV2(raw as unknown as { name: string; description?: string; theme?: string });
	}
	if (raw.version !== 2) {
		throw new Error(`Unsupported profile version in "${name}"`);
	}
	return raw as unknown as AppearanceProfileV2;
}

export function saveProfile(profile: AppearanceProfileV2 | AppearanceProfileV1Shim, overwrite = false): ProfileResult {
	const normalized: AppearanceProfileV2 =
		profile.version === 1
			? migrateProfileV1ToV2(profile as AppearanceProfileV1Shim & { appearance?: unknown })
			: (profile as AppearanceProfileV2);
	const nameError = validateProfileName(normalized.name);
	if (nameError) return { success: false, error: nameError };
	if (!overwrite && existsSync(profilePath(normalized.name)))
		return { success: false, error: `Profile "${normalized.name}" already exists` };
	if (normalized.appearance) {
		const check = validateAppearancePartial(normalized.appearance);
		if (!check.valid) {
			return { success: false, error: `invalid appearance in profile: ${check.issues.join("; ")}` };
		}
	}
	if (normalized.themeSetting !== undefined) {
		const check = validateThemeSetting(normalized.themeSetting, []);
		// Availability depends on the installed library at apply time; only the
		// shape is validated here. A fixed member that parses is acceptable.
		if (!check.valid && !check.error?.includes("is not available")) return { success: false, error: check.error };
	}
	try {
		mkdirSync(profilesDir(), { recursive: true });
		const tmpPath = `${profilePath(normalized.name)}.tmp`;
		writeFileSync(tmpPath, `${JSON.stringify(normalized, null, 2)}\n`, "utf-8");
		renameSync(tmpPath, profilePath(normalized.name));
		return { success: true };
	} catch (error) {
		return { success: false, error: error instanceof Error ? error.message : String(error) };
	}
}

export function deleteProfile(name: string): ProfileResult {
	try {
		if (!existsSync(profilePath(name))) return { success: false, error: `Profile "${name}" not found` };
		unlinkSync(profilePath(name));
		return { success: true };
	} catch (error) {
		return { success: false, error: error instanceof Error ? error.message : String(error) };
	}
}

export function renameProfile(oldName: string, newName: string): ProfileResult {
	const nameError = validateProfileName(newName);
	if (nameError) return { success: false, error: nameError };
	try {
		if (!existsSync(profilePath(oldName))) return { success: false, error: `Profile "${oldName}" not found` };
		if (existsSync(profilePath(newName))) return { success: false, error: `Profile "${newName}" already exists` };
		const profile = readProfile(oldName);
		const result = saveProfile({ ...profile, name: newName });
		if (!result.success) return result;
		unlinkSync(profilePath(oldName));
		return { success: true };
	} catch (error) {
		return { success: false, error: error instanceof Error ? error.message : String(error) };
	}
}

export function duplicateProfile(sourceName: string, destName: string): ProfileResult {
	const nameError = validateProfileName(destName);
	if (nameError) return { success: false, error: nameError };
	try {
		if (existsSync(profilePath(destName))) return { success: false, error: `Profile "${destName}" already exists` };
		const profile = readProfile(sourceName);
		return saveProfile({ ...profile, name: destName });
	} catch (error) {
		return { success: false, error: error instanceof Error ? error.message : String(error) };
	}
}

/** Merge a v2 (or migrated v1) profile into a current draft. */
export function applyProfileToAppearance(
	profile: AppearanceProfileV2,
	base: AppearanceSettingsV2,
): AppearanceSettingsV2 {
	return mergeAppearancePartial(base, profile.appearance ?? {});
}

const MAX_BUNDLE_BYTES = 256 * 1024;
const MAX_BUNDLE_THEMES = 64;
const MAX_BUNDLE_PROFILES = 256;

/**
 * Validate a stored appearance partial deterministically before save/import.
 *
 * The merge helper intentionally normalizes invalid enum spellings back to
 * defaults, so explicitly-set enum fields are checked against the raw partial
 * first; anything else is validated through the merged v2 value.
 */
export function validateAppearancePartial(partial: unknown): { valid: boolean; issues: string[] } {
	const issues: string[] = [];
	const checkEnum = (value: unknown, allowed: readonly string[], path: string): void => {
		if (value !== undefined && (typeof value !== "string" || !allowed.includes(value))) {
			issues.push(`${path}: expected one of ${allowed.join(", ")}`);
		}
	};
	const BORDER_STYLES = [
		"none",
		"single",
		"double",
		"round",
		"bold",
		"single-double",
		"double-single",
		"classic",
		"top-bottom-single",
		"top-bottom-double",
		"top-bottom-bold",
	];
	const INPUT_BORDER_STYLES = ["none", "single", "double", "round", "bold"];
	const TABLE_STYLES = ["unicode", "ascii", "clean", "clean-top-bottom", "raw"];
	if (isRecord(partial)) {
		const userMessage = isRecord(partial.userMessage) ? partial.userMessage : undefined;
		checkEnum(userMessage?.borderStyle, BORDER_STYLES, "userMessage.borderStyle");
		const assistantMessage = isRecord(partial.assistantMessage) ? partial.assistantMessage : undefined;
		checkEnum(assistantMessage?.borderStyle, BORDER_STYLES, "assistantMessage.borderStyle");
		const inputBox = isRecord(partial.inputBox) ? partial.inputBox : undefined;
		checkEnum(inputBox?.borderStyle, INPUT_BORDER_STYLES, "inputBox.borderStyle");
		const markdown = isRecord(partial.markdown) ? partial.markdown : undefined;
		checkEnum(markdown?.tableStyle, TABLE_STYLES, "markdown.tableStyle");
		const codeBlock = isRecord(markdown?.codeBlock) ? markdown.codeBlock : undefined;
		checkEnum(codeBlock?.borderStyle, BORDER_STYLES, "markdown.codeBlock.borderStyle");
		const quote = isRecord(markdown?.quote) ? markdown.quote : undefined;
		checkEnum(quote?.borderStyle, BORDER_STYLES, "markdown.quote.borderStyle");
		const bash = isRecord(partial.bash) ? partial.bash : undefined;
		checkEnum(bash?.borderStyle, BORDER_STYLES, "bash.borderStyle");
		const systemCards = isRecord(partial.systemCards) ? partial.systemCards : undefined;
		checkEnum(systemCards?.borderStyle, BORDER_STYLES, "systemCards.borderStyle");
	}
	const merged = mergeAppearancePartial(createDefaultAppearance(), partial);
	const validated = validateAppearance(merged);
	for (const issue of validated.issues) issues.push(`${issue.path}: ${issue.message}`);
	return { valid: issues.length === 0, issues };
}

export interface BundleImportResult {
	success: boolean;
	bundle?: AppearanceBundleV2;
	error?: string;
	appearanceIssues?: string[];
}

/**
 * Import a data-only bundle. v1 bundles are migrated (single embedded theme,
 * string theme reference, v1 appearance partial). Returns the v2 bundle; no
 * filesystem or settings writes happen here.
 */
export function importBundle(json: string): BundleImportResult {
	try {
		if (new TextEncoder().encode(json).length > MAX_BUNDLE_BYTES) {
			return { success: false, error: "bundle exceeds 256 KiB" };
		}
		const raw = JSON.parse(json) as unknown;
		if (!isRecord(raw) || (raw.version !== 1 && raw.version !== 2)) {
			return { success: false, error: "unsupported bundle version" };
		}

		let themes: ThemeJson[] | undefined;
		let themeSetting: AppearanceThemeSetting | undefined;
		let appearance: (DeepPartial<AppearanceSettingsV2> & { version: 2 }) | undefined;
		let profiles: AppearanceProfileV2[] | undefined;

		if (raw.version === 1) {
			const v1 = raw as unknown as {
				name?: unknown;
				description?: unknown;
				author?: unknown;
				themeName?: unknown;
				theme?: unknown;
				appearance?: unknown;
			};
			if (v1.theme !== undefined) {
				if (!isRecord(v1.theme)) return { success: false, error: "invalid theme in bundle" };
				try {
					const themeName =
						typeof v1.themeName === "string" && v1.themeName.trim() ? v1.themeName.trim() : "imported-theme";
					themes = [parseThemeJsonData(themeName, structuredClone(v1.theme))];
				} catch (error) {
					return {
						success: false,
						error: `invalid theme in bundle: ${error instanceof Error ? error.message : String(error)}`,
					};
				}
			}
			if (isRecord(v1.appearance)) {
				const check = validateAppearancePartial({ ...v1.appearance, version: 2 });
				if (!check.valid) {
					return { success: false, error: "invalid appearance in bundle", appearanceIssues: check.issues };
				}
				appearance = { ...structuredClone(v1.appearance), version: 2 } as DeepPartial<AppearanceSettingsV2> & {
					version: 2;
				};
			}
			if (typeof v1.themeName === "string" && v1.themeName.trim() && !v1.theme) {
				themeSetting = { mode: "fixed", theme: v1.themeName.trim() };
			}
			const bundle: AppearanceBundleV2 = { version: 2 };
			if (typeof v1.name === "string") bundle.name = v1.name;
			if (typeof v1.description === "string") bundle.description = v1.description;
			if (typeof v1.author === "string") bundle.author = v1.author;
			if (themes) bundle.themes = themes;
			if (themeSetting) bundle.themeSetting = themeSetting;
			if (appearance) bundle.appearance = appearance;
			return { success: true, bundle };
		}

		// v2 bundle
		if (raw.themes !== undefined) {
			if (!Array.isArray(raw.themes)) return { success: false, error: "bundle themes must be a list" };
			if (raw.themes.length > MAX_BUNDLE_THEMES) {
				return { success: false, error: `bundle exceeds ${MAX_BUNDLE_THEMES} themes` };
			}
			themes = [];
			for (const [index, theme] of raw.themes.entries()) {
				try {
					themes.push(parseThemeJsonData(`bundle-themes[${index}]`, structuredClone(theme)));
				} catch (error) {
					return {
						success: false,
						error: `invalid theme at index ${index}: ${error instanceof Error ? error.message : String(error)}`,
					};
				}
			}
		}
		if (raw.themeSetting !== undefined) {
			const check = validateThemeSetting(raw.themeSetting, []);
			if (!check.valid && !check.error?.includes("is not available")) {
				return { success: false, error: check.error };
			}
			themeSetting = check.setting;
		}
		if (raw.appearance !== undefined) {
			const check = validateAppearancePartial(raw.appearance);
			if (!check.valid) {
				return { success: false, error: "invalid appearance in bundle", appearanceIssues: check.issues };
			}
			appearance = structuredClone(raw.appearance) as DeepPartial<AppearanceSettingsV2> & { version: 2 };
		}
		if (raw.profiles !== undefined) {
			if (!Array.isArray(raw.profiles)) return { success: false, error: "bundle profiles must be a list" };
			if (raw.profiles.length > MAX_BUNDLE_PROFILES) {
				return { success: false, error: `bundle exceeds ${MAX_BUNDLE_PROFILES} profiles` };
			}
			profiles = [];
			for (const profile of raw.profiles) {
				const migrated = migrateBundleProfile(profile);
				if (!migrated) return { success: false, error: "bundle contains an invalid profile" };
				profiles.push(migrated);
			}
		}
		const bundle: AppearanceBundleV2 = { version: 2 };
		if (typeof raw.name === "string") bundle.name = raw.name;
		if (typeof raw.description === "string") bundle.description = raw.description;
		if (typeof raw.author === "string") bundle.author = raw.author;
		if (themes) bundle.themes = themes;
		if (themeSetting) bundle.themeSetting = themeSetting;
		if (appearance) bundle.appearance = appearance;
		if (profiles) bundle.profiles = profiles;
		return { success: true, bundle };
	} catch (error) {
		return { success: false, error: error instanceof Error ? error.message : String(error) };
	}
}

function migrateBundleProfile(profile: unknown): AppearanceProfileV2 | undefined {
	if (
		!isRecord(profile) ||
		typeof profile.name !== "string" ||
		profile.name.length === 0 ||
		profile.name.length > 64
	) {
		return undefined;
	}
	if (profile.version === 1) {
		return migrateProfileV1ToV2(profile as unknown as { name: string; description?: string; theme?: string });
	}
	if (profile.version !== 2) return undefined;
	const result = structuredClone(profile) as unknown as AppearanceProfileV2;
	if (result.appearance !== undefined) {
		const check = validateAppearancePartial(result.appearance);
		if (!check.valid) return undefined;
	}
	return result;
}

type AppearanceBundleV1Shim = {
	version: 1;
	name?: string;
	description?: string;
	author?: string;
	themeName?: string;
	theme?: unknown;
	appearance?: unknown;
};

export function exportBundle(bundle: AppearanceBundleV2 | AppearanceBundleV1Shim): {
	success: boolean;
	json?: string;
	error?: string;
} {
	try {
		let normalized: AppearanceBundleV2 = bundle as AppearanceBundleV2;
		if ((bundle as { version?: number }).version === 1) {
			const imported = importBundle(JSON.stringify(bundle));
			if (!imported.success || !imported.bundle) {
				return { success: false, error: imported.error ?? "invalid bundle" };
			}
			normalized = imported.bundle;
		}
		const json = JSON.stringify({ ...normalized, version: 2 }, null, 2);
		if (new TextEncoder().encode(json).length > MAX_BUNDLE_BYTES) {
			return { success: false, error: "bundle exceeds 256 KiB" };
		}
		return { success: true, json };
	} catch (error) {
		return { success: false, error: error instanceof Error ? error.message : String(error) };
	}
}

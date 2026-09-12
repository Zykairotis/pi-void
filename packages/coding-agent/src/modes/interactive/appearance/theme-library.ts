import { existsSync, mkdirSync, readFileSync, renameSync, unlinkSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { getCustomThemesDir } from "../../../config.ts";
import {
	getAvailableThemesWithPaths,
	loadThemeFromPath,
	parseThemeJsonData,
	type ThemeColorValue,
	type ThemeJson,
} from "../theme/theme.ts";

export interface ThemeLibraryResult {
	success: boolean;
	error?: string;
}

function themeFilePath(name: string): string {
	return join(getCustomThemesDir(), `${name}.json`);
}

function readThemeData(name: string, customPath?: string): { data: ThemeJson; path: string | undefined } {
	if (customPath && existsSync(customPath)) {
		const raw = JSON.parse(readFileSync(customPath, "utf-8")) as unknown;
		return { data: parseThemeJsonData(customPath, raw), path: customPath };
	}
	const customFile = themeFilePath(name);
	if (existsSync(customFile)) {
		const raw = JSON.parse(readFileSync(customFile, "utf-8")) as unknown;
		return { data: parseThemeJsonData(customFile, raw), path: customFile };
	}
	throw new Error(`Theme "${name}" is not a custom theme with a writable file`);
}

export function isCustomTheme(name: string): boolean {
	return existsSync(themeFilePath(name));
}

export function readCustomTheme(name: string): ThemeJson {
	return readThemeData(name).data;
}

function validateName(name: string): string | null {
	if (!name || name.trim().length === 0) return "theme name must not be empty";
	if (name.length > 64) return "theme name is too long";
	if (name.includes("/") || name.includes("\\") || name.includes("..")) return "theme name contains a path separator";
	if (!/^[A-Za-z0-9][A-Za-z0-9_-]*$/.test(name)) return "theme name must use letters, digits, dash, or underscore";
	return null;
}

export function isValidThemeColorValue(value: unknown): value is ThemeColorValue {
	if (typeof value === "number") return Number.isInteger(value) && value >= 0 && value <= 255;
	if (typeof value !== "string" || value.length > 128) return false;
	if (value === "") return true;
	if (/^#[0-9a-fA-F]{3}$/.test(value) || /^#[0-9a-fA-F]{6}$/.test(value)) return true;
	if (/^rgb\(\s*\d{1,3}\s*,\s*\d{1,3}\s*,\s*\d{1,3}\s*\)$/.test(value)) {
		return value
			.slice(4, -1)
			.split(",")
			.every((part) => {
				const n = Number(part.trim());
				return Number.isInteger(n) && n >= 0 && n <= 255;
			});
	}
	if (/^hsl\(\s*\d{1,3}(?:\.\d+)?\s*,\s*\d{1,3}(?:\.\d+)?%\s*,\s*\d{1,3}(?:\.\d+)?%\s*\)$/.test(value)) return true;
	if (/^[A-Za-z][A-Za-z0-9_-]*$/.test(value)) return true;
	return false;
}

function writeThemeFile(name: string, data: ThemeJson): void {
	mkdirSync(getCustomThemesDir(), { recursive: true });
	const validated = parseThemeJsonData(name, { ...data, name });
	const tmpPath = `${themeFilePath(name)}.tmp`;
	writeFileSync(tmpPath, `${JSON.stringify(validated, null, 2)}\n`, "utf-8");
	renameSync(tmpPath, themeFilePath(name));
	// Reload through the native loader so file state and runtime agree.
	loadThemeFromPath(themeFilePath(name));
}

export function saveCustomTheme(name: string, data: ThemeJson, overwrite = false): ThemeLibraryResult {
	const nameError = validateName(name);
	if (nameError) return { success: false, error: nameError };
	if (!overwrite && existsSync(themeFilePath(name)))
		return { success: false, error: `Theme "${name}" already exists` };
	try {
		writeThemeFile(name, { ...structuredClone(data), name });
		return { success: true };
	} catch (error) {
		return { success: false, error: error instanceof Error ? error.message : String(error) };
	}
}

export function cloneTheme(sourceName: string, destName: string): ThemeLibraryResult {
	const nameError = validateName(destName);
	if (nameError) return { success: false, error: nameError };
	if (existsSync(themeFilePath(destName))) return { success: false, error: `Theme "${destName}" already exists` };
	const infos = getAvailableThemesWithPaths();
	const source = infos.find((info) => info.name === sourceName);
	if (!source) return { success: false, error: `Theme "${sourceName}" not found` };
	try {
		let data: ThemeJson;
		if (source.path && existsSync(source.path)) {
			const raw = JSON.parse(readFileSync(source.path, "utf-8")) as unknown;
			data = parseThemeJsonData(source.path, raw);
		} else {
			return { success: false, error: `Theme "${sourceName}" has no readable source file` };
		}
		writeThemeFile(destName, { ...structuredClone(data), name: destName });
		return { success: true };
	} catch (error) {
		return { success: false, error: error instanceof Error ? error.message : String(error) };
	}
}

export function renameCustomTheme(oldName: string, newName: string): ThemeLibraryResult {
	const nameError = validateName(newName);
	if (nameError) return { success: false, error: nameError };
	if (!isCustomTheme(oldName)) return { success: false, error: `Theme "${oldName}" is not a custom theme` };
	if (existsSync(themeFilePath(newName))) return { success: false, error: `Theme "${newName}" already exists` };
	try {
		const data = readCustomTheme(oldName);
		writeThemeFile(newName, { ...data, name: newName });
		unlinkSync(themeFilePath(oldName));
		return { success: true };
	} catch (error) {
		return { success: false, error: error instanceof Error ? error.message : String(error) };
	}
}

export function deleteCustomTheme(name: string): ThemeLibraryResult {
	if (!isCustomTheme(name)) return { success: false, error: `Theme "${name}" is not a custom theme` };
	try {
		unlinkSync(themeFilePath(name));
		return { success: true };
	} catch (error) {
		return { success: false, error: error instanceof Error ? error.message : String(error) };
	}
}

export function setThemeTokenValue(themeName: string, token: string, value: ThemeColorValue): ThemeLibraryResult {
	if (!isCustomTheme(themeName)) return { success: false, error: `Theme "${themeName}" is not editable` };
	if (!isValidThemeColorValue(value)) return { success: false, error: `Invalid color value` };
	try {
		const data = readCustomTheme(themeName);
		const colors = data.colors as Record<string, unknown>;
		if (!(token in colors)) return { success: false, error: `Unknown token "${token}"` };
		colors[token] = value;
		writeThemeFile(themeName, data);
		return { success: true };
	} catch (error) {
		return { success: false, error: error instanceof Error ? error.message : String(error) };
	}
}

export function resetThemeToken(themeName: string, token: string, baseName: string): ThemeLibraryResult {
	try {
		const base = readThemeData(baseName, getAvailableThemesWithPaths().find((info) => info.name === baseName)?.path);
		const current = readCustomTheme(themeName);
		const baseColors = base.data.colors as Record<string, unknown>;
		if (!(token in baseColors)) return { success: false, error: `Unknown token "${token}"` };
		(current.colors as Record<string, unknown>)[token] = baseColors[token];
		writeThemeFile(themeName, current);
		return { success: true };
	} catch (error) {
		return { success: false, error: error instanceof Error ? error.message : String(error) };
	}
}

export function exportCustomTheme(name: string): { success: boolean; json?: string; error?: string } {
	try {
		const data = readCustomTheme(name);
		return { success: true, json: JSON.stringify(data, null, 2) };
	} catch (error) {
		return { success: false, error: error instanceof Error ? error.message : String(error) };
	}
}

export function importCustomTheme(name: string, json: string): ThemeLibraryResult {
	const nameError = validateName(name);
	if (nameError) return { success: false, error: nameError };
	if (existsSync(themeFilePath(name))) return { success: false, error: `Theme "${name}" already exists` };
	try {
		const raw = JSON.parse(json) as unknown;
		const data = parseThemeJsonData(name, raw);
		writeThemeFile(name, { ...data, name });
		return { success: true };
	} catch (error) {
		return { success: false, error: error instanceof Error ? error.message : String(error) };
	}
}

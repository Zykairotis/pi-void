import {
	createThemeFromData,
	getAvailableThemes,
	getThemeJsonData,
	type Theme,
	type ThemeColorValue,
	type ThemeJson,
} from "../theme/theme.ts";
import {
	deleteCustomTheme,
	isCustomTheme,
	isValidThemeColorValue,
	saveCustomTheme,
	type ThemeLibraryResult,
} from "./theme-library.ts";

interface ThemeDraftEntry {
	name: string;
	data: ThemeJson;
	originalName?: string;
	isNew: boolean;
	dirty: boolean;
	baseName?: string;
	/** Set once commitWrites persisted this entry; makes retries overwrite-safe. */
	written?: boolean;
}

export interface ThemeDraftCommitResult extends ThemeLibraryResult {
	selectedTheme?: string;
}

function validateDraftName(name: string): string | null {
	if (!name || name.trim().length === 0) return "theme name must not be empty";
	if (name.length > 64) return "theme name is too long";
	if (!/^[A-Za-z0-9][A-Za-z0-9_-]*$/.test(name)) return "theme name must use letters, digits, dash, or underscore";
	return null;
}

/**
 * Write-free theme editing transaction for `/customize`.
 *
 * Selecting, cloning, renaming, deleting, importing, and editing colors/vars
 * only mutate this in-memory draft. `commit()` is the sole point that writes
 * custom-theme files; dropping the instance is a true Cancel.
 */
export class ThemeDraftSession {
	private selectedTheme: string;
	private readonly entries = new Map<string, ThemeDraftEntry>();
	private readonly deletedOriginals = new Set<string>();

	constructor(initialTheme: string) {
		const themes = getAvailableThemes();
		this.selectedTheme = themes.includes(initialTheme) ? initialTheme : (themes[0] ?? "dark");
	}

	listThemes(): string[] {
		const names = new Set(getAvailableThemes());
		for (const deleted of this.deletedOriginals) names.delete(deleted);
		for (const name of this.entries.keys()) names.add(name);
		return [...names].sort();
	}

	getSelectedName(): string {
		return this.selectedTheme;
	}

	/** True when any staged theme edit/create/rename/delete exists. */
	hasStagedChanges(): boolean {
		for (const entry of this.entries.values()) {
			if (entry.isNew || entry.dirty || entry.name !== entry.originalName) return true;
		}
		return this.deletedOriginals.size > 0;
	}

	select(name: string): ThemeLibraryResult {
		if (!this.listThemes().includes(name)) return { success: false, error: `Theme "${name}" not found` };
		this.selectedTheme = name;
		return { success: true };
	}

	getThemeData(name = this.selectedTheme): ThemeJson {
		const staged = this.entries.get(name);
		if (staged) return structuredClone(staged.data);
		return getThemeJsonData(name);
	}

	createPreviewTheme(): Theme {
		return createThemeFromData(`appearance-preview:${this.selectedTheme}`, this.getThemeData());
	}

	isEditable(name = this.selectedTheme): boolean {
		return this.entries.has(name) || isCustomTheme(name);
	}

	private ensureEditable(name = this.selectedTheme): ThemeDraftEntry | null {
		const staged = this.entries.get(name);
		if (staged) return staged;
		if (!isCustomTheme(name)) return null;
		const entry: ThemeDraftEntry = {
			name,
			data: getThemeJsonData(name),
			originalName: name,
			isNew: false,
			dirty: false,
		};
		this.entries.set(name, entry);
		return entry;
	}

	cloneSelected(destName: string): ThemeLibraryResult {
		const nameError = validateDraftName(destName);
		if (nameError) return { success: false, error: nameError };
		if (this.listThemes().includes(destName)) return { success: false, error: `Theme "${destName}" already exists` };
		const sourceName = this.selectedTheme;
		const data = this.getThemeData(sourceName);
		this.entries.set(destName, {
			name: destName,
			data: { ...structuredClone(data), name: destName },
			isNew: true,
			dirty: true,
			baseName: sourceName,
		});
		this.selectedTheme = destName;
		return { success: true };
	}

	renameSelected(newName: string): ThemeLibraryResult {
		const oldName = this.selectedTheme;
		const nameError = validateDraftName(newName);
		if (nameError) return { success: false, error: nameError };
		if (newName === oldName) return { success: true };
		if (this.listThemes().includes(newName)) return { success: false, error: `Theme "${newName}" already exists` };
		const entry = this.ensureEditable(oldName);
		if (!entry) return { success: false, error: `Theme "${oldName}" is not editable` };
		this.entries.delete(oldName);
		if (entry.originalName) this.deletedOriginals.add(entry.originalName);
		this.entries.set(newName, {
			...entry,
			name: newName,
			data: { ...structuredClone(entry.data), name: newName },
			dirty: true,
		});
		this.selectedTheme = newName;
		return { success: true };
	}

	deleteSelected(): ThemeLibraryResult {
		const name = this.selectedTheme;
		const entry = this.entries.get(name);
		if (entry?.isNew) {
			this.entries.delete(name);
		} else if (entry?.originalName) {
			this.deletedOriginals.add(entry.originalName);
			this.entries.delete(name);
		} else if (isCustomTheme(name)) {
			this.deletedOriginals.add(name);
		} else {
			return { success: false, error: `Theme "${name}" is not a custom theme` };
		}
		this.selectedTheme = this.listThemes()[0] ?? "dark";
		return { success: true };
	}

	setToken(token: string, value: ThemeColorValue): ThemeLibraryResult {
		if (!isValidThemeColorValue(value)) return { success: false, error: "Invalid color value" };
		const entry = this.ensureEditable();
		if (!entry) return { success: false, error: `Theme "${this.selectedTheme}" is not editable` };
		const colors = entry.data.colors as Record<string, unknown>;
		if (!(token in colors)) return { success: false, error: `Unknown token "${token}"` };
		const previous = colors[token];
		colors[token] = value;
		try {
			entry.data = createValidatedData(entry.name, entry.data);
			entry.dirty = true;
			return { success: true };
		} catch (error) {
			colors[token] = previous;
			return { success: false, error: error instanceof Error ? error.message : String(error) };
		}
	}

	setVariable(name: string, value: ThemeColorValue): ThemeLibraryResult {
		if (!/^[A-Za-z][A-Za-z0-9_-]*$/.test(name)) return { success: false, error: "invalid variable name" };
		if (!isValidThemeColorValue(value)) return { success: false, error: "Invalid color value" };
		const entry = this.ensureEditable();
		if (!entry) return { success: false, error: `Theme "${this.selectedTheme}" is not editable` };
		if (!entry.data.vars) entry.data.vars = {};
		const vars = entry.data.vars;
		const previous = vars[name];
		vars[name] = value;
		try {
			entry.data = createValidatedData(entry.name, entry.data);
			entry.dirty = true;
			return { success: true };
		} catch (error) {
			if (previous === undefined) delete vars[name];
			else vars[name] = previous;
			return { success: false, error: error instanceof Error ? error.message : String(error) };
		}
	}

	resetSelected(baseName?: string): ThemeLibraryResult {
		const entry = this.ensureEditable();
		if (!entry) return { success: false, error: `Theme "${this.selectedTheme}" is not editable` };
		const sourceName = baseName ?? entry.baseName ?? "dark";
		try {
			const base = this.getThemeData(sourceName);
			entry.data = { ...structuredClone(base), name: entry.name };
			entry.dirty = true;
			return { success: true };
		} catch (error) {
			return { success: false, error: error instanceof Error ? error.message : String(error) };
		}
	}

	resetToken(token: string, baseName?: string): ThemeLibraryResult {
		const entry = this.ensureEditable();
		if (!entry) return { success: false, error: `Theme "${this.selectedTheme}" is not editable` };
		const sourceName = baseName ?? entry.baseName ?? "dark";
		try {
			const base = this.getThemeData(sourceName);
			const colors = base.colors as Record<string, unknown>;
			if (!(token in colors)) return { success: false, error: `Unknown token "${token}"` };
			(entry.data.colors as Record<string, unknown>)[token] = colors[token];
			entry.data = createValidatedData(entry.name, entry.data);
			entry.dirty = true;
			return { success: true };
		} catch (error) {
			return { success: false, error: error instanceof Error ? error.message : String(error) };
		}
	}

	importTheme(name: string, json: string, options: { replace?: boolean } = {}): ThemeLibraryResult {
		const nameError = validateDraftName(name);
		if (nameError) return { success: false, error: nameError };
		const exists = this.listThemes().includes(name);
		if (exists && !options.replace) return { success: false, error: `Theme "${name}" already exists` };
		if (exists && !isCustomTheme(name)) {
			return { success: false, error: `Built-in theme "${name}" cannot be replaced` };
		}
		try {
			const data = createValidatedData(name, JSON.parse(json) as unknown);
			const staged = this.entries.get(name);
			this.entries.set(name, {
				name,
				data: { ...structuredClone(data), name },
				originalName: staged?.originalName ?? (exists ? name : undefined),
				isNew: staged ? staged.isNew : !exists,
				dirty: true,
				written: staged?.written,
			});
			this.selectedTheme = name;
			return { success: true };
		} catch (error) {
			return { success: false, error: error instanceof Error ? error.message : String(error) };
		}
	}

	/**
	 * Rename a theme variable and rewrite exact references to it in colors,
	 * vars, and export. Validation failures restore the previous data.
	 */
	renameVariable(oldName: string, newName: string): ThemeLibraryResult {
		if (!/^[A-Za-z][A-Za-z0-9_-]*$/.test(newName)) return { success: false, error: "invalid variable name" };
		const entry = this.ensureEditable();
		if (!entry) return { success: false, error: `Theme "${this.selectedTheme}" is not editable` };
		const vars = entry.data.vars;
		if (!vars || !(oldName in vars)) return { success: false, error: `Variable "${oldName}" not found` };
		if (newName === oldName) return { success: true };
		if (newName in vars) return { success: false, error: `Variable "${newName}" already exists` };
		const backup = structuredClone(entry.data);
		const renameRef = (value: unknown): unknown => (value === oldName ? newName : value);
		for (const record of [entry.data.colors, entry.data.vars, entry.data.export] as (
			| Record<string, unknown>
			| undefined
		)[]) {
			if (!record) continue;
			for (const key of Object.keys(record)) {
				const value = record[key];
				if (typeof value === "string") record[key] = renameRef(value);
			}
		}
		const nextVars: Record<string, ThemeColorValue> = {};
		for (const [key, value] of Object.entries(vars)) {
			nextVars[key === oldName ? newName : key] = value;
		}
		entry.data.vars = nextVars;
		try {
			entry.data = createValidatedData(entry.name, entry.data);
			entry.dirty = true;
			return { success: true };
		} catch (error) {
			entry.data = backup;
			return { success: false, error: error instanceof Error ? error.message : String(error) };
		}
	}

	/** Delete a variable; validation rejects the delete while references remain. */
	deleteVariable(name: string): ThemeLibraryResult {
		const entry = this.ensureEditable();
		if (!entry) return { success: false, error: `Theme "${this.selectedTheme}" is not editable` };
		const vars = entry.data.vars;
		if (!vars || !(name in vars)) return { success: false, error: `Variable "${name}" not found` };
		const backup = structuredClone(entry.data);
		delete vars[name];
		try {
			entry.data = createValidatedData(entry.name, entry.data);
			entry.dirty = true;
			return { success: true };
		} catch (error) {
			entry.data = backup;
			return { success: false, error: error instanceof Error ? error.message : String(error) };
		}
	}

	/** Token/var names whose value references the given variable exactly. */
	variableReferences(name: string, themeName = this.selectedTheme): string[] {
		try {
			const data = this.getThemeData(themeName) as ThemeJson & { export?: Record<string, unknown> };
			const refs: string[] = [];
			for (const [key, value] of Object.entries(data.colors as Record<string, unknown>)) {
				if (value === name) refs.push(key);
			}
			for (const [key, value] of Object.entries(data.vars ?? {})) {
				if (key !== name && value === name) refs.push(`vars.${key}`);
			}
			for (const [key, value] of Object.entries(data.export ?? {})) {
				if (value === name) refs.push(`export.${key}`);
			}
			return refs;
		} catch {
			return [];
		}
	}

	exportSelected(): { success: boolean; json?: string; error?: string } {
		try {
			return { success: true, json: JSON.stringify(this.getThemeData(), null, 2) };
		} catch (error) {
			return { success: false, error: error instanceof Error ? error.message : String(error) };
		}
	}

	/**
	 * Write every staged destination without deleting any original. A failure
	 * can leave an extra file but never destroys the user's original theme;
	 * written entries become retry-safe (overwrite) for a repeated apply.
	 */
	commitWrites(): ThemeLibraryResult {
		try {
			for (const entry of this.entries.values()) createValidatedData(entry.name, entry.data);
		} catch (error) {
			return { success: false, error: error instanceof Error ? error.message : String(error) };
		}
		for (const entry of this.entries.values()) {
			if (!entry.dirty && !entry.isNew && entry.name === entry.originalName) continue;
			const overwrite = entry.written === true || (!entry.isNew && entry.name === entry.originalName);
			const result = saveCustomTheme(entry.name, entry.data, overwrite);
			if (!result.success) return result;
			entry.written = true;
		}
		return { success: true };
	}

	/** Delete replaced/removed originals. Runs only after all writes succeeded. */
	commitDeletes(): ThemeLibraryResult {
		for (const original of this.deletedOriginals) {
			if (this.entries.has(original)) continue;
			if (!isCustomTheme(original)) continue;
			const result = deleteCustomTheme(original);
			if (!result.success) return result;
		}
		return { success: true };
	}

	commit(): ThemeDraftCommitResult {
		const writes = this.commitWrites();
		if (!writes.success) return writes;
		const deletes = this.commitDeletes();
		if (!deletes.success) return deletes;
		return { success: true, selectedTheme: this.selectedTheme };
	}
}

function createValidatedData(name: string, data: unknown): ThemeJson {
	// Runtime construction validates both schema and variable resolution, while
	// getThemeData/commit retain the native lossless JSON value model.
	const parsed = data as ThemeJson;
	createThemeFromData(name, { ...structuredClone(parsed), name });
	return { ...structuredClone(parsed), name };
}

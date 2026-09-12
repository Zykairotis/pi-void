import {
	deleteProfile,
	listProfiles,
	type ProfileResult,
	readProfile,
	saveProfile,
	validateThemeSetting,
} from "./appearance-profiles.ts";
import type { AppearanceProfileV2 } from "./appearance-types.ts";

/**
 * Write-free profile library transaction for `/customize`.
 *
 * Every operation (create, replace, rename, duplicate, delete) mutates this
 * in-memory staging area only. `commit()` is the sole point that writes;
 * destinations are written before old sources are deleted, mirroring the
 * theme draft ordering. Dropping the instance is a true Cancel with zero
 * filesystem changes.
 */
export class ProfileDraftSession {
	/** Staged profile content keyed by target name. */
	private readonly staged = new Map<string, AppearanceProfileV2>();
	private readonly deleted = new Set<string>();
	/** Names already persisted by commitWrites; makes retries overwrite-safe. */
	private readonly written = new Set<string>();

	listNames(): string[] {
		const names = new Set<string>();
		for (const name of listProfiles()) {
			if (!this.deleted.has(name) && !this.staged.has(name)) names.add(name);
		}
		for (const name of this.staged.keys()) names.add(name);
		return [...names].sort();
	}

	exists(name: string): boolean {
		return this.staged.has(name) || (listProfiles().includes(name) && !this.deleted.has(name));
	}

	/** Staged content wins over disk; disk v1 profiles migrate to v2 on read. */
	get(name: string): AppearanceProfileV2 | undefined {
		const stagedProfile = this.staged.get(name);
		if (stagedProfile) return structuredClone(stagedProfile);
		if (this.deleted.has(name)) return undefined;
		if (!listProfiles().includes(name)) return undefined;
		try {
			return readProfile(name);
		} catch {
			return undefined;
		}
	}

	private validateName(name: string): string | null {
		if (!name || name.trim().length === 0) return "profile name must not be empty";
		if (name.length > 64) return "profile name is too long";
		if (!/^[A-Za-z0-9][A-Za-z0-9_-]*$/.test(name))
			return "profile name must use letters, digits, dash, or underscore";
		return null;
	}

	/** Stage a new profile. Fails when the name is taken unless replace is explicit. */
	save(profile: AppearanceProfileV2, options: { replace?: boolean } = {}): ProfileResult {
		const nameError = this.validateName(profile.name);
		if (nameError) return { success: false, error: nameError };
		const existedOnDisk = listProfiles().includes(profile.name) && !this.deleted.has(profile.name);
		const isStagedEdit = this.staged.has(profile.name);
		if ((existedOnDisk || isStagedEdit) && !options.replace && !isStagedEdit) {
			return { success: false, error: `Profile "${profile.name}" already exists` };
		}
		this.deleted.delete(profile.name);
		this.staged.set(profile.name, structuredClone(profile));
		return { success: true };
	}

	delete(name: string): ProfileResult {
		if (!this.exists(name)) return { success: false, error: `Profile "${name}" not found` };
		this.staged.delete(name);
		this.written.delete(name);
		if (listProfiles().includes(name)) this.deleted.add(name);
		return { success: true };
	}

	rename(oldName: string, newName: string): ProfileResult {
		const profile = this.get(oldName);
		if (!profile) return { success: false, error: `Profile "${oldName}" not found` };
		const nameError = this.validateName(newName);
		if (nameError) return { success: false, error: nameError };
		if (newName === oldName) return { success: true };
		if (this.exists(newName)) return { success: false, error: `Profile "${newName}" already exists` };
		const deleteResult = this.delete(oldName);
		if (!deleteResult.success) return deleteResult;
		return this.save({ ...structuredClone(profile), name: newName });
	}

	duplicate(sourceName: string, destName: string): ProfileResult {
		const profile = this.get(sourceName);
		if (!profile) return { success: false, error: `Profile "${sourceName}" not found` };
		const nameError = this.validateName(destName);
		if (nameError) return { success: false, error: nameError };
		if (this.exists(destName)) return { success: false, error: `Profile "${destName}" already exists` };
		return this.save({ ...structuredClone(profile), name: destName });
	}

	hasStagedChanges(): boolean {
		return this.staged.size > 0 || this.deleted.size > 0;
	}

	/**
	 * Validate and write every staged destination without deleting any
	 * original. Written entries become retry-safe (overwrite) for a repeated
	 * apply.
	 */
	commitWrites(availableThemes: readonly string[]): ProfileResult {
		for (const profile of this.staged.values()) {
			if (profile.themeSetting) {
				const check = validateThemeSetting(profile.themeSetting, availableThemes);
				if (!check.valid)
					return { success: false, error: `${profile.name}: ${check.error ?? "invalid theme setting"}` };
			}
		}
		for (const [name, profile] of this.staged.entries()) {
			const overwrite = this.written.has(name) || listProfiles().includes(name);
			const result = saveProfile(profile, overwrite);
			if (!result.success) return result;
			this.written.add(name);
		}
		return { success: true };
	}

	/** Delete replaced/removed originals. Runs only after all writes succeeded. */
	commitDeletes(): ProfileResult {
		for (const name of this.deleted) {
			if (this.staged.has(name)) continue;
			if (!listProfiles().includes(name)) continue;
			const result = deleteProfile(name);
			if (!result.success) return result;
		}
		this.staged.clear();
		this.deleted.clear();
		this.written.clear();
		return { success: true };
	}

	/**
	 * Persist every staged operation. All destination names are validated
	 * before the first write; destinations are written before old sources are
	 * unlinked so a failure can leave an extra file but never destroys an
	 * existing profile before its replacement exists.
	 */
	commit(availableThemes: readonly string[]): ProfileResult {
		const writes = this.commitWrites(availableThemes);
		if (!writes.success) return writes;
		return this.commitDeletes();
	}
}

import type { SettingsManager } from "../../../core/settings-manager.ts";
import type { AppearanceSettingsV2 } from "./appearance-types.ts";
import { type AppearanceValidationResult, validateAppearance } from "./appearance-validate.ts";

/**
 * Transactional appearance preview controller.
 *
 * Preview state is in-memory only. Disk is written exactly once through
 * SettingsManager on explicit commit. Cancel/rollback restores the captured
 * baseline snapshot; no stacked preview layers are allowed.
 */
export class InteractiveAppearanceController {
	private baseline: AppearanceSettingsV2;
	private previewed: AppearanceSettingsV2 | null = null;
	private readonly onChanged: () => void;

	private readonly settingsManager: SettingsManager;
	constructor(settingsManager: SettingsManager, onChanged: () => void = () => {}) {
		this.settingsManager = settingsManager;
		this.onChanged = onChanged;
		this.baseline = this.settingsManager.getAppearanceSettings();
	}

	getBaseline(): AppearanceSettingsV2 {
		return structuredClone(this.baseline);
	}

	getEffective(): AppearanceSettingsV2 {
		return structuredClone(this.previewed ?? this.baseline);
	}

	isPreviewing(): boolean {
		return this.previewed !== null;
	}

	beginPreview(): AppearanceSettingsV2 {
		if (!this.previewed) {
			this.baseline = this.settingsManager.getAppearanceSettings();
			this.previewed = structuredClone(this.baseline);
		}
		return structuredClone(this.previewed);
	}

	preview(next: AppearanceSettingsV2): AppearanceValidationResult {
		const validated = validateAppearance(next);
		if (!validated.valid) return validated;
		if (!this.previewed) {
			this.baseline = this.settingsManager.getAppearanceSettings();
		}
		this.previewed = structuredClone(validated.appearance);
		this.onChanged();
		return validated;
	}

	commit(next: AppearanceSettingsV2): AppearanceValidationResult {
		const validated = validateAppearance(next);
		if (!validated.valid) return validated;
		const stored = this.settingsManager.setAppearanceSettings(validated.appearance);
		if (!stored.valid) return stored;
		this.baseline = structuredClone(stored.appearance);
		this.previewed = null;
		this.onChanged();
		return stored;
	}

	rollback(): void {
		if (!this.previewed) return;
		this.previewed = null;
		this.onChanged();
	}

	refreshBaseline(): void {
		this.baseline = this.settingsManager.getAppearanceSettings();
		if (!this.previewed) this.onChanged();
	}
}

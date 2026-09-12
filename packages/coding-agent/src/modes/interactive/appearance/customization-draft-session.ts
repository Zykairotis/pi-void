import type { SettingsManager } from "../../../core/settings-manager.ts";
import type { InteractiveAppearanceController } from "./appearance-controller.ts";
import { applyProfileToAppearance, mergeAppearancePartial, validateThemeSetting } from "./appearance-profiles.ts";
import type {
	AppearanceProfileV2,
	AppearanceSettingsV2,
	AppearanceThemeSetting,
	DeepPartial,
} from "./appearance-types.ts";
import { validateAppearance } from "./appearance-validate.ts";
import { ProfileDraftSession } from "./profile-draft-session.ts";
import { ThemeDraftSession } from "./theme-draft-session.ts";

export interface CustomizationApplyResult {
	success: boolean;
	error?: string;
	/** Concrete theme to display after apply (member of the pair when automatic). */
	selectedTheme?: string;
}

/** Which member of an automatic light/dark pair the editor currently targets. */
export type ThemePreviewSide = "terminal" | "light" | "dark";

export type AppearanceSectionId =
	| "userMessage"
	| "assistantMessage"
	| "inputBox"
	| "thinking.indicator"
	| "thinking.label"
	| "thinking.block"
	| "statusIndicators"
	| "markdown"
	| "tools"
	| "bash"
	| "diff"
	| "systemCards"
	| "footer"
	| "chrome"
	| "subagentChrome"
	| "inputHighlighters";

function sectionOf(appearance: AppearanceSettingsV2, section: AppearanceSectionId): unknown {
	switch (section) {
		case "userMessage":
			return appearance.userMessage;
		case "assistantMessage":
			return appearance.assistantMessage;
		case "inputBox":
			return appearance.inputBox;
		case "thinking.indicator":
			return appearance.thinking.indicator;
		case "thinking.label":
			return appearance.thinking.label;
		case "thinking.block":
			return appearance.thinking.block;
		case "statusIndicators":
			return appearance.statusIndicators;
		case "markdown":
			return appearance.markdown;
		case "tools":
			return appearance.tools;
		case "bash":
			return appearance.bash;
		case "diff":
			return appearance.diff;
		case "systemCards":
			return appearance.systemCards;
		case "footer":
			return appearance.footer;
		case "chrome":
			return appearance.chrome;
		case "subagentChrome":
			return appearance.subagentChrome;
		case "inputHighlighters":
			return appearance.inputHighlighters;
	}
}

function sameValue(a: unknown, b: unknown): boolean {
	return JSON.stringify(a) === JSON.stringify(b);
}

/**
 * One transactional customization session spanning appearance, theme
 * selection, staged custom-theme file operations, and staged profile-library
 * operations.
 *
 * Nothing touches disk or persisted settings until `apply()`. `cancel()` and
 * dropping the instance produce zero writes and restore the captured
 * baseline (the appearance controller rollback handles runtime globals).
 */
export class CustomizationDraftSession {
	private readonly settingsManager: SettingsManager;
	private readonly appearanceController: InteractiveAppearanceController;
	private readonly terminalTheme: "dark" | "light";

	private themeSettingBaseline: AppearanceThemeSetting;
	private themeSettingDraft: AppearanceThemeSetting;
	private themeDraft: ThemeDraftSession;
	private profileDraft: ProfileDraftSession;
	private previewSide: ThemePreviewSide = "terminal";

	constructor(
		settingsManager: SettingsManager,
		appearanceController: InteractiveAppearanceController,
		fallbackTheme: string,
		terminalTheme: "dark" | "light",
	) {
		this.settingsManager = settingsManager;
		this.appearanceController = appearanceController;
		this.terminalTheme = terminalTheme;
		const parsed = settingsManager.getAppearanceThemeSetting();
		this.themeSettingBaseline = parsed ?? { mode: "fixed", theme: fallbackTheme };
		// A persisted path-like or unknown value cannot be edited as fixed;
		// keep the concrete fallback theme for previewing.
		this.themeSettingDraft = structuredClone(this.themeSettingBaseline);
		this.themeDraft = this.createThemeDraft();
		this.profileDraft = new ProfileDraftSession();
	}

	private createThemeDraft(): ThemeDraftSession {
		return new ThemeDraftSession(this.resolveThemeSetting(this.themeSettingDraft));
	}

	/** Concrete theme a given setting selects for the current preview side. */
	private resolveThemeSetting(setting: AppearanceThemeSetting): string {
		if (setting.mode === "fixed") return setting.theme;
		const side = this.effectivePreviewSide();
		return side === "light" ? setting.light : setting.dark;
	}

	private effectivePreviewSide(): "light" | "dark" {
		if (this.themeSettingDraft.mode !== "automatic") return "dark";
		if (this.previewSide === "light") return "light";
		if (this.previewSide === "dark") return "dark";
		return this.terminalTheme;
	}

	// --- Appearance ---

	getAppearance(): AppearanceSettingsV2 {
		return this.appearanceController.getEffective();
	}

	getBaselineAppearance(): AppearanceSettingsV2 {
		return this.appearanceController.getBaseline();
	}

	previewAppearance(next: AppearanceSettingsV2): ReturnType<typeof validateAppearance> {
		return this.appearanceController.preview(next);
	}

	/** Apply a partial appearance patch onto the current draft and preview it. */
	patchAppearance(patch: DeepPartial<AppearanceSettingsV2>): ReturnType<typeof validateAppearance> {
		const merged = mergeAppearancePartial(this.getAppearance(), patch);
		return this.previewAppearance(merged);
	}

	// --- Theme selection ---

	getThemeSetting(): AppearanceThemeSetting {
		return structuredClone(this.themeSettingDraft);
	}

	getBaselineThemeSetting(): AppearanceThemeSetting {
		return structuredClone(this.themeSettingBaseline);
	}

	getProfileDraft(): ProfileDraftSession {
		return this.profileDraft;
	}

	getThemeDraft(): ThemeDraftSession {
		return this.themeDraft;
	}

	getPreviewSide(): ThemePreviewSide {
		return this.previewSide;
	}

	/** Which concrete theme the editor and preview currently show. */
	getSelectedTheme(): string {
		return this.themeDraft.getSelectedName();
	}

	setPreviewSide(side: ThemePreviewSide): void {
		this.previewSide = side;
		const target = this.resolveThemeSetting(this.themeSettingDraft);
		if (this.themeDraft.getSelectedName() !== target) {
			this.themeDraft.select(target);
		}
	}

	/** Switch between fixed and automatic modes (validated on apply). */
	setThemeMode(mode: "fixed" | "automatic"): void {
		if (mode === this.themeSettingDraft.mode) return;
		if (mode === "fixed") {
			this.themeSettingDraft = { mode: "fixed", theme: this.resolveThemeSetting(this.themeSettingDraft) };
			this.previewSide = "terminal";
			this.themeDraft.select(this.themeSettingDraft.theme);
			return;
		}
		const current = this.resolveThemeSetting(this.themeSettingDraft);
		this.themeSettingDraft = { mode: "automatic", light: current, dark: current };
	}

	setFixedTheme(name: string): void {
		if (this.themeSettingDraft.mode !== "fixed") return;
		this.themeSettingDraft = { mode: "fixed", theme: name };
		this.themeDraft.select(name);
	}

	setAutomaticMember(member: "light" | "dark", name: string): void {
		if (this.themeSettingDraft.mode !== "automatic") return;
		this.themeSettingDraft = { ...this.themeSettingDraft, [member]: name };
		this.themeDraft.select(this.resolveThemeSetting(this.themeSettingDraft));
	}

	// --- Profiles ---

	/** Merge a stored profile into the current appearance draft. */
	loadProfile(profile: AppearanceProfileV2): ReturnType<typeof validateAppearance> {
		const next = applyProfileToAppearance(profile, this.getAppearance());
		return this.previewAppearance(next);
	}

	// --- Dirty tracking ---

	isSectionDirty(section: AppearanceSectionId): boolean {
		return !sameValue(sectionOf(this.getAppearance(), section), sectionOf(this.getBaselineAppearance(), section));
	}

	isAppearanceDirty(): boolean {
		return !sameValue(this.getAppearance(), this.getBaselineAppearance());
	}

	isThemeSettingDirty(): boolean {
		return !sameValue(this.themeSettingDraft, this.themeSettingBaseline);
	}

	isDirty(): boolean {
		return (
			this.isAppearanceDirty() ||
			this.isThemeSettingDirty() ||
			this.themeDraft.hasStagedChanges() ||
			this.profileDraft.hasStagedChanges()
		);
	}

	// --- Reset ---

	/** Restore one appearance section to the persisted baseline (no writes). */
	resetSection(section: AppearanceSectionId): void {
		const baseline = structuredClone(this.getBaselineAppearance());
		const baselineSection = structuredClone(sectionOf(baseline, section));
		const draft = structuredClone(this.getAppearance());
		const target = sectionOf(draft, section) as Record<string, unknown>;
		const source = baselineSection as Record<string, unknown>;
		if (
			Array.isArray(baselineSection) ||
			Array.isArray(target) ||
			typeof baselineSection !== "object" ||
			typeof target !== "object"
		) {
			// Array sections (highlighters) are replaced wholesale.
			this.assignSection(draft, section, structuredClone(baselineSection));
		} else {
			for (const key of Object.keys(target)) {
				if (key in source) target[key] = structuredClone(source[key]);
			}
		}
		this.previewAppearance(draft);
	}

	private assignSection(target: AppearanceSettingsV2, section: AppearanceSectionId, value: unknown): void {
		switch (section) {
			case "userMessage":
				target.userMessage = value as AppearanceSettingsV2["userMessage"];
				break;
			case "assistantMessage":
				target.assistantMessage = value as AppearanceSettingsV2["assistantMessage"];
				break;
			case "inputBox":
				target.inputBox = value as AppearanceSettingsV2["inputBox"];
				break;
			case "thinking.indicator":
				target.thinking.indicator = value as AppearanceSettingsV2["thinking"]["indicator"];
				break;
			case "thinking.label":
				target.thinking.label = value as AppearanceSettingsV2["thinking"]["label"];
				break;
			case "thinking.block":
				target.thinking.block = value as AppearanceSettingsV2["thinking"]["block"];
				break;
			case "statusIndicators":
				target.statusIndicators = value as AppearanceSettingsV2["statusIndicators"];
				break;
			case "markdown":
				target.markdown = value as AppearanceSettingsV2["markdown"];
				break;
			case "tools":
				target.tools = value as AppearanceSettingsV2["tools"];
				break;
			case "bash":
				target.bash = value as AppearanceSettingsV2["bash"];
				break;
			case "diff":
				target.diff = value as AppearanceSettingsV2["diff"];
				break;
			case "systemCards":
				target.systemCards = value as AppearanceSettingsV2["systemCards"];
				break;
			case "footer":
				target.footer = value as AppearanceSettingsV2["footer"];
				break;
			case "chrome":
				target.chrome = value as AppearanceSettingsV2["chrome"];
				break;
			case "subagentChrome":
				target.subagentChrome = value as AppearanceSettingsV2["subagentChrome"];
				break;
			case "inputHighlighters":
				target.inputHighlighters = value as AppearanceSettingsV2["inputHighlighters"];
				break;
		}
	}

	/**
	 * Full reset: appearance, theme selection, and every staged theme/profile
	 * operation return to the captured baseline without closing the editor
	 * and without any write.
	 */
	resetAll(): void {
		this.appearanceController.rollback();
		this.themeSettingDraft = structuredClone(this.themeSettingBaseline);
		this.previewSide = "terminal";
		this.themeDraft = this.createThemeDraft();
		this.profileDraft = new ProfileDraftSession();
	}

	// --- Commit / cancel ---

	/**
	 * Commit ordering (P0.5): validate every staged surface first, write all
	 * library destinations (themes, then profiles), persist the theme setting
	 * and appearance, and only then delete replaced originals. A mid-apply
	 * failure can leave an extra destination file but never destroys an
	 * original before its replacement exists.
	 */
	apply(): CustomizationApplyResult {
		const availableThemes = this.themeDraft.listThemes();
		const themeSettingCheck = validateThemeSetting(this.themeSettingDraft, availableThemes);
		if (!themeSettingCheck.valid) {
			return { success: false, error: themeSettingCheck.error ?? "invalid theme setting" };
		}
		const validatedSetting = themeSettingCheck.setting as AppearanceThemeSetting;

		const appearance = this.getAppearance();
		const appearanceValidation = validateAppearance(appearance);
		if (!appearanceValidation.valid) {
			return {
				success: false,
				error: appearanceValidation.issues.map((issue) => `${issue.path}: ${issue.message}`).join("; "),
			};
		}

		const themeWrites = this.themeDraft.commitWrites();
		if (!themeWrites.success) return { success: false, error: themeWrites.error ?? "theme write failed" };

		const profileWrites = this.profileDraft.commitWrites(availableThemes);
		if (!profileWrites.success) return { success: false, error: profileWrites.error ?? "profile write failed" };

		this.settingsManager.setAppearanceThemeSetting(validatedSetting);

		const stored = this.appearanceController.commit(appearanceValidation.appearance);
		if (!stored.valid) {
			return {
				success: false,
				error: stored.issues.map((issue) => `${issue.path}: ${issue.message}`).join("; "),
			};
		}

		const themeDeletes = this.themeDraft.commitDeletes();
		if (!themeDeletes.success) return { success: false, error: themeDeletes.error ?? "theme cleanup failed" };
		const profileDeletes = this.profileDraft.commitDeletes();
		if (!profileDeletes.success) return { success: false, error: profileDeletes.error ?? "profile cleanup failed" };

		return { success: true, selectedTheme: this.resolveThemeSetting(validatedSetting) };
	}

	/** Cancel the whole session: zero writes, baseline restored. */
	cancel(): void {
		this.appearanceController.rollback();
		this.themeSettingDraft = structuredClone(this.themeSettingBaseline);
		// Drop staged theme/profile state after restoring the baseline setting so
		// the replacement theme draft cannot inherit a cancelled selection.
		this.themeDraft = this.createThemeDraft();
		this.profileDraft = new ProfileDraftSession();
		this.previewSide = "terminal";
	}
}

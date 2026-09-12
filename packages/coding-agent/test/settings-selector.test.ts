import { setKeybindings } from "@zykairotis/ice-tui";
import { beforeAll, describe, expect, it, vi } from "vitest";
import { KeybindingsManager } from "../src/core/keybindings.ts";
import {
	type SettingsCallbacks,
	type SettingsConfig,
	SettingsSelectorComponent,
} from "../src/modes/interactive/components/settings-selector.ts";
import { initTheme } from "../src/modes/interactive/theme/theme.ts";

describe("SettingsSelectorComponent", () => {
	beforeAll(() => {
		initTheme("dark");
		setKeybindings(new KeybindingsManager());
	});

	it("cycles through fullscreen scrollbar modes", () => {
		const onChange = vi.fn();
		const selector = new SettingsSelectorComponent(
			{
				fullscreenScrollbar: "auto",
				warnings: {},
				availableThinkingLevels: [],
				availableThemes: [],
			} as unknown as SettingsConfig,
			{ onFullscreenScrollbarChange: onChange } as unknown as SettingsCallbacks,
		);
		const settingsList = selector.getSettingsList();

		for (const character of "Fullscreen scrollbar") settingsList.handleInput(character);
		settingsList.handleInput("\r");
		settingsList.handleInput("\r");
		settingsList.handleInput("\r");

		expect(onChange.mock.calls.flat()).toEqual(["always", "hidden", "auto"]);
	});

	it("changes the compaction threshold percentage", () => {
		const onChange = vi.fn();
		const selector = new SettingsSelectorComponent(
			{
				compactionThresholdPercent: 85,
				warnings: {},
				availableThinkingLevels: [],
				availableThemes: [],
			} as unknown as SettingsConfig,
			{ onCompactionThresholdPercentChange: onChange } as unknown as SettingsCallbacks,
		);
		const settingsList = selector.getSettingsList();

		for (const character of "Compaction threshold") settingsList.handleInput(character);
		settingsList.handleInput("\r");

		expect(onChange).toHaveBeenCalledWith(90);
	});

	it("opens the full appearance customizer from settings", () => {
		const onOpenAppearance = vi.fn();
		const selector = new SettingsSelectorComponent(
			{
				warnings: {},
				availableThinkingLevels: [],
				availableThemes: [],
			} as unknown as SettingsConfig,
			{ onOpenAppearance } as unknown as SettingsCallbacks,
		);
		const settingsList = selector.getSettingsList();

		for (const character of "Appearance") settingsList.handleInput(character);
		settingsList.handleInput("\r");

		expect(onOpenAppearance).toHaveBeenCalledOnce();
	});
});

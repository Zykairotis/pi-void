import { describe, expect, test } from "vitest";
import type { SettingsManager } from "../src/core/settings-manager.ts";
import { InteractiveAppearanceController } from "../src/modes/interactive/appearance/appearance-controller.ts";
import { createDefaultAppearance } from "../src/modes/interactive/appearance/appearance-defaults.ts";
import { validateAppearance } from "../src/modes/interactive/appearance/appearance-validate.ts";

function createManager(initial: unknown = undefined): { manager: SettingsManager; saved: unknown[] } {
	const saved: unknown[] = [];
	let appearance = initial;
	const manager = {
		getAppearanceSettings: () => validateAppearance(appearance).appearance,
		setAppearanceSettings: (next: unknown) => {
			const validated = validateAppearance(next);
			if (!validated.valid) return validated;
			appearance = structuredClone(validated.appearance);
			saved.push(structuredClone(validated.appearance));
			return validated;
		},
	} as unknown as SettingsManager;
	return { manager, saved };
}

describe("appearance preview transaction", () => {
	test("preview does not persist until commit", () => {
		const { manager, saved } = createManager();
		let changed = 0;
		const controller = new InteractiveAppearanceController(manager, () => {
			changed++;
		});
		const draft = (() => {
			const d = structuredClone(createDefaultAppearance());
			d.markdown.tableStyle = "ascii";
			return d;
		})();
		controller.beginPreview();
		expect(saved).toHaveLength(0);
		const previewed = controller.preview(draft);
		expect(previewed.valid).toBe(true);
		expect(saved).toHaveLength(0);
		expect(controller.getEffective().markdown.tableStyle).toBe("ascii");
		controller.rollback();
		expect(controller.getEffective().markdown.tableStyle).toBe("unicode");
		expect(saved).toHaveLength(0);
		expect(changed).toBeGreaterThan(0);
	});

	test("invalid preview is rejected without touching the draft", () => {
		const { manager, saved } = createManager();
		const controller = new InteractiveAppearanceController(manager);
		const bad = structuredClone(createDefaultAppearance());
		(bad.markdown as { tableStyle: string }).tableStyle = "nope";
		const result = controller.preview(bad);
		expect(result.valid).toBe(false);
		expect(controller.getEffective().markdown.tableStyle).toBe("unicode");
		expect(saved).toHaveLength(0);
	});

	test("commit persists exactly once", () => {
		const { manager, saved } = createManager();
		const controller = new InteractiveAppearanceController(manager);
		const draft = (() => {
			const d = structuredClone(createDefaultAppearance());
			d.markdown.tableStyle = "clean";
			return d;
		})();
		const result = controller.commit(draft);
		expect(result.valid).toBe(true);
		expect(saved).toHaveLength(1);
		expect(controller.isPreviewing()).toBe(false);
	});
});

describe("appearance construction order (F0.4)", () => {
	test("constructor initializes appearanceController before first applyAppearanceToRuntime", async () => {
		const source = await import("node:fs").then((fs) =>
			fs.readFileSync(new URL("../src/modes/interactive/interactive-mode.ts", import.meta.url), "utf8"),
		);
		const ctorStart = source.indexOf("constructor(runtimeHost");
		expect(ctorStart).toBeGreaterThan(-1);
		const ctorBody = source.slice(ctorStart);
		const assignIndex = ctorBody.indexOf("this.appearanceController = new InteractiveAppearanceController");
		const applyIndex = ctorBody.indexOf("this.applyAppearanceToRuntime();");
		expect(assignIndex).toBeGreaterThan(-1);
		expect(applyIndex).toBeGreaterThan(-1);
		expect(assignIndex).toBeLessThan(applyIndex);
	});
});

import { describe, expect, test } from "vitest";
import { createDefaultAppearance } from "../src/modes/interactive/appearance/appearance-defaults.ts";
import {
	applyTextPresentation,
	statusIndicatorColors,
	toolStateBackground,
} from "../src/modes/interactive/appearance/text-presentation.ts";
import { initTheme } from "../src/modes/interactive/theme/theme.ts";

initTheme("dark");

describe("v2 runtime presentation adapters", () => {
	test("tool state backgrounds resolve per state", () => {
		const appearance = createDefaultAppearance();
		const pending = toolStateBackground(appearance, "pending")("x");
		const success = toolStateBackground(appearance, "success")("x");
		const error = toolStateBackground(appearance, "error")("x");
		expect(pending).not.toBe(success);
		expect(success).not.toBe(error);
		expect(pending).toContain("x");
	});

	test("custom tool title styling overrides theme default", () => {
		const appearance = createDefaultAppearance();
		appearance.tools.title = {
			foreground: { kind: "custom", value: "#ff0000" },
			background: { kind: "terminal-default" },
			styles: ["bold"],
		};
		const styled = applyTextPresentation(appearance.tools.title, "title");
		expect(styled).toContain("title");
		expect(styled).toContain("\x1b[1m");
		expect(styled).not.toBe("title");
	});

	test("status indicator colors resolve per kind", () => {
		const appearance = createDefaultAppearance();
		const working = statusIndicatorColors(appearance, "working");
		const retry = statusIndicatorColors(appearance, "retry");
		expect(working.spinner("s")).not.toBe(retry.spinner("s"));
	});

	test("bash command/output/status presentation applies", () => {
		const appearance = createDefaultAppearance();
		expect(applyTextPresentation(appearance.bash.command, "$ cmd")).toContain("$ cmd");
		expect(applyTextPresentation(appearance.bash.output, "out")).toContain("out");
		expect(applyTextPresentation(appearance.bash.status, "ok")).toContain("ok");
	});

	test("system card label/body presentation applies", () => {
		const appearance = createDefaultAppearance();
		expect(applyTextPresentation(appearance.systemCards.label, "label")).toContain("label");
		expect(applyTextPresentation(appearance.systemCards.body, "body")).toContain("body");
	});

	test("default v2 appearance keeps tool/title/output tokens", () => {
		const appearance = createDefaultAppearance();
		expect(appearance.tools.title.foreground).toEqual({ kind: "theme", token: "toolTitle" });
		expect(appearance.tools.output.foreground).toEqual({ kind: "theme", token: "toolOutput" });
		expect(appearance.bash.command.foreground).toEqual({ kind: "theme", token: "bashMode" });
	});
});

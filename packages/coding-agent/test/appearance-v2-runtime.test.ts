import type { TUI } from "@zykairotis/ice-tui";
import { describe, expect, test } from "vitest";
import { createDefaultAppearance } from "../src/modes/interactive/appearance/appearance-defaults.ts";
import {
	applyTextPresentation,
	statusIndicatorColors,
	toolStateBackground,
} from "../src/modes/interactive/appearance/text-presentation.ts";
import { RetryStatusIndicator, WorkingStatusIndicator } from "../src/modes/interactive/components/status-indicator.ts";
import { initTheme } from "../src/modes/interactive/theme/theme.ts";

initTheme("dark");

const fakeUi = { requestRender: () => {} } as unknown as TUI;

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

	test("working status indicator rebinds label styling on live appearance updates", () => {
		const appearance = createDefaultAppearance();
		const indicator = new WorkingStatusIndicator(
			fakeUi,
			"Working...",
			undefined,
			appearance.statusIndicators.working,
		);
		const next = structuredClone(appearance.statusIndicators.working);
		next.label.styles = ["bold"];
		indicator.setAppearance(next);
		// The working indicator re-renders on the next animation frame or
		// setIndicator call; force one to verify the rebound closures.
		indicator.setIndicator(undefined);
		const rendered = indicator.render(80).join("\n");
		expect(rendered).toContain("\x1b[1m");
		expect(rendered).toContain("Working...");
		indicator.dispose();
	});

	test("retry status indicator updates frames and styling on live appearance updates", () => {
		const appearance = createDefaultAppearance();
		const indicator = new RetryStatusIndicator(fakeUi, 1, 3, 60_000, appearance.statusIndicators.retry);
		const before = indicator.render(80).join("\n");
		const next = structuredClone(appearance.statusIndicators.retry);
		next.label.styles = ["bold"];
		next.indicator.frames = ["▸"];
		indicator.setAppearance(next);
		const after = indicator.render(80).join("\n");
		expect(after).toContain("▸");
		expect(after).toContain("\x1b[1m");
		expect(after).not.toBe(before);
		indicator.dispose();
	});
});

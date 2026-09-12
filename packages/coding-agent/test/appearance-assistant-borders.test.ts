import type { AssistantMessage } from "@zykairotis/ice-ai";
import { describe, expect, test } from "vitest";
import { createDefaultAppearance } from "../src/modes/interactive/appearance/appearance-defaults.ts";
import type { AppearanceSettingsV2 } from "../src/modes/interactive/appearance/appearance-types.ts";
import { AssistantMessageComponent } from "../src/modes/interactive/components/assistant-message.ts";
import { initTheme } from "../src/modes/interactive/theme/theme.ts";

initTheme("dark");

const message = {
	role: "assistant",
	content: [{ type: "text", text: "hello world" }],
	stopReason: "stop",
} as unknown as AssistantMessage;

const FULL_BOX_GLYPHS = ["┌", "┐", "└", "┘", "╔", "╗", "╚", "╝", "┏", "┓", "┗", "┛", "│", "║", "┃"];

function renderWithBorderStyle(borderStyle: AppearanceSettingsV2["assistantMessage"]["borderStyle"]): string[] {
	const component = new AssistantMessageComponent(message);
	component.setAssistantAppearance({
		...createDefaultAppearance().assistantMessage,
		borderStyle,
		paddingX: 0,
		paddingY: 0,
	});
	return component.render(40).map((line) =>
		// Strip OSC133 zone markers and color sequences for structural asserts.
		line
			.replace(/\x1b\]133;[A-Z]\x07/g, "")
			.replace(/\x1b\[[0-9;]*m/g, "")
			.replace(/\x1b\[K/g, ""),
	);
}

describe("assistant message borders (appearance)", () => {
	for (const borderStyle of ["top-bottom-single", "top-bottom-double", "top-bottom-bold"] as const) {
		test(`${borderStyle} renders horizontal rules only, without side glyphs`, () => {
			const lines = renderWithBorderStyle(borderStyle);
			const joined = lines.join("\n");
			for (const glyph of FULL_BOX_GLYPHS) {
				expect(joined).not.toContain(glyph);
			}
			expect(joined).toContain("hello world");
			// Body rows keep no side borders: only markdown's own padding may lead.
			const body = lines.find((line) => line.includes("hello world"));
			expect(body?.trimStart().startsWith("hello world")).toBe(true);
		});
	}

	test("top-bottom-single draws full-width rules of the render width", () => {
		const lines = renderWithBorderStyle("top-bottom-single");
		expect(lines[0]).toBe("─".repeat(40));
		expect(lines.at(-1)).toBe("─".repeat(40));
	});

	test("full-box border styles keep their side glyphs", () => {
		const lines = renderWithBorderStyle("single");
		expect(lines[0]?.startsWith("┌")).toBe(true);
		expect(lines.at(-1)?.startsWith("└")).toBe(true);
		expect(lines.some((line) => line.includes("hello world"))).toBe(true);
		const body = lines.find((line) => line.includes("hello world"));
		expect(body?.includes("│")).toBe(true);
	});
});

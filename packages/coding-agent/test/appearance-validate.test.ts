import { describe, expect, test } from "vitest";
import { parseCustomColorToRgb } from "../src/modes/interactive/appearance/appearance-colors.ts";
import { createDefaultAppearance } from "../src/modes/interactive/appearance/appearance-defaults.ts";
import { validateAppearance } from "../src/modes/interactive/appearance/appearance-validate.ts";

describe("appearance validation", () => {
	test("missing appearance resolves to defaults", () => {
		const result = validateAppearance(undefined);
		expect(result.appearance).toEqual(createDefaultAppearance());
	});

	test("invalid version falls back to defaults", () => {
		const result = validateAppearance({ version: 99 });
		expect(result.valid).toBe(false);
		expect(result.appearance).toEqual(createDefaultAppearance());
	});

	test("malformed fields are bounded and surfaced without crashing", () => {
		const result = validateAppearance({
			version: 1,
			userMessage: {
				format: "{message} {unknown}",
				paddingX: 99,
				borderStyle: "nope",
				foreground: { kind: "custom", value: "not-a-color" },
			},
			thinking: {
				indicator: { frames: [], intervalMs: 1 },
				label: { format: "{verb} {verb}", verbs: [] },
			},
			markdown: { tableStyle: "nope" },
		});
		expect(result.valid).toBe(false);
		expect(result.appearance.userMessage.format).toBe("{message}");
		expect(result.appearance.userMessage.borderStyle).toBe("none");
		expect(result.appearance.userMessage.foreground).toEqual({ kind: "theme", token: "userMessageText" });
		expect(result.appearance.userMessage.paddingX).toBeLessThanOrEqual(8);
		expect(result.appearance.thinking.indicator.frames.length).toBeGreaterThan(0);
		expect(result.appearance.thinking.indicator.intervalMs).toBeGreaterThanOrEqual(16);
		expect(result.appearance.thinking.label.verbs.length).toBeGreaterThan(0);
		expect(result.appearance.markdown.tableStyle).toBe("unicode");
	});

	test("eight-digit hex colors are rejected instead of rendering opaque", () => {
		const result = validateAppearance({
			...structuredClone(createDefaultAppearance()),
			userMessage: { foreground: { kind: "custom", value: "#11223380" } },
		});
		expect(result.valid).toBe(false);
		expect(result.issues.some((issue) => issue.path === "userMessage.foreground")).toBe(true);
		expect(result.appearance.userMessage.foreground).toEqual({ kind: "theme", token: "userMessageText" });
		// 3- and 6-digit forms remain valid, and parsing ignores no channels.
		const sixDigit = validateAppearance({
			...structuredClone(createDefaultAppearance()),
			userMessage: { foreground: { kind: "custom", value: "#112233" } },
		});
		expect(sixDigit.valid).toBe(true);
		const threeDigit = validateAppearance({
			...structuredClone(createDefaultAppearance()),
			userMessage: { foreground: { kind: "custom", value: "#123" } },
		});
		expect(threeDigit.valid).toBe(true);
		expect(parseCustomColorToRgb("#11223380")).toBeNull();
		expect(parseCustomColorToRgb("#112233")).toEqual({ r: 0x11, g: 0x22, b: 0x33 });
		expect(parseCustomColorToRgb("#123")).toEqual({ r: 0x11, g: 0x22, b: 0x33 });
	});

	test("v1 migration survives malformed highlighter entries without throwing", () => {
		const result = validateAppearance({
			version: 1,
			inputHighlighters: [
				null,
				7,
				{},
				{ id: "no-pattern", matcher: { kind: "literal" } },
				{ id: "todo", matcher: { kind: "literal", pattern: "TODO" }, styles: ["bold"] },
			],
		});
		expect(result.valid).toBe(false);
		expect(result.appearance.inputHighlighters).toHaveLength(1);
		expect(result.appearance.inputHighlighters[0]?.matcher).toEqual({
			kind: "literal",
			pattern: "TODO",
			caseSensitive: true,
		});
		expect(result.issues.some((issue) => issue.path === "inputHighlighters[0]")).toBe(true);
		expect(result.issues.some((issue) => issue.path === "inputHighlighters[2].matcher.kind")).toBe(true);
		expect(result.issues.some((issue) => issue.path === "inputHighlighters[3].matcher.pattern")).toBe(true);
	});

	test("valid appearance round-trips", () => {
		const defaults = createDefaultAppearance();
		const result = validateAppearance(structuredClone(defaults));
		expect(result.valid).toBe(true);
		expect(result.appearance).toEqual(defaults);
	});

	test("rejects executable matcher kinds and preserves literal-only contract", () => {
		const withHighlighters = structuredClone(createDefaultAppearance());
		const result = validateAppearance({
			...withHighlighters,
			inputHighlighters: [{ matcher: { kind: "regex", pattern: "(a+)+$" } }],
		});
		expect(result.appearance.inputHighlighters).toEqual([]);
		expect(result.issues.some((issue) => issue.path === "inputHighlighters[0].matcher.kind")).toBe(true);
		const literal = validateAppearance({
			...structuredClone(createDefaultAppearance()),
			inputHighlighters: [
				{
					id: "todo",
					name: "TODO",
					enabled: true,
					matcher: { kind: "literal", pattern: "TODO" },
					styles: ["bold"],
					foreground: { kind: "custom", value: "#ff0000" },
					background: { kind: "terminal-default" },
					priority: 0,
				},
			],
		});
		expect(literal.valid).toBe(true);
		expect(literal.appearance.inputHighlighters).toHaveLength(1);
	});
});

import { describe, expect, test } from "vitest";
import type { AppearanceInputHighlighterRule } from "../src/modes/interactive/appearance/appearance-types.ts";
import { applyHighlightSpans, computeHighlightSpans } from "../src/modes/interactive/appearance/input-highlighters.ts";
import { initTheme } from "../src/modes/interactive/theme/theme.ts";

initTheme("dark");

function rule(partial: Partial<AppearanceInputHighlighterRule> & { pattern: string }): AppearanceInputHighlighterRule {
	return {
		id: partial.id ?? "r",
		name: partial.name ?? "r",
		enabled: partial.enabled ?? true,
		matcher: { kind: "literal", pattern: partial.pattern, caseSensitive: true },
		styles: partial.styles ?? [],
		foreground: partial.foreground ?? { kind: "terminal-default" },
		background: partial.background ?? { kind: "terminal-default" },
		priority: partial.priority ?? 0,
	};
}

describe("literal input highlighters (F9)", () => {
	test("literal matches produce spans", () => {
		const spans = computeHighlightSpans("TODO fix TODO", [rule({ pattern: "TODO" })]);
		expect(spans).toHaveLength(2);
		expect(spans[0]).toMatchObject({ start: 0, end: 4 });
	});

	test("overlap resolves by priority; winner claims the range", () => {
		const spans = computeHighlightSpans("abcdef", [
			rule({ id: "low", pattern: "bcde", priority: 10 }),
			rule({ id: "high", pattern: "cd", priority: 0 }),
		]);
		expect(spans).toHaveLength(1);
		expect(spans[0]).toMatchObject({ start: 2, end: 4 });
	});

	test("disabled rules and empty patterns are ignored", () => {
		expect(computeHighlightSpans("TODO", [rule({ pattern: "TODO", enabled: false })])).toEqual([]);
		expect(computeHighlightSpans("TODO", [rule({ pattern: "" })])).toEqual([]);
	});

	test("cursor/source columns are unaffected: spans index plain text", () => {
		const line = "fix TODO now";
		const spans = computeHighlightSpans(line, [
			rule({ pattern: "TODO", styles: ["bold"], foreground: { kind: "custom", value: "#ff0000" } }),
		]);
		expect(line.slice(spans[0]?.start, spans[0]?.end)).toBe("TODO");
		const styled = applyHighlightSpans(line, spans);
		expect(styled).toContain("TODO");
		expect(styled.length).toBeGreaterThan(line.length);
	});

	test("at most 64 rules apply", () => {
		const rules = Array.from({ length: 70 }, (_, i) => rule({ id: `r${i}`, pattern: `p${i}` }));
		const spans = computeHighlightSpans("p0 p1", rules);
		expect(spans.length).toBeLessThanOrEqual(2);
	});

	test("long input with maximum rules stays fast", () => {
		const line = `TODO ${"x".repeat(4000)} FIXME ${"y".repeat(4000)}`;
		const rules = Array.from({ length: 64 }, (_, i) =>
			rule({ id: `r${i}`, pattern: i % 2 === 0 ? "TODO" : "FIXME", priority: i }),
		);
		const start = performance.now();
		for (let i = 0; i < 20; i++) computeHighlightSpans(line, rules);
		expect(performance.now() - start).toBeLessThan(1000);
	});

	test("theme semantic colors use the shared appearance resolver", () => {
		const spans = computeHighlightSpans("TODO", [
			rule({ pattern: "TODO", foreground: { kind: "theme", token: "accent" } }),
		]);
		expect(spans[0]?.foreground).toContain("\x1b[");
		expect(applyHighlightSpans("TODO", spans)).toContain("TODO");
	});

	test("RGB and HSL custom colors are supported through the shared resolver", () => {
		const rgb = computeHighlightSpans("RGB", [
			rule({ pattern: "RGB", foreground: { kind: "custom", value: "rgb(255,0,0)" } }),
		]);
		const hsl = computeHighlightSpans("HSL", [
			rule({ pattern: "HSL", foreground: { kind: "custom", value: "hsl(120,100%,50%)" } }),
		]);
		expect(rgb[0]?.foreground).toContain("38;2;255;0;0");
		expect(hsl[0]?.foreground).toContain("38;2;");
	});

	test("matches are bounded per rule and per render", () => {
		const spans = computeHighlightSpans("x".repeat(5000), [rule({ pattern: "x" })]);
		expect(spans.length).toBeLessThanOrEqual(256);
	});
});

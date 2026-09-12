import { describe, expect, test } from "vitest";
import { createDefaultAppearance } from "../src/modes/interactive/appearance/appearance-defaults.ts";
import {
	applyThinkingVerbFormat,
	getThinkingIndicatorFrames,
	ThinkingVerbSelector,
} from "../src/modes/interactive/appearance/thinking-presentation.ts";
import {
	applyUserMessageFormat,
	renderUserMessageBorder,
} from "../src/modes/interactive/appearance/user-message-presentation.ts";

describe("appearance presentation helpers", () => {
	test("user message format substitutes exactly one placeholder", () => {
		expect(applyUserMessageFormat("You: {message}", "hi")).toBe("You: hi");
		expect(applyUserMessageFormat("{message}", "hi")).toBe("hi");
	});

	test("user message borders render all families without crashing", () => {
		const defaults = createDefaultAppearance().userMessage;
		const styles = [
			"none",
			"single",
			"double",
			"round",
			"bold",
			"single-double",
			"double-single",
			"classic",
			"top-bottom-single",
			"top-bottom-double",
			"top-bottom-bold",
		] as const;
		for (const style of styles) {
			const border = renderUserMessageBorder(style, 20, (text) => text);
			if (style === "none") {
				expect(border.top).toBeNull();
			} else {
				expect(border.top).not.toBeNull();
			}
		}
		expect(defaults.borderStyle).toBe("none");
	});

	test("thinking verbs cycle deterministically", () => {
		const selector = new ThinkingVerbSelector(["a", "b"]);
		expect(selector.next()).toBe("a");
		expect(selector.next()).toBe("b");
		expect(selector.next()).toBe("a");
		expect(applyThinkingVerbFormat("{verb}...", "Working")).toBe("Working...");
	});

	test("reverse mirror ping-pongs without duplicated edge frames", () => {
		const two = getThinkingIndicatorFrames({
			frames: ["a", "b"],
			intervalMs: 80,
			reverseMirror: true,
			color: { kind: "theme", token: "accent" },
		});
		expect(two).toEqual(["a", "b", "a"]);
		const three = getThinkingIndicatorFrames({
			frames: ["a", "b", "c"],
			intervalMs: 80,
			reverseMirror: true,
			color: { kind: "theme", token: "accent" },
		});
		expect(three).toEqual(["a", "b", "c", "b"]);
		const one = getThinkingIndicatorFrames({
			frames: ["a"],
			intervalMs: 80,
			reverseMirror: true,
			color: { kind: "theme", token: "accent" },
		});
		expect(one).toEqual(["a"]);
	});
});

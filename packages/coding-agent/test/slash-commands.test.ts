import { describe, expect, it } from "vitest";
import { BUILTIN_SLASH_COMMANDS } from "../src/core/slash-commands.ts";

describe("built-in slash commands", () => {
	it("registers the appearance customizer for autocomplete", () => {
		expect(BUILTIN_SLASH_COMMANDS).toContainEqual({
			name: "customize",
			description: "Customize appearance and themes",
		});
	});
});

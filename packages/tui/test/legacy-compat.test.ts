import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { getLayoutNode, LAYOUT_NODE, type LayoutNode } from "../src/layout-node.ts";
import { getTuiEnv, ICE_CURSOR_MARKER } from "../src/legacy-compat.ts";
import { TuiMainScreen } from "../src/tui-main-screen.ts";
import { VirtualTerminal } from "./virtual-terminal.ts";

class CursorProbe extends TuiMainScreen {
	probe(lines: string[], height: number): { row: number; col: number } | null {
		return this.extractCursorPosition(lines, height);
	}
}

describe("ice tui contracts", () => {
	it("recognizes the ice layout hook", () => {
		const node: LayoutNode = { type: "vstack", entries: [], gap: 0, align: "start" };
		const component = { render: () => [], invalidate: () => {}, [LAYOUT_NODE]: () => node };
		assert.equal(getLayoutNode(component), node);
	});
	it("extracts the ice hardware cursor", () => {
		const probe = new CursorProbe(new VirtualTerminal(80, 24));
		const lines = ["header", `ab${ICE_CURSOR_MARKER}cd`];
		assert.deepEqual(probe.probe(lines, 24), { row: 1, col: 2 });
		assert.deepEqual(lines, ["header", "abcd"]);
	});
	it("reads only ICE_* TUI environment values", () => {
		const current = process.env.ICE_TUI_DEBUG;
		try {
			delete process.env.ICE_TUI_DEBUG;
			assert.equal(getTuiEnv("ICE_TUI_DEBUG"), undefined);
			process.env.ICE_TUI_DEBUG = "0";
			assert.equal(getTuiEnv("ICE_TUI_DEBUG"), "0");
		} finally {
			if (current === undefined) delete process.env.ICE_TUI_DEBUG;
			else process.env.ICE_TUI_DEBUG = current;
		}
	});
});

import assert from "node:assert/strict";
import { test } from "node:test";
import type { Terminal } from "../src/terminal.ts";
import { TuiMainScreen } from "../src/tui-main-screen.ts";

class RenderProbe extends TuiMainScreen {
	paint(): void {
		this.doRender();
	}
}

test("overlay updates use absolute viewport rows after scrollback without appending frames", () => {
	const writes: string[] = [];
	const noop = (): void => {};
	const terminal: Terminal = {
		columns: 40,
		rows: 10,
		kittyProtocolActive: false,
		start: noop,
		stop: noop,
		drainInput: async () => {},
		write: (data) => {
			writes.push(data);
		},
		moveBy: noop,
		hideCursor: noop,
		showCursor: noop,
		clearLine: noop,
		clearFromCursor: noop,
		clearScreen: noop,
		setTitle: noop,
		setProgress: noop,
	};
	const tui = new RenderProbe(terminal);
	tui.addChild({ render: () => Array.from({ length: 35 }, (_, i) => `history ${i}`), invalidate: noop });
	tui.start();
	tui.paint();
	let selection = 0;
	tui.showOverlay(
		{
			render: () => Array.from({ length: 10 }, (_, i) => `${i === selection ? ">" : " "} row ${i}`.padEnd(40)),
			invalidate: noop,
		},
		{ width: "100%", maxHeight: "100%", anchor: "top-left" },
	);
	tui.paint();
	const redraws = tui.fullRedraws;
	writes.length = 0;
	selection = 1;
	tui.paint();
	const output = writes.join("");
	assert.ok(output.includes("\x1b[1;1H"));
	assert.ok(output.includes("\x1b[2;1H"));
	assert.ok(!output.includes("\r\n"), "visible overlay rows must not append terminal lines");
	assert.equal(tui.fullRedraws, redraws);
	tui.stop();
});

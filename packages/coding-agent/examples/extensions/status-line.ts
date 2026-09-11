/**
 * Status Line Extension
 *
 * Demonstrates ctx.ui.setStatus() for displaying persistent status text in the footer.
 * Shows turn progress with themed colors.
 */

import type { ExtensionAPI } from "@zykairotis/ice-coding-agent";

export default function (ice: ExtensionAPI) {
	let turnCount = 0;

	ice.on("session_start", async (_event, ctx) => {
		const theme = ctx.ui.theme;
		ctx.ui.setStatus("status-demo", theme.fg("dim", "Ready"));
	});

	ice.on("turn_start", async (_event, ctx) => {
		turnCount++;
		const theme = ctx.ui.theme;
		const spinner = theme.fg("accent", "●");
		const text = theme.fg("dim", ` Turn ${turnCount}...`);
		ctx.ui.setStatus("status-demo", spinner + text);
	});

	ice.on("turn_end", async (_event, ctx) => {
		const theme = ctx.ui.theme;
		const check = theme.fg("success", "✓");
		const text = theme.fg("dim", ` Turn ${turnCount} complete`);
		ctx.ui.setStatus("status-demo", check + text);
	});
}

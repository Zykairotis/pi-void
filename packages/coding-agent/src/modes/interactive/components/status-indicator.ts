import { type Component, Loader, type TUI } from "@zykairotis/ice-tui";
import type { WorkingIndicatorOptions } from "../../../core/extensions/index.ts";
import type { StatusIndicatorAppearance } from "../appearance/appearance-types.ts";
import { applyTextPresentation } from "../appearance/text-presentation.ts";
import { theme } from "../theme/theme.ts";
import { CountdownTimer } from "./countdown-timer.ts";
import { keyText } from "./keybinding-hints.ts";

export type StatusIndicatorKind = "working" | "retry" | "compaction" | "branchSummary";

export class StatusIndicator extends Loader {
	readonly kind: StatusIndicatorKind;

	constructor(
		kind: StatusIndicatorKind,
		ui: TUI,
		spinnerColorFn: (str: string) => string,
		messageColorFn: (str: string) => string,
		message: string,
		indicator?: WorkingIndicatorOptions,
	) {
		super(ui, spinnerColorFn, messageColorFn, message, indicator);
		this.kind = kind;
	}

	dispose(): void {
		this.stop();
	}
}

export class WorkingStatusIndicator extends StatusIndicator {
	constructor(ui: TUI, message: string, indicator?: WorkingIndicatorOptions, appearance?: StatusIndicatorAppearance) {
		super(
			"working",
			ui,
			(spinner) =>
				appearance
					? applyTextPresentation({ ...appearance.label, foreground: appearance.indicator.color }, spinner)
					: theme.fg("accent", spinner),
			(text) => (appearance ? applyTextPresentation(appearance.label, text) : theme.fg("muted", text)),
			message,
			indicator,
		);
	}
}

export class RetryStatusIndicator extends StatusIndicator {
	private countdown: CountdownTimer | undefined;

	constructor(ui: TUI, attempt: number, maxAttempts: number, delayMs: number, appearance?: StatusIndicatorAppearance) {
		const retryMessage = (seconds: number) =>
			`Retrying (${attempt}/${maxAttempts}) in ${seconds}s... (${keyText("app.interrupt")} to cancel)`;
		super(
			"retry",
			ui,
			(spinner) =>
				appearance
					? applyTextPresentation({ ...appearance.label, foreground: appearance.indicator.color }, spinner)
					: theme.fg("warning", spinner),
			(text) => (appearance ? applyTextPresentation(appearance.label, text) : theme.fg("muted", text)),
			retryMessage(Math.ceil(delayMs / 1000)),
			appearance ? { frames: appearance.indicator.frames, intervalMs: appearance.indicator.intervalMs } : undefined,
		);
		this.countdown = new CountdownTimer(
			delayMs,
			ui,
			(seconds) => {
				this.setMessage(retryMessage(seconds));
			},
			() => {
				this.countdown = undefined;
			},
		);
	}

	override dispose(): void {
		this.countdown?.dispose();
		this.countdown = undefined;
		super.dispose();
	}
}

export type CompactionStatusReason = "manual" | "threshold" | "overflow";

export class CompactionStatusIndicator extends StatusIndicator {
	constructor(ui: TUI, reason: CompactionStatusReason, appearance?: StatusIndicatorAppearance) {
		const cancelHint = `(${keyText("app.interrupt")} to cancel)`;
		const label =
			reason === "manual"
				? `Compacting context... ${cancelHint}`
				: `${reason === "overflow" ? "Context overflow detected, " : ""}Auto-compacting... ${cancelHint}`;
		super(
			"compaction",
			ui,
			(spinner) =>
				appearance
					? applyTextPresentation({ ...appearance.label, foreground: appearance.indicator.color }, spinner)
					: theme.fg("accent", spinner),
			(text) => (appearance ? applyTextPresentation(appearance.label, text) : theme.fg("muted", text)),
			label,
			appearance ? { frames: appearance.indicator.frames, intervalMs: appearance.indicator.intervalMs } : undefined,
		);
	}
}

export class BranchSummaryStatusIndicator extends StatusIndicator {
	constructor(ui: TUI, appearance?: StatusIndicatorAppearance) {
		super(
			"branchSummary",
			ui,
			(spinner) =>
				appearance
					? applyTextPresentation({ ...appearance.label, foreground: appearance.indicator.color }, spinner)
					: theme.fg("accent", spinner),
			(text) => (appearance ? applyTextPresentation(appearance.label, text) : theme.fg("muted", text)),
			`Summarizing branch... (${keyText("app.interrupt")} to cancel)`,
			appearance ? { frames: appearance.indicator.frames, intervalMs: appearance.indicator.intervalMs } : undefined,
		);
	}
}

export class IdleStatus implements Component {
	invalidate(): void {
		// No cached state to invalidate.
	}

	render(width: number): string[] {
		const emptyLine = " ".repeat(width);
		return [emptyLine, emptyLine];
	}
}

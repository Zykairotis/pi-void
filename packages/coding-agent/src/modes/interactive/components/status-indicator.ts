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

	/**
	 * Live appearance update for the currently mounted indicator. Subclasses
	 * rebind their constructor-captured color closures so customizer previews
	 * reach an active indicator without recreating it (and its timer).
	 */
	setAppearance(_appearance: StatusIndicatorAppearance): void {}

	dispose(): void {
		this.stop();
	}
}

export class WorkingStatusIndicator extends StatusIndicator {
	private readonly appearanceState: { current?: StatusIndicatorAppearance };

	constructor(ui: TUI, message: string, indicator?: WorkingIndicatorOptions, appearance?: StatusIndicatorAppearance) {
		const state: { current?: StatusIndicatorAppearance } = { current: appearance };
		super(
			"working",
			ui,
			(spinner) => {
				const current = state.current;
				return current
					? applyTextPresentation({ ...current.label, foreground: current.indicator.color }, spinner)
					: theme.fg("accent", spinner);
			},
			(text) => {
				const current = state.current;
				return current ? applyTextPresentation(current.label, text) : theme.fg("muted", text);
			},
			message,
			indicator,
		);
		this.appearanceState = state;
	}

	override setAppearance(appearance: StatusIndicatorAppearance): void {
		this.appearanceState.current = appearance;
	}
}

export class RetryStatusIndicator extends StatusIndicator {
	private countdown: CountdownTimer | undefined;
	private readonly appearanceState: { current?: StatusIndicatorAppearance };

	constructor(ui: TUI, attempt: number, maxAttempts: number, delayMs: number, appearance?: StatusIndicatorAppearance) {
		const state: { current?: StatusIndicatorAppearance } = { current: appearance };
		const retryMessage = (seconds: number) =>
			`Retrying (${attempt}/${maxAttempts}) in ${seconds}s... (${keyText("app.interrupt")} to cancel)`;
		super(
			"retry",
			ui,
			(spinner) => {
				const current = state.current;
				return current
					? applyTextPresentation({ ...current.label, foreground: current.indicator.color }, spinner)
					: theme.fg("warning", spinner);
			},
			(text) => {
				const current = state.current;
				return current ? applyTextPresentation(current.label, text) : theme.fg("muted", text);
			},
			retryMessage(Math.ceil(delayMs / 1000)),
			appearance ? { frames: appearance.indicator.frames, intervalMs: appearance.indicator.intervalMs } : undefined,
		);
		this.appearanceState = state;
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

	override setAppearance(appearance: StatusIndicatorAppearance): void {
		this.appearanceState.current = appearance;
		this.setIndicator({ frames: appearance.indicator.frames, intervalMs: appearance.indicator.intervalMs });
	}

	override dispose(): void {
		this.countdown?.dispose();
		this.countdown = undefined;
		super.dispose();
	}
}

export type CompactionStatusReason = "manual" | "threshold" | "overflow";

export class CompactionStatusIndicator extends StatusIndicator {
	private readonly appearanceState: { current?: StatusIndicatorAppearance };

	constructor(ui: TUI, reason: CompactionStatusReason, appearance?: StatusIndicatorAppearance) {
		const state: { current?: StatusIndicatorAppearance } = { current: appearance };
		const cancelHint = `(${keyText("app.interrupt")} to cancel)`;
		const label =
			reason === "manual"
				? `Compacting context... ${cancelHint}`
				: `${reason === "overflow" ? "Context overflow detected, " : ""}Auto-compacting... ${cancelHint}`;
		super(
			"compaction",
			ui,
			(spinner) => {
				const current = state.current;
				return current
					? applyTextPresentation({ ...current.label, foreground: current.indicator.color }, spinner)
					: theme.fg("accent", spinner);
			},
			(text) => {
				const current = state.current;
				return current ? applyTextPresentation(current.label, text) : theme.fg("muted", text);
			},
			label,
			appearance ? { frames: appearance.indicator.frames, intervalMs: appearance.indicator.intervalMs } : undefined,
		);
		this.appearanceState = state;
	}

	override setAppearance(appearance: StatusIndicatorAppearance): void {
		this.appearanceState.current = appearance;
		this.setIndicator({ frames: appearance.indicator.frames, intervalMs: appearance.indicator.intervalMs });
	}
}

export class BranchSummaryStatusIndicator extends StatusIndicator {
	private readonly appearanceState: { current?: StatusIndicatorAppearance };

	constructor(ui: TUI, appearance?: StatusIndicatorAppearance) {
		const state: { current?: StatusIndicatorAppearance } = { current: appearance };
		super(
			"branchSummary",
			ui,
			(spinner) => {
				const current = state.current;
				return current
					? applyTextPresentation({ ...current.label, foreground: current.indicator.color }, spinner)
					: theme.fg("accent", spinner);
			},
			(text) => {
				const current = state.current;
				return current ? applyTextPresentation(current.label, text) : theme.fg("muted", text);
			},
			`Summarizing branch... (${keyText("app.interrupt")} to cancel)`,
			appearance ? { frames: appearance.indicator.frames, intervalMs: appearance.indicator.intervalMs } : undefined,
		);
		this.appearanceState = state;
	}

	override setAppearance(appearance: StatusIndicatorAppearance): void {
		this.appearanceState.current = appearance;
		this.setIndicator({ frames: appearance.indicator.frames, intervalMs: appearance.indicator.intervalMs });
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

/**
 * Generic selector component for extensions.
 * Displays a list of string options with keyboard navigation.
 */

import {
	Container,
	getKeybindings,
	Markdown,
	ScrollView,
	Spacer,
	Text,
	type TUI,
	VStack,
} from "@earendil-works/pi-tui";
import { getMarkdownTheme, theme } from "../theme/theme.ts";
import { CountdownTimer } from "./countdown-timer.ts";
import { DynamicBorder } from "./dynamic-border.ts";
import { keyHint, rawKeyHint } from "./keybinding-hints.ts";

export interface ExtensionSelectorOptions {
	tui?: TUI;
	timeout?: number;
	content?: string;
	onToggleToolsExpanded?: () => void;
}

export class ExtensionSelectorComponent extends VStack {
	private options: string[];
	private selectedIndex = 0;
	private listContainer: Container;
	private onSelectCallback: (option: string) => void;
	private onCancelCallback: () => void;
	private titleText: Text;
	private baseTitle: string;
	private countdown: CountdownTimer | undefined;
	private onToggleToolsExpanded: (() => void) | undefined;
	private reviewScrollView: ScrollView | undefined;

	constructor(
		title: string,
		options: string[],
		onSelect: (option: string) => void,
		onCancel: () => void,
		opts?: ExtensionSelectorOptions,
	) {
		super();

		this.options = options;
		this.onSelectCallback = onSelect;
		this.onCancelCallback = onCancel;
		this.onToggleToolsExpanded = opts?.onToggleToolsExpanded;
		this.baseTitle = title;

		this.addChild(new DynamicBorder(), { shrink: 0 });
		this.addChild(new Spacer(1), { shrink: 0 });

		this.titleText = new Text(theme.fg("accent", theme.bold(title)), 1, 0);
		this.addChild(this.titleText, { shrink: 0 });
		this.addChild(new Spacer(1), { shrink: 0 });
		if (opts?.content) {
			this.reviewScrollView = new ScrollView(new Markdown(opts.content, 1, 0, getMarkdownTheme()), {
				scrollbar: "auto",
				overscroll: "contain",
			});
			this.addChild(this.reviewScrollView, { basis: "auto", grow: 1, shrink: 1, minSize: 1 });
			this.addChild(new Spacer(1), { shrink: 0 });
		}

		if (opts?.timeout && opts.timeout > 0 && opts.tui) {
			this.countdown = new CountdownTimer(
				opts.timeout,
				opts.tui,
				(s) => this.titleText.setText(theme.fg("accent", theme.bold(`${this.baseTitle} (${s}s)`))),
				() => this.onCancelCallback(),
			);
		}

		this.listContainer = new Container();
		this.addChild(this.listContainer, { shrink: 0, minSize: this.options.length });
		this.addChild(new Spacer(1), { shrink: 0 });
		this.addChild(
			new Text(
				rawKeyHint("↑↓", "navigate") +
					(this.reviewScrollView ? `  ${rawKeyHint("page↑↓", "review")}` : "") +
					"  " +
					keyHint("tui.select.confirm", "select") +
					"  " +
					keyHint("tui.select.cancel", "cancel"),
				1,
				0,
			),
			{ shrink: 0 },
		);
		this.addChild(new Spacer(1), { shrink: 0 });
		this.addChild(new DynamicBorder(), { shrink: 0 });

		this.updateList();
	}

	private updateList(): void {
		this.listContainer.clear();
		for (let i = 0; i < this.options.length; i++) {
			const isSelected = i === this.selectedIndex;
			const text = isSelected
				? theme.fg("accent", "→ ") + theme.fg("accent", this.options[i])
				: `  ${theme.fg("text", this.options[i])}`;
			this.listContainer.addChild(new Text(text, 1, 0));
		}
	}

	handleInput(keyData: string): void {
		const kb = getKeybindings();
		if (kb.matches(keyData, "app.tools.expand")) {
			this.onToggleToolsExpanded?.();
		} else if (this.reviewScrollView && kb.matches(keyData, "tui.select.pageUp")) {
			this.reviewScrollView.scrollBy(-Math.max(1, this.reviewScrollView.viewportHeight - 2));
		} else if (this.reviewScrollView && kb.matches(keyData, "tui.select.pageDown")) {
			this.reviewScrollView.scrollBy(Math.max(1, this.reviewScrollView.viewportHeight - 2));
		} else if (kb.matches(keyData, "tui.select.up") || keyData === "k") {
			this.selectedIndex = Math.max(0, this.selectedIndex - 1);
			this.updateList();
		} else if (kb.matches(keyData, "tui.select.down") || keyData === "j") {
			this.selectedIndex = Math.min(this.options.length - 1, this.selectedIndex + 1);
			this.updateList();
		} else if (kb.matches(keyData, "tui.select.confirm") || keyData === "\n") {
			const selected = this.options[this.selectedIndex];
			if (selected) this.onSelectCallback(selected);
		} else if (kb.matches(keyData, "tui.select.cancel")) {
			this.onCancelCallback();
		}
	}

	dispose(): void {
		this.countdown?.dispose();
	}
}

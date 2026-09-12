import {
	applyChromeBorder,
	Container,
	Loader,
	Markdown,
	type MarkdownTheme,
	Spacer,
	Text,
	type TUI,
} from "@zykairotis/ice-tui";
import { KeybindingsManager } from "../../../core/keybindings.ts";
import { resolveAppearanceColorFn } from "../appearance/appearance-resolve.ts";
import type { AppearanceSettingsV2 } from "../appearance/appearance-types.ts";
import { applyHighlightSpans, computeHighlightSpans } from "../appearance/input-highlighters.ts";
import {
	applyTextPresentation,
	markdownThemeWithAppearance,
	toolStateBackground,
} from "../appearance/text-presentation.ts";
import {
	applyThinkingVerbFormat,
	getThinkingIndicatorFrames,
	styleThinkingBlockText,
} from "../appearance/thinking-presentation.ts";
import { getEditorTheme, getMarkdownTheme, theme } from "../theme/theme.ts";
import { AssistantMessageComponent } from "./assistant-message.ts";
import { BashExecutionComponent } from "./bash-execution.ts";
import { CustomEditor } from "./custom-editor.ts";
import { CustomMessageComponent } from "./custom-message.ts";
import { ToolExecutionComponent } from "./tool-execution.ts";
import { UserMessageComponent } from "./user-message.ts";

/** Scene tabs for the live preview (plan 27.1). */
export type PreviewScene = "all" | "conversation" | "markdown" | "tools" | "input" | "chrome" | "footer";

export const PREVIEW_SCENES: PreviewScene[] = ["all", "conversation", "markdown", "tools", "input", "chrome", "footer"];

/** Border glyphs for the input presentation demo (subset shared with the editor). */
const INPUT_BORDER_GLYPHS: Record<string, { tl: string; tr: string; bl: string; br: string; h: string; v: string }> = {
	single: { tl: "┌", tr: "┐", bl: "└", br: "┘", h: "─", v: "│" },
	double: { tl: "╔", tr: "╗", bl: "╚", br: "╝", h: "═", v: "║" },
	round: { tl: "╭", tr: "╮", bl: "╰", br: "╯", h: "─", v: "│" },
	bold: { tl: "┏", tr: "┓", bl: "┗", br: "┛", h: "━", v: "┃" },
};

export const DEFAULT_HIGHLIGHTER_TEST_TEXT = "TODO fix this  // FIXME later";

/** Representative preview built from the same renderers/presentation helpers used by interactive mode. */
export class AppearancePreviewComponent extends Container {
	private appearance: AppearanceSettingsV2;
	private scene: PreviewScene = "all";
	private highlighterTestText = DEFAULT_HIGHLIGHTER_TEST_TEXT;
	private readonly ui?: TUI;
	private loaders: Loader[] = [];
	private bashPreviews: BashExecutionComponent[] = [];

	constructor(appearance: AppearanceSettingsV2, ui?: TUI) {
		super();
		this.appearance = structuredClone(appearance);
		this.ui = ui;
		this.rebuild();
	}

	/** Preview a representative Markdown sample with the same adapter as production. */
	private markdownTheme(): MarkdownTheme {
		return markdownThemeWithAppearance(getMarkdownTheme(), this.appearance.markdown);
	}

	setAppearance(appearance: AppearanceSettingsV2): void {
		this.appearance = structuredClone(appearance);
		this.rebuild();
	}

	setScene(scene: PreviewScene): void {
		if (this.scene === scene) return;
		this.scene = scene;
		this.rebuild();
	}

	getHighlighterTestText(): string {
		return this.highlighterTestText;
	}

	/** Bounded user-editable sample used by the highlighter preview (plan 24.3). */
	setHighlighterTestText(text: string): void {
		const next = text.slice(0, 200);
		if (this.highlighterTestText === next) return;
		this.highlighterTestText = next;
		this.rebuild();
	}

	getScene(): PreviewScene {
		return this.scene;
	}

	dispose(): void {
		for (const loader of this.loaders) loader.stop();
		for (const bash of this.bashPreviews) bash.dispose();
		this.loaders = [];
		this.bashPreviews = [];
	}

	/** Input presentation demo: real border family/padding/colors, harmless text. */
	private addInputDemo(shows: boolean): void {
		if (!shows) return;
		const a = this.appearance.inputBox;
		const activeColor = resolveAppearanceColorFn(a.activeBorderColor, "fg");
		const idleColor = resolveAppearanceColorFn(a.idleBorderColor, "fg");
		if (this.ui) {
			const editor = new CustomEditor(
				this.ui,
				{ ...getEditorTheme(), borderColor: activeColor },
				new KeybindingsManager(),
				{ paddingX: a.paddingX, borderStyle: a.borderStyle },
			);
			editor.setText("editor content");
			this.addChild(editor);
			this.addChild(new Text(idleColor("Idle border color preview"), 0, 0));
			return;
		}
		const glyphs = INPUT_BORDER_GLYPHS[a.borderStyle];
		const inner = Math.max(10, 34 - a.paddingX * 2);
		if (!glyphs) {
			this.addChild(new Text(idleColor(`${" ".repeat(a.paddingX)}editor content (border none)`), 1, 0));
			return;
		}
		const pad = " ".repeat(a.paddingX);
		const top = activeColor(`${glyphs.tl}${glyphs.h.repeat(inner + a.paddingX * 2)}${glyphs.tr}`);
		const contentCell = `${pad}editor content`.padEnd(inner + a.paddingX * 2);
		const row = activeColor(glyphs.v) + idleColor(contentCell) + activeColor(glyphs.v);
		const bottom = activeColor(`${glyphs.bl}${glyphs.h.repeat(inner + a.paddingX * 2)}${glyphs.br}`);
		this.addChild(new Text(top, 1, 0));
		this.addChild(new Text(row, 0, 0));
		this.addChild(new Text(bottom, 0, 0));
	}

	/** Highlighter demo rendered through the real source-coordinate pipeline. */
	private addHighlighterDemo(shows: boolean): void {
		if (!shows) return;
		const line = this.highlighterTestText;
		const spans = computeHighlightSpans(line, this.appearance.inputHighlighters);
		this.addChild(new Text(applyHighlightSpans(line, spans), 1, 0));
	}

	private addToolLines(shows: boolean, showAll = false): void {
		if (!shows) return;
		const a = this.appearance;
		if (this.ui) {
			const states: Array<{
				state: "pending" | "success" | "error";
				result?: { content: Array<{ type: string; text: string }>; isError: boolean };
			}> = showAll
				? [
						{ state: "pending" },
						{ state: "success", result: { content: [{ type: "text", text: "preview result" }], isError: false } },
						{ state: "error", result: { content: [{ type: "text", text: "preview error" }], isError: true } },
					]
				: [{ state: "success", result: { content: [{ type: "text", text: "preview result" }], isError: false } }];
			for (const entry of states) {
				const tool = new ToolExecutionComponent(
					"preview_tool",
					`preview-${entry.state}`,
					{ path: "src/example.ts" },
					{ showImages: false, toolsAppearance: a.tools },
					undefined,
					this.ui,
					process.cwd(),
				);
				tool.markExecutionStarted();
				tool.setArgsComplete();
				if (entry.result) tool.updateResult(entry.result);
				this.addChild(tool);
			}
		} else {
			const toolBg = (state: "pending" | "success" | "error"): string =>
				toolStateBackground(a, state)(` Tool ${state} `);
			this.addChild(
				new Text(
					`${toolBg("pending")}${toolBg("success")}${toolBg("error")} ${applyTextPresentation(a.tools.title, "Tool title")} ${applyTextPresentation(a.tools.output, "output")}`,
					1,
					0,
				),
			);
		}
		this.addBashStates(showAll);
		this.addChild(
			new Text(
				`${applyTextPresentation(a.diff.added, "+ added")} ${applyTextPresentation(a.diff.removed, "- removed")} ${applyTextPresentation(a.diff.context, " context")}`,
				1,
				0,
			),
		);
	}

	/**
	 * Bash running/success/failure states (plan 2834-2836). Each state uses the
	 * configured border family/colors, padding, and command/output/status text
	 * presentations over bounded fake data.
	 */
	private addBashStates(all: boolean): void {
		const bash = this.appearance.bash;
		if (this.ui) {
			const states: Array<{ output: string; exitCode?: number; running?: boolean }> = all
				? [
						{ output: "running suite…", running: true },
						{ output: "42 passing", exitCode: 0 },
						{ output: "1 failing", exitCode: 1 },
					]
				: [{ output: "42 passing", exitCode: 0 }];
			for (const state of states) {
				const component = new BashExecutionComponent("npm test", this.ui, false, bash);
				component.setBashAppearance(bash);
				component.appendOutput(state.output);
				if (!state.running) component.setComplete(state.exitCode, false);
				this.bashPreviews.push(component);
				this.addChild(component);
			}
			return;
		}
		const states: { command: string; output: string; status: string }[] = all
			? [
					{ command: "$ npm test", output: "running suite…", status: "…" },
					{ command: "$ npm test", output: "42 passing", status: "exit 0" },
					{ command: "$ npm test", output: "1 failing", status: "exit 1" },
				]
			: [{ command: "$ npm test", output: "42 passing", status: "exit 0" }];
		const borderColor = resolveAppearanceColorFn(bash.borderColor, "fg");
		const pad = " ".repeat(bash.paddingX);
		for (const state of states) {
			const inner = [
				applyTextPresentation(bash.command, `${pad}${state.command}`),
				applyTextPresentation(bash.output, `${pad}${state.output}`),
				applyTextPresentation(bash.status, `${pad}${state.status}`),
			];
			applyChromeBorder(inner, 40, bash.borderStyle, borderColor).forEach((line, index) => {
				this.addChild(new Text(line, index === 0 ? 1 : 0, 0));
			});
		}
	}

	private addChromeLines(shows: boolean): void {
		if (!shows) return;
		const a = this.appearance;
		this.addChild(
			new Text(
				`${applyTextPresentation(
					{
						foreground: a.chrome.selectedForeground,
						background: a.chrome.selectedBackground,
						styles: a.chrome.selectedStyles,
					},
					" Selected setting ",
				)} ${applyTextPresentation(a.chrome.hint, "Esc back")}`,
				1,
				0,
			),
		);
		this.addChild(
			new Text(
				`${applyTextPresentation(a.subagentChrome.running, "● running")} ${applyTextPresentation(a.subagentChrome.attention, "● attention")} ${applyTextPresentation(a.subagentChrome.failed, "○ failed")}`,
				1,
				0,
			),
		);
	}

	/** Per-kind status indicator preview (plan G8): frames[0] + label per kind. */
	private addStatusIndicatorLines(shows: boolean, showAll = false): void {
		if (!shows) return;
		const kinds: ("working" | "retry" | "compaction" | "branchSummary")[] = showAll
			? ["working", "retry", "compaction", "branchSummary"]
			: ["working"];
		for (const kind of kinds) {
			const entry = this.appearance.statusIndicators[kind];
			const color = resolveAppearanceColorFn(entry.indicator.color, "fg");
			const labelText = `${kind} · ${entry.indicator.intervalMs}ms`;
			if (this.ui && entry.indicator.frames.length > 1) {
				const loader = new Loader(
					this.ui,
					(frame) => color(frame),
					(text) => applyTextPresentation(entry.label, text),
					labelText,
					{ frames: entry.indicator.frames, intervalMs: entry.indicator.intervalMs },
				);
				this.loaders.push(loader);
				this.addChild(loader);
			} else {
				const frame = color(entry.indicator.frames[0] ?? "·");
				const label = applyTextPresentation(entry.label, labelText);
				this.addChild(new Text(`${frame} ${label}`, 1, 0));
			}
		}
	}

	private rebuild(): void {
		this.dispose();
		this.clear();
		const a = this.appearance;
		const s = this.scene;
		this.addChild(new Spacer(1));
		this.addChild(new Text(theme.bold(theme.fg("accent", `Live appearance preview — ${s}`)), 0, 0));
		this.addChild(new Spacer(1));

		if (s === "all" || s === "conversation") {
			const user = new UserMessageComponent("Preview user message with **Markdown**.", this.markdownTheme(), 1);
			user.setAppearance(a.userMessage);
			this.addChild(user);

			const assistant = new AssistantMessageComponent(
				{ role: "assistant", content: [{ type: "text", text: "Assistant **Markdown** preview." }] } as never,
				false,
				this.markdownTheme(),
				a.thinking.block.hiddenLabel,
				1,
			);
			assistant.setAssistantAppearance(a.assistantMessage);
			assistant.setThinkingAppearance(a.thinking.block);
			this.addChild(assistant);

			const thinkingText = a.thinking.block.showByDefault ? "Reasoning preview text" : a.thinking.block.hiddenLabel;
			const styledThinking = styleThinkingBlockText(thinkingText, a.thinking.block.styles, theme);
			this.addChild(new Text(resolveAppearanceColorFn(a.thinking.block.foreground, "fg")(styledThinking), 1, 0));

			this.addChild(
				new CustomMessageComponent(
					{ role: "custom", customType: "system", content: "Preview custom/system card" } as never,
					undefined,
					this.markdownTheme(),
					1,
					a.systemCards,
				),
			);

			const indicatorColor = resolveAppearanceColorFn(a.thinking.indicator.color, "fg");
			const frames = getThinkingIndicatorFrames(a.thinking.indicator).map((frame) => indicatorColor(frame));
			const verb = a.thinking.label.verbs[0] ?? "Thinking";
			const label = applyThinkingVerbFormat(a.thinking.label.format, verb);
			if (this.ui) {
				const loader = new Loader(
					this.ui,
					(value) => value,
					(value) => theme.fg("text", value),
					label,
					{ frames, intervalMs: a.thinking.indicator.intervalMs },
				);
				this.loaders.push(loader);
				this.addChild(loader);
			} else {
				const frame = frames[0] ?? indicatorColor("·");
				this.addChild(new Text(`${frame} ${label}`, 1, 0));
			}
		}

		if (s === "all" || s === "markdown") {
			this.addChild(
				new Markdown(
					"# Heading\n\nBody with **strong** and *emphasis*, `code`, a [link](https://example.com), and ~~struck~~.\n\n> Quote line\n\n- list item\n\n---\n\n| Setting | Preview |\n| --- | --- |\n| Table style | active |",
					1,
					0,
					this.markdownTheme(),
					undefined,
					{ tableStyle: a.markdown.tableStyle },
				),
			);
		}

		if (s === "all" || s === "input") {
			const inputColor = resolveAppearanceColorFn(a.inputBox.activeBorderColor, "fg");
			this.addChild(
				new Text(inputColor(`Input: ${a.inputBox.borderStyle} border · padding ${a.inputBox.paddingX}`), 1, 0),
			);
			this.addInputDemo(true);
			this.addHighlighterDemo(true);
		}

		this.addToolLines(s === "all" || s === "tools", s === "tools");

		if (s === "all" || s === "conversation" || s === "chrome") {
			const working = a.statusIndicators.working;
			const workingColor = resolveAppearanceColorFn(working.indicator.color, "fg");
			this.addChild(
				new Text(
					`${workingColor(working.indicator.frames[0] ?? "·")} ${applyTextPresentation(working.label, "Working")}`,
					1,
					0,
				),
			);
		}

		this.addChromeLines(s === "all" || s === "chrome");
		this.addStatusIndicatorLines(s === "all" || s === "chrome", s === "chrome");

		if (s === "all" || s === "footer") {
			this.addChild(
				new Text(
					`${applyTextPresentation(a.footer.primary, "~/project · main")} ${applyTextPresentation(a.footer.secondary, "42%/128k · model")}`,
					1,
					0,
				),
			);
		}
	}
}

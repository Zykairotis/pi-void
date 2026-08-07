import { describe, expect, it, vi } from "vitest";
import { InteractiveMode } from "../src/modes/interactive/interactive-mode.ts";

type SubmitContext = {
	defaultEditor: { onSubmit?: (text: string) => void };
	editor: {
		addToHistory?: (text: string) => void;
		setText: (text: string) => void;
	};
	session: {
		isCompacting: boolean;
		isStreaming: boolean;
		isBashRunning: boolean;
		getFastMode: () => boolean;
		setFastMode: (enabled: boolean) => void;
		supportsFastMode: () => boolean;
		prompt: (text: string, options?: unknown) => Promise<void>;
	};
	flushPendingBashComponents: () => void;
	showStatus: (message: string) => void;
	showWarning: (message: string) => void;
	showError: (message: string) => void;
	handleFastCommand: (argument: string) => void;
	onInputCallback?: (text: string) => void;
	pendingUserInputs: string[];
};

type InputContext = {
	onInputCallback?: (text: string) => void;
	pendingUserInputs: string[];
};

type InteractiveModePrivate = {
	setupEditorSubmitHandler(this: SubmitContext): void;
	handleFastCommand(this: SubmitContext, argument: string): void;
	getUserInput(this: InputContext): Promise<string>;
};

const interactiveModePrototype = InteractiveMode.prototype as unknown as InteractiveModePrivate;

function createSubmitContext(): SubmitContext {
	const context: SubmitContext = {
		defaultEditor: {},
		editor: {
			addToHistory: vi.fn(),
			setText: vi.fn(),
		},
		session: {
			isCompacting: false,
			isStreaming: false,
			isBashRunning: false,
			getFastMode: () => false,
			setFastMode: vi.fn(),
			supportsFastMode: () => true,
			prompt: vi.fn(async () => {}),
		},
		flushPendingBashComponents: vi.fn(),
		showStatus: vi.fn(),
		showWarning: vi.fn(),
		showError: vi.fn(),
		handleFastCommand: vi.fn(),
		pendingUserInputs: [],
	};
	context.handleFastCommand = (argument) => interactiveModePrototype.handleFastCommand.call(context, argument);
	return context;
}

describe("InteractiveMode startup input", () => {
	it("queues a normal prompt submitted before the input callback is installed", async () => {
		const context = createSubmitContext();
		interactiveModePrototype.setupEditorSubmitHandler.call(context);

		await context.defaultEditor.onSubmit?.(" early prompt ");

		expect(context.pendingUserInputs).toEqual(["early prompt"]);
		expect(context.flushPendingBashComponents).toHaveBeenCalledTimes(1);
		expect(context.editor.addToHistory).toHaveBeenCalledWith("early prompt");
	});

	it("returns queued startup input before installing a new input callback", async () => {
		const context: InputContext = {
			pendingUserInputs: ["queued prompt"],
		};

		await expect(interactiveModePrototype.getUserInput.call(context)).resolves.toBe("queued prompt");
		expect(context.onInputCallback).toBeUndefined();
		expect(context.pendingUserInputs).toEqual([]);
	});

	it("toggles persisted fast mode with the /fast command", async () => {
		let fastMode = false;
		const context = createSubmitContext();
		context.session.getFastMode = () => fastMode;
		context.session.setFastMode = (enabled) => {
			fastMode = enabled;
		};
		interactiveModePrototype.setupEditorSubmitHandler.call(context);

		await context.defaultEditor.onSubmit?.("/fast");

		expect(fastMode).toBe(true);
		expect(context.showStatus).toHaveBeenCalledWith("Fast mode: on");
		expect(context.session.prompt).not.toHaveBeenCalled();
	});

	it("rejects fast mode without changing settings for an unsupported model", async () => {
		const context = createSubmitContext();
		context.session.supportsFastMode = () => false;
		interactiveModePrototype.setupEditorSubmitHandler.call(context);

		await context.defaultEditor.onSubmit?.("/fast on");

		expect(context.session.setFastMode).not.toHaveBeenCalled();
		expect(context.showWarning).toHaveBeenCalledWith("Fast mode is unavailable for the current model.");
		expect(context.session.prompt).not.toHaveBeenCalled();
	});
});

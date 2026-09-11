import { describe, expect, test, vi } from "vitest";
import { Container } from "../../tui/src/tui.ts";
import { InteractiveMode } from "../src/modes/interactive/interactive-mode.ts";

function makeFake() {
	return {
		chatContainer: new Container(),
		ui: { requestRender: vi.fn() },
		pendingRetryErrorComponent: undefined,
	};
}

describe("InteractiveMode.discardPendingRetryError", () => {
	test("removes the stashed error component and clears the field", () => {
		const fakeThis: any = makeFake();
		const stub = { render: () => ["ERR"], invalidate: () => {} };
		fakeThis.chatContainer.addChild(stub);
		fakeThis.chatContainer.addChild({ render: () => ["OTHER"], invalidate: () => {} });
		fakeThis.pendingRetryErrorComponent = stub;

		(InteractiveMode as any).prototype.discardPendingRetryError.call(fakeThis);

		expect(fakeThis.pendingRetryErrorComponent).toBeUndefined();
		expect(fakeThis.chatContainer.children).toHaveLength(1);
		expect(fakeThis.ui.requestRender).toHaveBeenCalled();
	});

	test("is a no-op when nothing is pending", () => {
		const fakeThis: any = makeFake();

		(InteractiveMode as any).prototype.discardPendingRetryError.call(fakeThis);

		expect(fakeThis.pendingRetryErrorComponent).toBeUndefined();
		expect(fakeThis.chatContainer.children).toHaveLength(0);
		expect(fakeThis.ui.requestRender).not.toHaveBeenCalled();
	});
});

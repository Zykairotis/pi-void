import { setKeybindings } from "@zykairotis/ice-tui";
import { beforeAll, describe, expect, it, vi } from "vitest";
import { KeybindingsManager } from "../src/core/keybindings.ts";
import iceProviderSettings, {
	createProvidersSubmenu,
	formatProviderDescription,
} from "../src/ice-provider-settings.ts";
import { initTheme } from "../src/modes/interactive/theme/theme.ts";
import { createTestExtensionsResult } from "./utilities.ts";

const LOCAL_SUMMARY = {
	id: "local",
	name: "local",
	modelCount: 269,
	baseUrl: "http://127.0.0.1:20128/v1",
};

describe("ice provider settings", () => {
	beforeAll(() => {
		initTheme("dark");
		setKeybindings(new KeybindingsManager());
	});

	it("formats provider rows with model count and base URL", () => {
		expect(formatProviderDescription(LOCAL_SUMMARY)).toBe("269 models · http://127.0.0.1:20128/v1");
		expect(formatProviderDescription({ id: "anthropic", name: "Anthropic", modelCount: 3 })).toBe(
			"3 models · built-in",
		);
	});

	it("registers a Providers submenu on the hidden ice extension", async () => {
		const loaded = await createTestExtensionsResult([
			{ name: "ice-provider-settings", factory: iceProviderSettings },
		]);
		const settings = loaded.extensions[0]?.settings?.get("providers");
		expect(settings?.items[0]?.label).toBe("Providers");
		expect(settings?.items[0]?.submenu).toEqual(expect.any(Function));
	});

	it("lists providers and refetches the selected catalog", async () => {
		const onRefetch = vi.fn(async () => ({ ok: true as const, providerId: "local", count: 270 }));
		const notify = vi.fn();
		const submenu = createProvidersSubmenu({
			summaries: [LOCAL_SUMMARY, { id: "anthropic", name: "Anthropic", modelCount: 3 }],
			onRefetch,
			onCancel: vi.fn(),
			ui: { notify, setStatus: vi.fn() },
		});

		const list = submenu.render(80).join("\n");
		expect(list).toContain("local");
		expect(list).toContain("269 models · http://127.0.0.1:20128/v1");
		expect(list).toContain("anthropic");

		submenu.handleInput?.("\r");
		const detail = submenu.render(80).join("\n");
		expect(detail).toContain("Refetch catalog");
		expect(detail).toContain("269");

		submenu.handleInput?.("\x1b[B");
		submenu.handleInput?.("\r");
		await vi.waitFor(() => expect(onRefetch).toHaveBeenCalledWith("local", expect.any(AbortSignal)));
		await vi.waitFor(() => expect(notify).toHaveBeenCalledWith("Refetched local: 270 models", "info"));
		expect(submenu.render(80).join("\n")).toContain("270");
	});

	it("ignores a second refetch while one is in flight", async () => {
		let resolveRefetch: ((result: { ok: true; providerId: string; count: number }) => void) | undefined;
		const onRefetch = vi.fn(
			() =>
				new Promise<{ ok: true; providerId: string; count: number }>((resolve) => {
					resolveRefetch = resolve;
				}),
		);
		const submenu = createProvidersSubmenu({
			summaries: [LOCAL_SUMMARY],
			onRefetch,
			onCancel: vi.fn(),
		});

		submenu.handleInput?.("\r");
		submenu.handleInput?.("\x1b[B");
		submenu.handleInput?.("\r");
		submenu.handleInput?.("\r");
		await vi.waitFor(() => expect(onRefetch).toHaveBeenCalledOnce());
		resolveRefetch?.({ ok: true, providerId: "local", count: 1 });
		await vi.waitFor(() => expect(submenu.render(80).join("\n")).toContain("1"));
	});
});

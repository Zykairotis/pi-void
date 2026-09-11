import { describe, expect, it } from "vitest";
import { InMemorySettingsStorage, type Settings, SettingsManager } from "../src/core/settings-manager.ts";

function fixture(global: Settings, project: Settings, globalFirst = true) {
	const storage = new InMemorySettingsStorage();
	storage.withLock("global", () => JSON.stringify(global));
	storage.withLock("project", () => JSON.stringify(project));
	return { storage, manager: SettingsManager.fromStorage(storage, { globalFirst, projectTrusted: true }) };
}

describe("ICE explicit shared-settings precedence", () => {
	it("keeps false, zero, empty strings and arrays as explicit global values", () => {
		const { manager } = fixture(
			{ quietStartup: false, httpIdleTimeoutMs: 0, shellCommandPrefix: "", skills: [], theme: "global" },
			{
				quietStartup: true,
				httpIdleTimeoutMs: 900,
				shellCommandPrefix: "prefix",
				skills: ["project"],
				theme: "project",
			},
		);
		expect(manager.getQuietStartup()).toBe(false);
		expect(manager.getHttpIdleTimeoutMs()).toBe(0);
		expect(manager.getShellCommandPrefix()).toBe("");
		expect(manager.getSkillPaths()).toEqual([]);
		expect(manager.getTheme()).toBe("global");
		expect(manager.getSettingSource("quietStartup")).toBe("global");
		expect(manager.getSettingSource("unknown.value")).toBeUndefined();
	});

	it("merges nested leaves without inventing an explicit global default", () => {
		const { manager } = fixture(
			{ retry: { enabled: false, provider: { maxRetries: 0 } } },
			{ retry: { enabled: true, maxRetries: 2, provider: { maxRetries: 4, timeoutMs: 500 } } },
		);
		expect(manager.getRetrySettings()).toMatchObject({ enabled: false, maxRetries: 2 });
		expect(manager.getProviderRetrySettings()).toMatchObject({ maxRetries: 0, timeoutMs: 500 });
		expect(manager.getSettingSource("retry.provider.maxRetries")).toBe("global");
		expect(manager.getSettingSource("retry.provider.timeoutMs")).toBe("project");
	});

	it("replaces arrays instead of concatenating privileges or duplicating resources", () => {
		const { manager } = fixture({ enabledModels: ["global/model"] }, { enabledModels: ["project/model"] });
		expect(manager.getEnabledModels()).toEqual(["global/model"]);
	});

	it("preserves upstream project-first defaults when the option is omitted", () => {
		const { storage } = fixture({ theme: "global", quietStartup: false }, { theme: "project", quietStartup: true });
		const manager = SettingsManager.fromStorage(storage);
		expect(manager.isGlobalFirst()).toBe(false);
		expect(manager.getTheme()).toBe("project");
		expect(manager.getQuietStartup()).toBe(true);
		expect(manager.getSettingSource("theme")).toBe("project");
	});

	it("retains precedence through scoped saves, reload, revocation and re-trust", async () => {
		const { storage, manager } = fixture({ theme: "global" }, { theme: "project", quietStartup: true });
		manager.setSettingValue("project", "theme", "project-new");
		await manager.flush();
		expect(manager.getTheme()).toBe("global");
		storage.withLock("project", (raw) => {
			expect(JSON.parse(raw!).theme).toBe("project-new");
			return undefined;
		});
		storage.withLock("global", (raw) => {
			expect(JSON.parse(raw!).theme).toBe("global");
			return JSON.stringify({ theme: "global-new" });
		});
		await manager.reload();
		expect(manager.getTheme()).toBe("global-new");
		manager.setProjectTrusted(false);
		expect(manager.getQuietStartup()).toBe(false);
		expect(manager.getTheme()).toBe("global-new");
		manager.setProjectTrusted(true);
		expect(manager.getQuietStartup()).toBe(true);
		expect(manager.getTheme()).toBe("global-new");
		manager.setTheme("saved-global");
		await manager.flush();
		await manager.reload();
		expect(manager.getTheme()).toBe("saved-global");
	});

	it("lets explicit runtime overrides specialize preferences without persisting them", () => {
		const { manager } = fixture({ theme: "global" }, { theme: "project" });
		manager.applyOverrides({ theme: "runtime" });
		expect(manager.getTheme()).toBe("runtime");
		expect(manager.getGlobalSettings().theme).toBe("global");
		expect(manager.getProjectSettings().theme).toBe("project");
		const copy = manager.getEffectiveSettings();
		copy.theme = "tampered";
		expect(manager.getTheme()).toBe("runtime");
	});

	it("does not load or write an untrusted project", async () => {
		const { storage } = fixture({}, { theme: "project" });
		const manager = SettingsManager.fromStorage(storage, { globalFirst: true, projectTrusted: false });
		expect(manager.getTheme()).toBeUndefined();
		expect(manager.getProjectSettings()).toEqual({});
		expect(() => manager.setSettingValue("project", "theme", "new")).toThrow(/not trusted/);
		await manager.reload();
		expect(manager.getTheme()).toBeUndefined();
	});
});

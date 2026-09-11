import { mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { getThemesDir } from "../src/config.ts";
import {
	getAvailableThemes,
	getAvailableThemesWithPaths,
	getThemeByName,
	loadThemeFromPath,
	setRegisteredThemes,
} from "../src/modes/interactive/theme/theme.ts";

type ThemeFile = {
	name: string;
	vars?: Record<string, string | number>;
	colors: Record<string, string | number>;
};

const bundledThemeNames = readdirSync(getThemesDir())
	.filter((file) => file.endsWith(".json") && file !== "theme-schema.json")
	.map((file) => file.slice(0, -".json".length))
	.sort();

describe("theme picker", () => {
	let tempRoot: string;

	beforeEach(() => {
		tempRoot = mkdtempSync(join(tmpdir(), "ice-theme-picker-"));
		const agentDir = join(tempRoot, "agent");
		vi.stubEnv("ICE_CODING_AGENT_DIR", agentDir);
		mkdirSync(join(agentDir, "themes"), { recursive: true });
		setRegisteredThemes([]);
	});

	afterEach(() => {
		setRegisteredThemes([]);
		rmSync(tempRoot, { recursive: true, force: true });
		vi.unstubAllEnvs();
	});

	it("discovers and loads all bundled themes", () => {
		expect(bundledThemeNames).toHaveLength(100);
		expect(getAvailableThemes()).toEqual(bundledThemeNames);
		for (const name of bundledThemeNames) {
			expect(getAvailableThemesWithPaths()).toContainEqual({
				name,
				path: join(getThemesDir(), `${name}.json`),
			});

			const bundledTheme = loadThemeFromPath(join(getThemesDir(), `${name}.json`));
			expect(getThemeByName(name), name).toBeDefined();
			expect(bundledTheme?.fg("accent", "accent")).toContain("accent");
			expect(bundledTheme?.bg("selectedBg", "selected")).toContain("selected");
		}
	});

	it("uses custom theme content names instead of file names", () => {
		const darkTheme = JSON.parse(
			readFileSync(new URL("../src/modes/interactive/theme/dark.json", import.meta.url), "utf-8"),
		) as ThemeFile;
		const customTheme: ThemeFile = {
			...darkTheme,
			name: "bar",
		};

		const themePath = join(process.env.ICE_CODING_AGENT_DIR!, "themes", "foo.json");
		writeFileSync(themePath, JSON.stringify(customTheme, null, 2));

		expect(getAvailableThemes()).toContain("bar");
		expect(getAvailableThemes()).not.toContain("foo");
		expect(getAvailableThemesWithPaths()).toContainEqual({ name: "bar", path: themePath });
		expect(getAvailableThemesWithPaths().some((theme) => theme.name === "foo")).toBe(false);
	});
});

import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { loadConfig, resolveCompactAfterTokens, saveConfig } from "./unified-config.ts";

const tempDirs: string[] = [];

afterEach(() => {
	for (const directory of tempDirs.splice(0)) rmSync(directory, { recursive: true, force: true });
	delete process.env.ICE_CODING_AGENT_DIR;
	delete process.env.ICE_BLACKHOLE_COMPACT_AFTER_PERCENT;
	delete process.env.ICE_BLACKHOLE_COMPACT_AFTER_TOKENS;
});

function useConfig(raw: Record<string, unknown>): void {
	const directory = mkdtempSync(join(tmpdir(), "ice-blackhole-"));
	tempDirs.push(directory);
	mkdirSync(join(directory, "ice-blackhole"));
	writeFileSync(join(directory, "ice-blackhole", "ice-blackhole-config.json"), JSON.stringify(raw));
	process.env.ICE_CODING_AGENT_DIR = directory;
}

describe("ice-blackhole unified config", () => {
	it("resolves a percentage against the active model context window", () => {
		useConfig({ compactAfterPercent: 20 });
		const config = loadConfig();
		expect(config.compactAfterPercent).toBe(20);
		expect(resolveCompactAfterTokens(config, 272000)).toBe(54400);
		expect(resolveCompactAfterTokens(config, 64000)).toBe(12800);
	});

	it("keeps the explicit token threshold when both modes are configured", () => {
		useConfig({ compactAfterPercent: 20, compactAfterTokens: 50000 });
		const warnings: string[] = [];
		const config = loadConfig((message) => warnings.push(message));
		expect(config.compactAfterPercent).toBeUndefined();
		expect(resolveCompactAfterTokens(config, 272000)).toBe(50000);
		expect(warnings).toHaveLength(1);
	});

	it("skips percentage mode when model context metadata is unavailable", () => {
		useConfig({ compactAfterPercent: 20 });
		const warnings: string[] = [];
		const config = loadConfig();
		expect(resolveCompactAfterTokens(config, undefined, (message) => warnings.push(message))).toBeUndefined();
		expect(warnings).toHaveLength(1);
	});

	it("writes only the selected threshold mode", () => {
		useConfig({ compactAfterTokens: 50000 });
		saveConfig({ compactAfterPercent: 20 });
		const raw = JSON.parse(
			readFileSync(join(tempDirs[0], "ice-blackhole", "ice-blackhole-config.json"), "utf8"),
		) as Record<string, unknown>;
		expect(raw.compactAfterPercent).toBe(20);
		expect(raw.compactAfterTokens).toBeUndefined();
	});

	it("keeps percentage mode when an unrelated setting is saved", () => {
		useConfig({ compactAfterPercent: 86 });
		saveConfig({ midRunCompaction: "resume" });
		const raw = JSON.parse(
			readFileSync(join(tempDirs[0], "ice-blackhole", "ice-blackhole-config.json"), "utf8"),
		) as Record<string, unknown>;
		expect(raw.compactAfterPercent).toBe(86);
		expect(raw.compactAfterTokens).toBeUndefined();
		expect(loadConfig().compactAfterPercent).toBe(86);
	});
});

import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { discoverAndLoadExtensions } from "../../src/core/extensions/loader.ts";

describe("extension imports", () => {
	let tempDir: string;
	let extensionsDir: string;

	beforeEach(() => {
		tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "ice-extension-imports-"));
		extensionsDir = path.join(tempDir, "extensions");
		fs.mkdirSync(extensionsDir);
	});

	afterEach(() => {
		fs.rmSync(tempDir, { recursive: true, force: true });
	});

	async function loadExtension(fileName: string, source: string) {
		fs.writeFileSync(path.join(extensionsDir, fileName), source);
		return discoverAndLoadExtensions([], tempDir, tempDir);
	}

	it("loads an extension that imports ICE specifiers", async () => {
		const result = await loadExtension(
			"ice-imports.ts",
			`
				import { getAgentDir } from "@zykairotis/ice-coding-agent";
				import { Agent } from "@zykairotis/ice-agent-core";
				import { getCapabilities } from "@zykairotis/ice-tui";
				export default function(ice) {
					void getAgentDir;
					void Agent;
					void getCapabilities;
					ice.registerCommand("ice-imports", { handler: async () => {} });
				}
			`,
		);
		expect(result.errors).toEqual([]);
		expect(result.extensions).toHaveLength(1);
		expect(result.extensions[0]?.commands.has("ice-imports")).toBe(true);
	});

	it("does not resolve historical pi package specifiers", async () => {
		const result = await loadExtension(
			"legacy-pi.ts",
			`
				import { getAgentDir } from "@mariozechner/pi-coding-agent";
				export default function(ice) {
					void getAgentDir;
					ice.registerCommand("legacy-pi", { handler: async () => {} });
				}
			`,
		);
		expect(result.extensions).toEqual([]);
		expect(result.errors).toHaveLength(1);
		expect(result.errors[0]?.error).toContain("pi-coding-agent");
	});
});

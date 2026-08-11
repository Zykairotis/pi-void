import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import {
	validateManifest,
	validateTarget,
} from "../src/manifest.ts";
import {
	assertRepeatAllowed,
	validateScenarioCatalog,
} from "../src/scenarios.ts";
import { resolveGitHead } from "../src/git.ts";

const validSource = {
	repo: "https://example.test/pi.git",
	commit: "0123456789abcdef0123456789abcdef01234567",
};

function validManifest() {
	return {
		schemaVersion: 1,
		executions: [
			{
				provider: "openai",
				model: "cx/gpt-5.6-luna",
				apiKeyEnv: "PIV_LOCAL_API_KEY",
				baseUrl: "http://127.0.0.1:20128/v1",
				api: "openai-responses",
				contextWindow: 272000,
				maxTokens: 128000,
				reasoning: true,
				input: ["text"],
			}
		],
		targets: [
			{ id: "pi-stock", source: { ...validSource } },
			{ id: "pi-native-example", source: { ...validSource } },
			{ id: "pi-subagents", source: { ...validSource } },
			{ id: "pi-void", source: { commit: "CURRENT_WORKSPACE" } },
		],
	};
}

function validCatalog() {
	return {
		schemaVersion: 1,
		scenarios: [
			{ id: "scope.symlink-replacement", class: "deterministic", category: "scope" },
			{ id: "quality.correctness", class: "model_quality", category: "quality" },
		],
	};
}

test("accepts the four target IDs and current-workspace sentinel", () => {
	assert.equal(validateManifest(validManifest()).targets.length, 4);
});

test("rejects duplicate target IDs", () => {
	const manifest = validManifest();
	manifest.targets[1].id = "pi-stock";
	assert.throws(() => validateManifest(manifest), /duplicate target id: pi-stock/);
});

test("rejects malformed commit values", () => {
	assert.throws(
		() => validateTarget({ id: "pi-stock", source: { ...validSource, commit: "not-a-sha" } }),
		/invalid commit for pi-stock/,
	);
});

test("restricts the current-workspace sentinel to pi-void", () => {
	assert.throws(
		() => validateTarget({ id: "pi-stock", source: { commit: "CURRENT_WORKSPACE" } }),
		/current workspace sentinel is only valid for pi-void/,
	);
	assert.throws(
		() => validateTarget({ id: "pi-void", source: validSource }),
		/pi-void must use the current workspace sentinel/,
	);
});

test("accepts explicitly unavailable external baselines", () => {
	const manifest = validManifest();
	manifest.targets[0].source.commit = "PENDING_EXTERNAL_BASELINE";
	manifest.targets[0].status = "unavailable_until_pinned";
	assert.equal(validateManifest(manifest).targets[0].status, "unavailable_until_pinned");
});

test("rejects pending baselines without unavailable status", () => {
	const manifest = validManifest();
	manifest.targets[0].source.commit = "PENDING_EXTERNAL_BASELINE";
	assert.throws(() => validateManifest(manifest), /pending baseline must be marked unavailable/);
});

test("rejects duplicate scenario IDs", () => {
	const catalog = validCatalog();
	catalog.scenarios.push(catalog.scenarios[0]);
	assert.throws(() => validateScenarioCatalog(catalog), /duplicate scenario id: scope.symlink-replacement/);
});

test("rejects invalid scenario classes and categories", () => {
	assert.throws(
		() => validateScenarioCatalog({ schemaVersion: 1, scenarios: [{ id: "x", class: "unknown", category: "scope" }] }),
		/invalid scenario class for x/,
	);
	assert.throws(
		() => validateScenarioCatalog({ schemaVersion: 1, scenarios: [{ id: "x", class: "deterministic", category: "other" }] }),
		/invalid scenario category for x/,
	);
});

test("rejects repeated deterministic scenarios", () => {
	assert.throws(
		() => assertRepeatAllowed({ id: "x", class: "deterministic", category: "scope" }, 2),
		/repeat > 1 is only allowed for model_quality scenarios/,
	);
	assert.doesNotThrow(() => assertRepeatAllowed({ id: "x", class: "model_quality", category: "quality" }, 2));
});

test("resolves an exact git HEAD without mutating the checkout", async () => {
	const dir = await mkdtemp(join(tmpdir(), "piv-b8-git-"));
	try {
		await writeFile(join(dir, "fixture.txt"), "fixture\n");
		execFileSync("git", ["init", "--quiet", dir]);
		execFileSync("git", ["-C", dir, "add", "fixture.txt"]);
		execFileSync("git", [
			"-C",
			dir,
			"-c",
			"user.name=Pi Void Test",
			"-c",
			"user.email=test@example.invalid",
			"commit",
			"--quiet",
			"-m",
			"fixture",
		]);
		const before = execFileSync("git", ["-C", dir, "status", "--porcelain"], { encoding: "utf8" });
		const result = resolveGitHead(dir);
		const after = execFileSync("git", ["-C", dir, "status", "--porcelain"], { encoding: "utf8" });
		assert.match(result, /^[0-9a-f]{40}$/);
		assert.equal(after, before);
	} finally {
		await rm(dir, { recursive: true, force: true });
	}
});

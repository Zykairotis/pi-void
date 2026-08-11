import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { parseArgs, runCli } from "../src/cli.ts";

const workspacePath = process.cwd();

function io(outputPath) {
	const stdout = [];
	const stderr = [];
	return {
		options: {
			workspacePath,
			outputPath,
			stdout: (line) => stdout.push(line),
			stderr: (line) => stderr.push(line),
			runObservation: async () => ({ success: false, verificationStatus: "test", failureCode: "adapter_test" }),
		},
		stdout,
		stderr,
	};
}

test("parses explicit target and scenario options", () => {
	assert.deepEqual(parseArgs(["--target", "pi-void", "--scenario", "quality.correctness-and-evidence", "--repeat", "2"]), {
		mode: "target",
		targetId: "pi-void",
		model: undefined,
		scenarioClass: undefined,
		scenarioId: "quality.correctness-and-evidence",
		repeat: 2,
	});
});

test("rejects unknown flags and missing mode", () => {
	assert.throws(() => parseArgs(["--unknown"]), /unknown option: --unknown/);
	assert.throws(() => parseArgs([]), /one of --target, --matrix, or --smoke is required/);
	assert.throws(() => parseArgs(["--smoke"]), /--model is required for --matrix and --smoke/);
	assert.throws(() => parseArgs(["--matrix"]), /--model is required for --matrix and --smoke/);
	assert.deepEqual(parseArgs(["--matrix", "--model", "cx/gpt-5.6-luna", "--class", "deterministic"]), {
		mode: "matrix",
		targetId: undefined,
		model: "cx/gpt-5.6-luna",
		scenarioClass: "deterministic",
		scenarioId: undefined,
		repeat: 1,
	});
	assert.throws(() => parseArgs(["--matrix", "--model", "cx/gpt-5.6-luna", "--class", "unknown"]), /invalid scenario class/);
	assert.equal(parseArgs(["--smoke", "--model", "cmc/deepseek/deepseek-v4-pro"]).model, "cmc/deepseek/deepseek-v4-pro");
	assert.throws(
		() => parseArgs(["--smoke", "--model", "cx/gpt-5.6-luna", "--repeat", "2"]),
		/--smoke does not accept --repeat/,
	);
});

test("rejects deterministic repetition before target execution", async () => {
	const dir = await mkdtemp(join(tmpdir(), "piv-b8-cli-"));
	try {
		const captured = io(join(dir, "repeat.jsonl"));
		const exitCode = await runCli(
			["--target", "pi-void", "--scenario", "scope.symlink-replacement", "--repeat", "2"],
			captured.options,
		);
		assert.equal(exitCode, 2);
		assert.match(captured.stderr.join("\n"), /repeat > 1 is only allowed for model_quality scenarios/);
	} finally {
		await rm(dir, { recursive: true, force: true });
	}
});

test("runs Pi Void-only mode and writes resolved commit provenance", async () => {
	const dir = await mkdtemp(join(tmpdir(), "piv-b8-cli-"));
	try {
		const outputPath = join(dir, "run.jsonl");
		const captured = io(outputPath);
		const exitCode = await runCli(["--target", "pi-void", "--scenario", "quality.correctness-and-evidence"], captured.options);
		assert.equal(exitCode, 0);
		const rows = (await readFile(outputPath, "utf8")).trim().split("\n").map((line) => JSON.parse(line));
		assert.equal(rows.length, 2);
		assert.equal(rows[0].implementation, "pi-void");
		assert.match(rows[0].resolvedCommit, /^[0-9a-f]{40}$/);
		assert.equal(rows[0].provider, "openai");
		assert.equal(rows[0].success, false);
		assert.equal(rows[0].failureCode, "adapter_test");
		assert.equal("checkoutPath" in rows[0], false);
		assert.match(captured.stdout.join("\n"), /wrote 2 benchmark results/);
	} finally {
		await rm(dir, { recursive: true, force: true });
	}
});

test("smoke runs the selected model route across all four targets", async () => {
	const dir = await mkdtemp(join(tmpdir(), "piv-b8-cli-"));
	try {
		const captured = io(join(dir, "smoke.jsonl"));
		captured.options.runObservation = async () => ({
			success: true,
			verificationStatus: "agent_completed",
			observedOutputBytes: 1,
		});
		const exitCode = await runCli(["--smoke", "--model", "cx/gpt-5.6-luna"], captured.options);
		assert.equal(exitCode, 0);
		const rows = (await readFile(join(dir, "smoke.jsonl"), "utf8")).trim().split("\n").map((line) => JSON.parse(line));
		assert.equal(rows.length, 4);
		assert.ok(rows.every((row) => row.model === "cx/gpt-5.6-luna" && row.observedOutputBytes > 0));
	} finally {
		await rm(dir, { recursive: true, force: true });
	}
});

test("provider preflight fails before target execution when the credential is absent", async () => {
	const originalCredential = process.env.PIV_LOCAL_API_KEY;
	delete process.env.PIV_LOCAL_API_KEY;
	try {
		const dir = await mkdtemp(join(tmpdir(), "piv-b8-cli-"));
		try {
			const captured = io(join(dir, "preflight.jsonl"));
			let invoked = false;
			captured.options.runObservation = async () => {
				invoked = true;
				return { success: true, observedOutputBytes: 1 };
			};
			const exitCode = await runCli(["--smoke", "--model", "cx/gpt-5.6-luna"], captured.options);
			assert.equal(exitCode, 2);
			assert.equal(invoked, false);
			assert.match(captured.stderr.join("\n"), /benchmark provider credential PIV_LOCAL_API_KEY unavailable/);
		} finally {
			await rm(dir, { recursive: true, force: true });
		}
	} finally {
		if (originalCredential === undefined) delete process.env.PIV_LOCAL_API_KEY;
		else process.env.PIV_LOCAL_API_KEY = originalCredential;
	}
});

test("full matrix fails clearly when an external baseline is unavailable", async () => {
	const dir = await mkdtemp(join(tmpdir(), "piv-b8-cli-"));
	try {
		const manifestPath = join(dir, "manifest.json");
		await writeFile(
			manifestPath,
			JSON.stringify({
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
					{
						id: "pi-stock",
						source: { commit: "PENDING_EXTERNAL_BASELINE" },
						status: "unavailable_until_pinned",
					},
					{ id: "pi-native-example", source: { commit: "0123456789abcdef0123456789abcdef01234567" } },
					{ id: "pi-subagents", source: { commit: "0123456789abcdef0123456789abcdef01234567" } },
					{ id: "pi-void", source: { commit: "CURRENT_WORKSPACE" } },
				],
			}),
		);
		const captured = io(join(dir, "matrix.jsonl"));
		captured.options.manifestPath = manifestPath;
		const exitCode = await runCli(["--matrix", "--model", "cx/gpt-5.6-luna", "--class", "deterministic"], captured.options);
		assert.equal(exitCode, 2);
		assert.match(captured.stderr.join("\n"), /benchmark target pi-stock@PENDING_EXTERNAL_BASELINE unavailable/);
	} finally {
		await rm(dir, { recursive: true, force: true });
	}
});

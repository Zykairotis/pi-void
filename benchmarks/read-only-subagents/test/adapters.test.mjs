import assert from "node:assert/strict";
import { chmod, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { runPiCli } from "../src/adapters/command.ts";

test("normalizes an agent error as a failed observation", async () => {
	const dir = await mkdtemp(join(tmpdir(), "piv-b8-adapter-"));
	const command = join(dir, "fake-target.mjs");
	await writeFile(
		command,
		[
			"#!/usr/bin/env node",
			"console.log(JSON.stringify({ type: 'agent_start' }));",
			"const message = { role: 'assistant', content: [], stopReason: 'error', usage: { input: 0, output: 0, cost: { total: 0 } } };",
			"console.log(JSON.stringify({ type: 'message_end', message }));",
			"console.log(JSON.stringify({ type: 'agent_end', messages: [message] }));",
		].join("\n"),
	);
	await chmod(command, 0o755);
	try {
		const observation = await runPiCli(
			{
				id: "pi-void",
				checkoutPath: dir,
				sourcePath: dir,
				resolvedCommit: "0123456789abcdef0123456789abcdef01234567",
				execution: {
					provider: "openai",
					model: "cx/gpt-5.6-luna",
					apiKeyEnv: "PIV_LOCAL_API_KEY",
					baseUrl: "http://127.0.0.1:20128/v1",
					api: "openai-responses",
					contextWindow: 272000,
					maxTokens: 128000,
					reasoning: true,
					input: ["text"],
				},
			},
			{ id: "lifecycle.provider-startup-failure", class: "deterministic", category: "lifecycle" },
			{ commandPath: () => command },
		);
		assert.equal(observation.success, false);
		assert.equal(observation.failureCode, "agent_error");
	} finally {
		await rm(dir, { recursive: true, force: true });
	}
});

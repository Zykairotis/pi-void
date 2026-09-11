import { join } from "node:path";
import { resolveGitHead } from "../git.ts";
import { runIceCli, validateIceCliTarget } from "./command.ts";
import {
	BenchmarkTargetUnavailableError,
	prepareTarget,
	type BenchmarkContext,
	type BenchmarkTargetAdapter,
} from "../targets.ts";
import type { BenchmarkTarget } from "../manifest.ts";

export const iceSubagentsAdapter: BenchmarkTargetAdapter = {
	id: "ice-subagents",
	prepare: async (context: BenchmarkContext, target: BenchmarkTarget) => {
		const prepared = await prepareTarget(target, context);
		if (context.hostCheckoutPath === undefined || context.hostCommit === undefined) {
			throw new BenchmarkTargetUnavailableError(target.id, target.source.commit);
		}
		try {
			if (resolveGitHead(context.hostCheckoutPath) !== context.hostCommit) {
				throw new BenchmarkTargetUnavailableError(target.id, target.source.commit);
			}
		} catch {
			throw new BenchmarkTargetUnavailableError(target.id, target.source.commit);
		}
		return validateIceCliTarget(
			{ ...prepared, runtimePath: context.hostCheckoutPath },
			target,
			{
				commandPath: (candidate) =>
					join(candidate.runtimePath ?? candidate.checkoutPath, "packages", "coding-agent", "dist", "cli.js"),
				extensionPath: (candidate) => join(candidate.sourcePath, "index.ts"),
				agentSourcePath: (candidate) => join(candidate.sourcePath, "agents"),
			},
		);
	},
	run: (target, scenario) =>
		runIceCli(target, scenario, {
			commandPath: (prepared) => join(prepared.runtimePath ?? prepared.checkoutPath, "packages", "coding-agent", "dist", "cli.js"),
			extensionPath: (prepared) => join(prepared.sourcePath, "index.ts"),
			agentSourcePath: (prepared) => join(prepared.sourcePath, "agents"),
		}),
};

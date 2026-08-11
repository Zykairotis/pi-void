import { join } from "node:path";
import { preparePiCliTarget, runPiCli } from "./command.ts";
import type { BenchmarkTargetAdapter } from "../targets.ts";

export const piNativeExampleAdapter: BenchmarkTargetAdapter = {
	id: "pi-native-example",
	prepare: (context, target) =>
		preparePiCliTarget(context, target, {
			commandPath: (prepared) => join(prepared.checkoutPath, "packages", "coding-agent", "dist", "cli.js"),
			extensionPath: (prepared) => join(prepared.sourcePath, "index.ts"),
			agentSourcePath: (prepared) => join(prepared.sourcePath, "agents"),
		}),
	run: (target, scenario) =>
		runPiCli(target, scenario, {
			commandPath: (prepared) => join(prepared.checkoutPath, "packages", "coding-agent", "dist", "cli.js"),
			extensionPath: (prepared) => join(prepared.sourcePath, "index.ts"),
			agentSourcePath: (prepared) => join(prepared.sourcePath, "agents"),
		}),
};

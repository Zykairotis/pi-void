import { join } from "node:path";
import { preparePiCliTarget, runPiCli } from "./command.ts";
import type { BenchmarkTargetAdapter } from "../targets.ts";

export const piStockAdapter: BenchmarkTargetAdapter = {
	id: "pi-stock",
	prepare: (context, target) =>
		preparePiCliTarget(context, target, {
			commandPath: (prepared) => join(prepared.sourcePath, "dist", "cli.js"),
		}),
	run: (target, scenario) =>
		runPiCli(target, scenario, {
			commandPath: (prepared) => join(prepared.sourcePath, "dist", "cli.js"),
		}),
};

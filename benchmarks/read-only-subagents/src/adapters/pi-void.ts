import { join } from "node:path";
import { preparePiCliTarget, runPiCli } from "./command.ts";
import type { BenchmarkTargetAdapter } from "../targets.ts";

export const piVoidAdapter: BenchmarkTargetAdapter = {
	id: "pi-void",
	prepare: (context, target) =>
		preparePiCliTarget(context, target, {
			commandPath: (prepared) => join(prepared.checkoutPath, "packages", "coding-agent", "dist", "piv.js"),
		}),
	run: (target, scenario) =>
		runPiCli(target, scenario, {
			commandPath: (prepared) => join(prepared.checkoutPath, "packages", "coding-agent", "dist", "piv.js"),
		}),
};

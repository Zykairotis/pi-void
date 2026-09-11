import { join } from "node:path";
import { prepareIceCliTarget, runIceCli } from "./command.ts";
import type { BenchmarkTargetAdapter } from "../targets.ts";

export const iceVoidAdapter: BenchmarkTargetAdapter = {
	id: "ice",
	prepare: (context, target) =>
		prepareIceCliTarget(context, target, {
			commandPath: (prepared) => join(prepared.checkoutPath, "packages", "coding-agent", "dist", "ice.js"),
		}),
	run: (target, scenario) =>
		runIceCli(target, scenario, {
			commandPath: (prepared) => join(prepared.checkoutPath, "packages", "coding-agent", "dist", "ice.js"),
		}),
};

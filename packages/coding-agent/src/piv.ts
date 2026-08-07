#!/usr/bin/env node
import { getAgentDir } from "./config.ts";
import { configureHttpDispatcher } from "./core/http-dispatcher.ts";
import { main } from "./main.ts";
import pivCogneeExtension from "./piv-cognee.ts";
import { refreshLocalModels } from "./piv-provider.ts";
import pivSafeVerify, { validatePivStartupArgs } from "./piv-safe-verify.ts";

process.title = "piv";
process.env.PI_CODING_AGENT = "true";
process.emitWarning = (() => {}) as typeof process.emitWarning;
configureHttpDispatcher();

try {
	validatePivStartupArgs(process.argv.slice(2));
} catch (error) {
	console.error(error instanceof Error ? error.message : String(error));
	process.exit(1);
}

const refresh = await refreshLocalModels(getAgentDir());
if (!refresh.updated) {
	console.error(`[piv] Model refresh failed; using last valid catalog: ${refresh.error}`);
}

await main(process.argv.slice(2), {
	extensionFactories: [
		{ name: "piv-safe-verify", factory: pivSafeVerify, hidden: true, priority: "before-user" },
		{ name: "piv-cognee", factory: pivCogneeExtension, hidden: true, priority: "before-user" },
	],
});

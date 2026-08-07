#!/usr/bin/env node
import { getAgentDir } from "./config.ts";
import { configureHttpDispatcher } from "./core/http-dispatcher.ts";
import { main } from "./main.ts";
import pivCogneeExtension from "./piv-cognee.ts";
import { refreshLocalModelsForStartup } from "./piv-provider.ts";
import pivSafeVerify, { validatePivStartupArgs } from "./piv-safe-verify.ts";

process.title = "piv";
process.env.PI_CODING_AGENT = "true";
process.emitWarning = (() => {}) as typeof process.emitWarning;
configureHttpDispatcher();

const args = process.argv.slice(2);
try {
	validatePivStartupArgs(args);
} catch (error) {
	console.error(error instanceof Error ? error.message : String(error));
	process.exit(1);
}

const offlineEnv = process.env.PI_OFFLINE?.toLowerCase();
const offline = args.includes("--offline") || offlineEnv === "1" || offlineEnv === "true" || offlineEnv === "yes";
const metadataOnly = args.some(
	(argument) => argument === "--help" || argument === "-h" || argument === "--version" || argument === "-v",
);
await refreshLocalModelsForStartup(getAgentDir(), {
	skip: offline || metadataOnly,
	onFailure: (error) => console.error(`[piv] Model refresh failed; using last valid catalog: ${error}`),
});

await main(process.argv.slice(2), {
	extensionFactories: [
		{ name: "piv-safe-verify", factory: pivSafeVerify, hidden: true, priority: "before-user" },
		{ name: "piv-cognee", factory: pivCogneeExtension, hidden: true, priority: "before-user" },
	],
});

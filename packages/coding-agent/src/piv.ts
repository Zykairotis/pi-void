#!/usr/bin/env node
import { getAgentDir } from "./config.ts";
import { configureHttpDispatcher } from "./core/http-dispatcher.ts";
import { main } from "./main.ts";
import { refreshLocalModels } from "./piv-provider.ts";

process.title = "piv";
process.env.PI_CODING_AGENT = "true";
process.emitWarning = (() => {}) as typeof process.emitWarning;
configureHttpDispatcher();

const refresh = await refreshLocalModels(getAgentDir());
if (!refresh.updated) {
	console.error(`[piv] Model refresh failed; using last valid catalog: ${refresh.error}`);
}

await main(process.argv.slice(2));

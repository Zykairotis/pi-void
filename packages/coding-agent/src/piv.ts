#!/usr/bin/env node
process.title = "piv";

import { getAgentDir } from "./config.js";
import { main } from "./main.js";
import { refreshLocalModels } from "./piv-provider.js";

const refresh = await refreshLocalModels(getAgentDir());
if (!refresh.updated) {
	console.error(`[piv] Model refresh failed; using last valid catalog: ${refresh.error}`);
}

await main(process.argv.slice(2));

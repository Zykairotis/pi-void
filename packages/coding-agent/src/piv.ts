#!/usr/bin/env node
import { join } from "node:path";
import { getAgentDir } from "./config.ts";
import { configureHttpDispatcher } from "./core/http-dispatcher.ts";
import { main } from "./main.ts";
import { formatAgentPackImportResult, importRufloAgentPack } from "./piv-agent-packs.ts";
import { PivAgentViewBridge } from "./piv-agent-view-bridge.ts";
import pivCogneeExtension from "./piv-cognee.ts";
import { refreshLocalModelsForStartup } from "./piv-provider.ts";
import pivProviderSettings from "./piv-provider-settings.ts";
import {
	createPivSafeVerify,
	type PivCapabilityState,
	type PivMode,
	validatePivStartupArgs,
} from "./piv-safe-verify.ts";
import pivSubagents, { normalizeUnsafeSubagentStartupArgs } from "./piv-subagents.ts";

process.title = "piv";
process.env.PI_CODING_AGENT = "true";
process.emitWarning = (() => {}) as typeof process.emitWarning;
configureHttpDispatcher();

const rawArgs = process.argv.slice(2);
const importPackArgs = rawArgs.filter((arg) => arg === "--import-agent-pack" || arg.startsWith("--import-agent-pack="));
if (importPackArgs.length > 1) {
	console.error("--import-agent-pack may be provided only once");
	process.exit(1);
}
if (importPackArgs.length === 1) {
	const importIndex = rawArgs.findIndex(
		(arg) => arg === "--import-agent-pack" || arg.startsWith("--import-agent-pack="),
	);
	const source = importPackArgs[0]!.startsWith("--import-agent-pack=")
		? importPackArgs[0]!.slice("--import-agent-pack=".length)
		: rawArgs[importIndex + 1];
	if (!source || source.startsWith("-")) {
		console.error("--import-agent-pack requires a Ruflo repository path");
		process.exit(1);
	}
	try {
		const result = importRufloAgentPack(source, { targetDir: join(getAgentDir(), "agents") });
		console.log(formatAgentPackImportResult(result));
		process.exit(0);
	} catch (error) {
		console.error(error instanceof Error ? error.message : String(error));
		process.exit(1);
	}
}
let args: string[];
try {
	args = normalizeUnsafeSubagentStartupArgs(rawArgs, {
		stdinIsTTY: process.stdin.isTTY === true,
		stdoutIsTTY: process.stdout.isTTY === true,
	});
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

let currentPivMode: PivMode | undefined;
let currentPivCapabilityState: PivCapabilityState | undefined;
const agentViewBridge = new PivAgentViewBridge();
const pivSafeVerify = createPivSafeVerify({
	onModeChange: async (mode) => {
		currentPivMode = mode;
	},
	onCapabilityChange: async (capabilities) => {
		currentPivMode = capabilities.mode;
		currentPivCapabilityState = capabilities;
	},
});

await main(args, {
	agentViewBridge,
	extensionFactories: [
		{ name: "piv-safe-verify", factory: pivSafeVerify, hidden: true, priority: "before-user" },
		{ name: "piv-provider-settings", factory: pivProviderSettings, hidden: true, priority: "before-user" },
		{ name: "piv-cognee", factory: pivCogneeExtension, hidden: true, priority: "before-user" },
		{
			name: "piv-subagents",
			factory: (pi) =>
				pivSubagents(pi, {
					agentViewBridge,
					getPivMode: () => currentPivMode,
					getPivCapabilityState: () => currentPivCapabilityState,
				}),
			hidden: true,
			priority: "before-user",
		},
	],
});

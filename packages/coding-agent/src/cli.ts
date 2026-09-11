#!/usr/bin/env node
/**
 * Stock Ice CLI entry point (no ICE-only extensions).
 * Uses main.ts with AgentSession and new mode modules.
 *
 * Test with: npx tsx src/cli-new.ts [args...]
 */
import "./core/legacy-compat/bootstrap.ts";
import { configureHttpDispatcher } from "./core/http-dispatcher.ts";
import { main } from "./main.ts";

process.title = "ice";
process.env.ICE_CODING_AGENT = "true";
process.env.AI_AGENT = "ice";
process.emitWarning = (() => {}) as typeof process.emitWarning;

// Configure undici's global dispatcher before provider SDKs issue requests.
// Runtime settings are applied once SettingsManager has loaded global/project settings.
configureHttpDispatcher();

main(process.argv.slice(2));

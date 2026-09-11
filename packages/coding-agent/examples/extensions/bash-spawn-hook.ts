/**
 * Bash Spawn Hook Example
 *
 * Adjusts command, cwd, and env before execution.
 *
 * Usage:
 *   ice -e ./bash-spawn-hook.ts
 */

import type { ExtensionAPI } from "@zykairotis/ice-coding-agent";
import { createBashTool } from "@zykairotis/ice-coding-agent";

export default function (ice: ExtensionAPI) {
	const cwd = process.cwd();

	const bashTool = createBashTool(cwd, {
		spawnHook: ({ command, cwd, env }) => ({
			command: `source ~/.profile\n${command}`,
			cwd,
			env: { ...env, ICE_SPAWN_HOOK: "1" },
		}),
	});

	ice.registerTool({
		...bashTool,
		execute: async (id, params, signal, onUpdate, _ctx) => {
			return bashTool.execute(id, params, signal, onUpdate);
		},
	});
}

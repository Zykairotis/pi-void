/**
 * Extensions Configuration
 *
 * Extensions intercept agent events and can register custom tools.
 * They provide a unified system for extensions, custom tools, commands, and more.
 *
 * By default, extension files are discovered from:
 * - ~/.ice/agent/extensions/
 * - <cwd>/.ice/extensions/
 * - Paths specified in settings.json "extensions" array
 *
 * An extension is a TypeScript file that exports a default function:
 *   export default function (ice: ExtensionAPI) { ... }
 */

import { createAgentSession, DefaultResourceLoader, getAgentDir, SessionManager } from "@zykairotis/ice-coding-agent";

// Extensions are discovered automatically from standard locations.
// You can also add paths via settings.json or DefaultResourceLoader options.

const resourceLoader = new DefaultResourceLoader({
	cwd: process.cwd(),
	agentDir: getAgentDir(),
	additionalExtensionPaths: ["./my-logging-extension.ts", "./my-safety-extension.ts"],
	extensionFactories: [
		(ice) => {
			ice.on("agent_start", () => {
				console.log("[Inline Extension] Agent starting");
			});
		},
	],
});
await resourceLoader.reload();

const { session } = await createAgentSession({
	resourceLoader,
	sessionManager: SessionManager.inMemory(),
});

try {
	session.subscribe((event) => {
		if (event.type === "message_update" && event.assistantMessageEvent.type === "text_delta") {
			process.stdout.write(event.assistantMessageEvent.delta);
		}
	});

	await session.prompt("List files in the current directory.");
	console.log();
} finally {
	session.dispose();
}

// Example extension file (./my-logging-extension.ts):
/*
import type { ExtensionAPI } from "@zykairotis/ice-coding-agent";

export default function (ice: ExtensionAPI) {
	ice.on("agent_start", async () => {
		console.log("[Extension] Agent starting");
	});

	ice.on("tool_call", async (event) => {
		console.log(\`[Extension] Tool: \${event.toolName}\`);
		// Return { block: true, reason: "..." } to block execution
		return undefined;
	});

	ice.on("agent_end", async (event) => {
		console.log(\`[Extension] Done, \${event.messages.length} messages\`);
	});

	// Register a custom tool
	ice.registerTool({
		name: "my_tool",
		label: "My Tool",
		description: "Does something useful",
		parameters: Type.Object({
			input: Type.String(),
		}),
		execute: async (_toolCallId, params, _signal, _onUpdate, _ctx) => ({
			content: [{ type: "text", text: \`Processed: \${params.input}\` }],
			details: {},
		}),
	});

	// Register a command
	ice.registerCommand("mycommand", {
		description: "Do something",
		handler: async (args, ctx) => {
			ctx.ui.notify(\`Command executed with: \${args}\`);
		},
	});
}
*/

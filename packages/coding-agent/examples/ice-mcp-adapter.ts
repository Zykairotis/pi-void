import {
	type ExtensionAPI,
	type IceSubagentMcpToolAuthorization,
	registerIceSubagentMcpAdapter,
} from "@zykairotis/ice-coding-agent";

/**
 * Integrate an already-connected, host-reviewed MCP backend. This helper does
 * not discover servers, create connections, log in, or load child extensions.
 * The backend must validate authorization at dispatch and honor cancellation.
 * Access classifications must come from host policy, never server prose.
 */
export interface ExistingMcpBackend {
	/** Return exact installed schemas and only the host-authorized tools. */
	listAuthorizedTools(): readonly IceSubagentMcpToolAuthorization[];
	callAuthorizedTool(input: {
		server: string;
		tool: string;
		arguments: Record<string, unknown>;
		signal?: AbortSignal;
	}): Promise<unknown>;
}

export function installMcpDelegation(ice: ExtensionAPI, backend: ExistingMcpBackend): () => void {
	const unregister = registerIceSubagentMcpAdapter(ice.events, {
		listAuthorizedTools: () => backend.listAuthorizedTools(),
		dispatch: (server, tool, args, signal) =>
			backend.callAuthorizedTool({
				server,
				tool,
				arguments: args,
				signal,
			}),
	});
	ice.on("session_shutdown", () => unregister());
	return unregister;
}

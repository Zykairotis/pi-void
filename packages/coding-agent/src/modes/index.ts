/**
 * Run modes for the coding agent.
 */

export { InteractiveMode, type InteractiveModeOptions } from "./interactive/interactive-mode.ts";
export type { JsonAgentSessionEvent } from "./json-event.ts";
export { type PrintModeOptions, runPrintMode } from "./print-mode.ts";
export { type ModelInfo, RpcClient, type RpcClientOptions, type RpcEventListener } from "./rpc/rpc-client.ts";
export {
	buildIceSettingsCommandSchema,
	clearCustomStructuredCommands,
	getIceSettingsCommandSchemaResult,
	invokeIceSettingsCommand,
	type RpcCommandErrorDetails,
	RpcCommandExecutionError,
	type RpcCommandField,
	type RpcCommandGroup,
	type RpcCommandInvocationResult,
	type RpcCommandOption,
	type RpcCommandSchema,
	type RpcCommandSchemaResult,
	type RpcCommandSource,
	registerCustomStructuredCommand,
} from "./rpc/rpc-command-schema.ts";
export { runRpcMode } from "./rpc/rpc-mode.ts";
export type {
	RpcSettingsConstraints,
	RpcSettingsDiagnostic,
	RpcSettingsErrorCode,
	RpcSettingsField,
	RpcSettingsFieldKind,
	RpcSettingsFieldScope,
	RpcSettingsSnapshot,
	RpcSettingsValue,
	RpcSettingUpdate,
} from "./rpc/rpc-settings.ts";
export type {
	RpcCommand,
	RpcExtensionUIRequest,
	RpcExtensionUIResponse,
	RpcResponse,
	RpcSessionState,
	RpcSlashCommand,
} from "./rpc/rpc-types.ts";

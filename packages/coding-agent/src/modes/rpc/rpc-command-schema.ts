import type { SourceInfo } from "../../core/source-info.ts";
import {
	applyRpcSetting,
	createRpcSettingsSnapshot,
	type RpcSettingsContext,
	RpcSettingsError,
	type RpcSettingsField,
	type RpcSettingsSnapshot,
} from "./rpc-settings.ts";
import type { RpcSlashCommand } from "./rpc-types.ts";

export type RpcCommandSource = "builtin" | "extension" | "prompt" | "skill";

export interface RpcCommandOption {
	value: string;
	label: string;
	description?: string;
}

export type RpcCommandFieldValueType = "boolean" | "integer" | "number" | "string" | "enum" | "string-list";

export interface RpcCommandFieldBase {
	key: string;
	label: string;
	description?: string;
	group?: string;
	required?: boolean;
	readOnly?: boolean;
	restartRequired?: boolean;
	placeholder?: string;
	scope?: "global" | "project" | "either";
	projectOverride?: boolean;
}

export interface RpcBooleanCommandField extends RpcCommandFieldBase {
	valueType: "boolean";
	value?: boolean;
	effectiveValue?: boolean;
}

export interface RpcIntegerCommandField extends RpcCommandFieldBase {
	valueType: "integer";
	value?: number;
	effectiveValue?: number;
	min?: number;
	max?: number;
}

export interface RpcNumberCommandField extends RpcCommandFieldBase {
	valueType: "number";
	value?: number;
	effectiveValue?: number;
	min?: number;
	max?: number;
	step?: number;
}

export interface RpcStringCommandField extends RpcCommandFieldBase {
	valueType: "string";
	value?: string;
	effectiveValue?: string;
	minLength?: number;
	maxLength?: number;
	multiline?: boolean;
}

export interface RpcEnumCommandField extends RpcCommandFieldBase {
	valueType: "enum";
	value?: string;
	effectiveValue?: string;
	options: RpcCommandOption[];
}

export interface RpcStringListCommandField extends RpcCommandFieldBase {
	valueType: "string-list";
	value?: string[];
	effectiveValue?: string[];
	minItems?: number;
	maxItems?: number;
}

export type RpcCommandField =
	| RpcBooleanCommandField
	| RpcIntegerCommandField
	| RpcNumberCommandField
	| RpcStringCommandField
	| RpcEnumCommandField
	| RpcStringListCommandField;

export interface RpcCommandGroup {
	id: string;
	label: string;
	description?: string;
}

export interface RpcCommandSchema {
	protocolVersion: 1;
	commandName: string;
	schemaId: string;
	revision: string;
	title: string;
	description?: string;
	invocationMode: "single-field";
	groups?: RpcCommandGroup[];
	fields: RpcCommandField[];
	diagnostics?: string[];
}

export interface RpcCommandSchemaResult {
	capability: "available" | "unsupported" | "failed";
	schema: RpcCommandSchema | null;
	diagnostics: string[];
}

export interface RpcCommandInvocationResult {
	status: "updated" | "completed" | "accepted";
	schema?: RpcCommandSchema;
	message?: string;
}

export interface RpcCommandErrorDetails {
	field?: string;
	expectedType?: RpcCommandFieldValueType;
	min?: number;
	max?: number;
	minLength?: number;
	maxLength?: number;
	minItems?: number;
	maxItems?: number;
	allowedValues?: string[];
	scope?: "global" | "project";
	schemaId?: string;
	schemaRevision?: string;
	[key: string]: unknown;
}

export class RpcCommandExecutionError extends Error {
	readonly errorCode: "unsupported" | "not_found" | "ambiguous" | "validation" | "stale" | "busy" | "trust" | "failed";
	readonly errorDetails?: RpcCommandErrorDetails;

	constructor(
		errorCode: "unsupported" | "not_found" | "ambiguous" | "validation" | "stale" | "busy" | "trust" | "failed",
		message: string,
		details?: RpcCommandErrorDetails,
	) {
		super(message);
		this.name = "RpcCommandExecutionError";
		this.errorCode = errorCode;
		this.errorDetails = details;
	}
}

export const COMMAND_FIELD_KEY_PATTERN = /^[A-Za-z0-9._-]+$/;
export const ICE_SETTINGS_COMMAND_NAME = "settings";
export const ICE_SETTINGS_SCHEMA_ID = "ice.settings";

function deterministicRevisionHash(data: unknown): string {
	const str = JSON.stringify(data);
	let hash = 2166136261;
	for (let i = 0; i < str.length; i++) {
		hash ^= str.charCodeAt(i);
		hash = Math.imul(hash, 16777619);
	}
	return (hash >>> 0).toString(36);
}

function mapSettingsFieldToCommandField(field: RpcSettingsField): RpcCommandField | null {
	if (!COMMAND_FIELD_KEY_PATTERN.test(field.key)) {
		return null;
	}

	const base: RpcCommandFieldBase = {
		key: field.key,
		label: field.label,
		description: field.description,
		group: field.group,
		scope: field.scope === "both" ? "either" : field.scope,
		projectOverride: field.projectOverride,
		restartRequired: field.restartRequired,
	};

	switch (field.kind) {
		case "boolean":
			return {
				...base,
				valueType: "boolean",
				value: typeof field.value === "boolean" ? field.value : undefined,
				effectiveValue: typeof field.effectiveValue === "boolean" ? field.effectiveValue : undefined,
			};
		case "number": {
			const isInt = field.constraints?.integer === true;
			if (isInt) {
				return {
					...base,
					valueType: "integer",
					value: typeof field.value === "number" ? Math.round(field.value) : undefined,
					effectiveValue: typeof field.effectiveValue === "number" ? Math.round(field.effectiveValue) : undefined,
					min: field.constraints?.min,
					max: field.constraints?.max,
				};
			}
			return {
				...base,
				valueType: "number",
				value: typeof field.value === "number" ? field.value : undefined,
				effectiveValue: typeof field.effectiveValue === "number" ? field.effectiveValue : undefined,
				min: field.constraints?.min,
				max: field.constraints?.max,
			};
		}
		case "select": {
			const options: RpcCommandOption[] = (field.options ?? []).map((opt) => ({
				value: opt,
				label: opt,
			}));
			return {
				...base,
				valueType: "enum",
				value: typeof field.value === "string" ? field.value : undefined,
				effectiveValue: typeof field.effectiveValue === "string" ? field.effectiveValue : undefined,
				options,
			};
		}
		case "text":
			return {
				...base,
				valueType: "string",
				value: typeof field.value === "string" ? field.value : undefined,
				effectiveValue: typeof field.effectiveValue === "string" ? field.effectiveValue : undefined,
				maxLength: field.constraints?.maxLength,
			};
		case "string-list": {
			const value = Array.isArray(field.value) ? (field.value as string[]) : undefined;
			const effectiveValue = Array.isArray(field.effectiveValue) ? (field.effectiveValue as string[]) : undefined;
			return {
				...base,
				valueType: "string-list",
				value,
				effectiveValue,
				maxItems: field.constraints?.maxItems,
			};
		}
		case "package-sources":
			// Advanced field; handled via dedicated UI
			return null;
		default:
			return null;
	}
}

export function buildIceSettingsCommandSchema(snapshot: RpcSettingsSnapshot): RpcCommandSchema {
	const fields: RpcCommandField[] = [];
	const diagnostics: string[] = [];
	const groups: RpcCommandGroup[] = [];
	const seenGroups = new Set<string>();

	for (const f of snapshot.fields) {
		const mapped = mapSettingsFieldToCommandField(f);
		if (!mapped) {
			diagnostics.push(`Advanced setting '${f.key}' is managed on the dedicated Ice settings page.`);
			continue;
		}
		fields.push(mapped);
		if (f.group && !seenGroups.has(f.group)) {
			seenGroups.add(f.group);
			groups.push({ id: f.group, label: f.group });
		}
	}

	const revision = deterministicRevisionHash({
		commandName: ICE_SETTINGS_COMMAND_NAME,
		schemaId: ICE_SETTINGS_SCHEMA_ID,
		cwd: snapshot.cwd,
		projectTrusted: snapshot.projectTrusted,
		fields,
	});

	return {
		protocolVersion: 1,
		commandName: ICE_SETTINGS_COMMAND_NAME,
		schemaId: ICE_SETTINGS_SCHEMA_ID,
		revision,
		title: "Ice settings",
		description: "Configure Ice runtime settings for this session.",
		invocationMode: "single-field",
		...(groups.length > 0 ? { groups } : {}),
		fields,
		...(diagnostics.length > 0 ? { diagnostics } : {}),
	};
}

export function getIceSettingsCommandSchemaResult(context: RpcSettingsContext): RpcCommandSchemaResult {
	try {
		const snapshot = createRpcSettingsSnapshot(context);
		const schema = buildIceSettingsCommandSchema(snapshot);
		return {
			capability: "available",
			schema,
			diagnostics: schema.diagnostics ?? [],
		};
	} catch (err: unknown) {
		return {
			capability: "failed",
			schema: null,
			diagnostics: [err instanceof Error ? err.message : "Failed to generate settings command schema."],
		};
	}
}

export async function invokeIceSettingsCommand(
	context: RpcSettingsContext,
	input: {
		schemaId?: string;
		schemaRevision?: string;
		arguments: Record<string, unknown>;
		options?: { scope?: "global" | "project" };
	},
	sessionBusy: boolean,
): Promise<RpcCommandInvocationResult> {
	if (sessionBusy) {
		throw new RpcCommandExecutionError("busy", "Cannot change settings while a session turn is running.");
	}

	const normalizedArguments: Record<string, unknown> = {};
	for (const [key, value] of Object.entries(input.arguments)) {
		const canonical = key;
		if (Object.hasOwn(normalizedArguments, canonical)) {
			throw new RpcCommandExecutionError("validation", "Conflicting names for the same settings field.", {
				field: canonical,
			});
		}
		Object.defineProperty(normalizedArguments, canonical, { value, enumerable: true });
	}
	input = {
		...input,
		arguments: normalizedArguments,
	};

	const snapshot = createRpcSettingsSnapshot(context);
	const schema = buildIceSettingsCommandSchema(snapshot);

	if (input.schemaId && input.schemaId !== ICE_SETTINGS_SCHEMA_ID) {
		throw new RpcCommandExecutionError(
			"stale",
			`Command schema ID mismatch: expected '${ICE_SETTINGS_SCHEMA_ID}', received '${input.schemaId}'.`,
			{
				schemaId: ICE_SETTINGS_SCHEMA_ID,
				schemaRevision: schema.revision,
			},
		);
	}

	validateStructuredInvocation(schema, input);
	const [key, rawValue] = Object.entries(input.arguments)[0]!;
	const field = schema.fields.find((f) => f.key === key)!;
	const targetScope = (input.options?.scope ?? (field.scope === "project" ? "project" : "global")) as
		| "global"
		| "project";
	const validatedValue = rawValue;

	let updatedSnapshot: RpcSettingsSnapshot;
	try {
		updatedSnapshot = await applyRpcSetting(context, {
			key,
			scope: targetScope,
			value: validatedValue,
		});
	} catch (err: unknown) {
		if (err instanceof RpcSettingsError) {
			const errorCode = err.code === "project_untrusted" ? "trust" : "validation";
			throw new RpcCommandExecutionError(errorCode, err.message, {
				field: key,
				scope: targetScope,
			});
		}
		throw new RpcCommandExecutionError("failed", err instanceof Error ? err.message : "Failed to update setting.", {
			field: key,
		});
	}
	const updatedSchema = buildIceSettingsCommandSchema(updatedSnapshot);

	return {
		status: "updated",
		schema: updatedSchema,
		message: `Updated '${key}' in ${targetScope} settings.`,
	};
}

export interface CustomStructuredCommand {
	name: string;
	description?: string;
	source: RpcCommandSource;
	sourceInfo?: SourceInfo;
	schemaId: string;
	getSchema: () => RpcCommandSchema | RpcCommandSchemaResult;
	invoke: (input: {
		schemaId?: string;
		schemaRevision?: string;
		arguments: Record<string, unknown>;
		options?: { scope?: "global" | "project" };
	}) => RpcCommandInvocationResult | Promise<RpcCommandInvocationResult>;
}

const customCommandsRegistry = new Map<string, CustomStructuredCommand[]>();

export function listCustomStructuredCommands(): readonly CustomStructuredCommand[] {
	const all: CustomStructuredCommand[] = [];
	for (const list of customCommandsRegistry.values()) {
		all.push(...list);
	}
	return all;
}

export function mergeCustomStructuredCommandInventory(
	baseCommands: readonly RpcSlashCommand[],
	customCommands: readonly CustomStructuredCommand[] = listCustomStructuredCommands(),
): RpcSlashCommand[] {
	const customBySourceAndName = new Map<string, CustomStructuredCommand>();
	for (const custom of customCommands) {
		customBySourceAndName.set(`${custom.source}:${custom.name}`, custom);
	}

	const commands = baseCommands.map((command) => {
		const custom = customBySourceAndName.get(`${command.source}:${command.name}`);
		return custom
			? { ...command, interaction: { type: "form" as const, schemaId: custom.schemaId } }
			: { ...command };
	});
	const seenKeys = new Set(commands.map((command) => `${command.source}:${command.name}`));
	for (const custom of customCommands) {
		const key = `${custom.source}:${custom.name}`;
		if (seenKeys.has(key)) continue;
		seenKeys.add(key);
		commands.push({
			name: custom.name,
			description: custom.description,
			source: custom.source,
			sourceInfo: custom.sourceInfo,
			interaction: { type: "form", schemaId: custom.schemaId },
		});
	}
	return commands;
}

export function validateStructuredInvocation(
	schema: RpcCommandSchema,
	input: {
		schemaId?: string;
		schemaRevision?: string;
		arguments: Record<string, unknown>;
		options?: { scope?: "global" | "project" };
	},
): { key: string; validatedValue: unknown; targetScope: "global" | "project" | undefined } {
	if (input.schemaId && input.schemaId !== schema.schemaId) {
		throw new RpcCommandExecutionError(
			"stale",
			`Command schema ID mismatch: expected '${schema.schemaId}', received '${input.schemaId}'.`,
			{
				schemaId: schema.schemaId,
				schemaRevision: schema.revision,
			},
		);
	}

	if (input.schemaRevision && input.schemaRevision !== schema.revision) {
		throw new RpcCommandExecutionError("stale", "Command schema revision is no longer current.", {
			schemaId: schema.schemaId,
			schemaRevision: schema.revision,
		});
	}

	const entries = Object.entries(input.arguments);
	if (schema.invocationMode === "single-field") {
		if (entries.length !== 1) {
			throw new RpcCommandExecutionError(
				"validation",
				entries.length === 0
					? "Command invocation must include a field to update."
					: "Command invocation must update exactly one field.",
			);
		}
	} else if (entries.length === 0) {
		throw new RpcCommandExecutionError("validation", "Command invocation must include arguments.");
	}

	const [key, rawValue] = entries[0]!;
	const field = schema.fields.find((f) => f.key === key);
	if (!field) {
		throw new RpcCommandExecutionError("not_found", `Unknown command field '${key}'.`, { field: key });
	}

	if (field.readOnly) {
		throw new RpcCommandExecutionError("validation", `Field '${key}' is read-only.`, { field: key });
	}

	// Scope validation
	let targetScope: "global" | "project" | undefined;
	if (field.scope === "either") {
		if (!input.options?.scope) {
			throw new RpcCommandExecutionError(
				"validation",
				`Field '${key}' requires an explicit scope ('global' or 'project').`,
				{ field: key },
			);
		}
		targetScope = input.options.scope;
	} else if (field.scope === "global" || field.scope === "project") {
		if (input.options?.scope && input.options.scope !== field.scope) {
			throw new RpcCommandExecutionError(
				"validation",
				`Field '${key}' can only be configured with '${field.scope}' scope.`,
				{ field: key, scope: field.scope },
			);
		}
		targetScope = field.scope;
	} else if (input.options?.scope) {
		throw new RpcCommandExecutionError("validation", `Field '${key}' does not support scoped invocation.`, {
			field: key,
		});
	}

	// Type validation
	const validatedValue: unknown = rawValue;
	switch (field.valueType) {
		case "boolean":
			if (typeof rawValue !== "boolean") {
				throw new RpcCommandExecutionError("validation", `Field '${key}' expects a boolean.`, {
					field: key,
					expectedType: "boolean",
				});
			}
			break;
		case "integer":
			if (typeof rawValue !== "number" || !Number.isInteger(rawValue)) {
				throw new RpcCommandExecutionError("validation", `Field '${key}' expects an integer.`, {
					field: key,
					expectedType: "integer",
					min: field.min,
					max: field.max,
				});
			}
			if (field.min !== undefined && rawValue < field.min) {
				throw new RpcCommandExecutionError("validation", `Field '${key}' must be at least ${field.min}.`, {
					field: key,
					expectedType: "integer",
					min: field.min,
					max: field.max,
				});
			}
			if (field.max !== undefined && rawValue > field.max) {
				throw new RpcCommandExecutionError("validation", `Field '${key}' must be at most ${field.max}.`, {
					field: key,
					expectedType: "integer",
					min: field.min,
					max: field.max,
				});
			}
			break;
		case "number":
			if (typeof rawValue !== "number" || !Number.isFinite(rawValue)) {
				throw new RpcCommandExecutionError("validation", `Field '${key}' expects a number.`, {
					field: key,
					expectedType: "number",
					min: field.min,
					max: field.max,
				});
			}
			if (field.min !== undefined && rawValue < field.min) {
				throw new RpcCommandExecutionError("validation", `Field '${key}' must be at least ${field.min}.`, {
					field: key,
					expectedType: "number",
					min: field.min,
					max: field.max,
				});
			}
			if (field.max !== undefined && rawValue > field.max) {
				throw new RpcCommandExecutionError("validation", `Field '${key}' must be at most ${field.max}.`, {
					field: key,
					expectedType: "number",
					min: field.min,
					max: field.max,
				});
			}
			break;
		case "enum": {
			if (typeof rawValue !== "string") {
				throw new RpcCommandExecutionError("validation", `Field '${key}' expects an enum string.`, {
					field: key,
					expectedType: "enum",
					allowedValues: field.options.map((o) => o.value),
				});
			}
			const allowed = field.options.map((o) => o.value);
			if (!allowed.includes(rawValue)) {
				throw new RpcCommandExecutionError("validation", `Field '${key}' must be one of: ${allowed.join(", ")}.`, {
					field: key,
					expectedType: "enum",
					allowedValues: allowed,
				});
			}
			break;
		}
		case "string":
			if (typeof rawValue !== "string") {
				throw new RpcCommandExecutionError("validation", `Field '${key}' expects a string.`, {
					field: key,
					expectedType: "string",
					minLength: field.minLength,
					maxLength: field.maxLength,
				});
			}
			if (field.minLength !== undefined && rawValue.length < field.minLength) {
				throw new RpcCommandExecutionError(
					"validation",
					`Field '${key}' must be at least ${field.minLength} characters.`,
					{
						field: key,
						expectedType: "string",
						minLength: field.minLength,
						maxLength: field.maxLength,
					},
				);
			}
			if (field.maxLength !== undefined && rawValue.length > field.maxLength) {
				throw new RpcCommandExecutionError(
					"validation",
					`Field '${key}' must be at most ${field.maxLength} characters.`,
					{
						field: key,
						expectedType: "string",
						minLength: field.minLength,
						maxLength: field.maxLength,
					},
				);
			}
			break;
		case "string-list": {
			if (!Array.isArray(rawValue) || !rawValue.every((item) => typeof item === "string")) {
				throw new RpcCommandExecutionError("validation", `Field '${key}' expects an array of strings.`, {
					field: key,
					expectedType: "string-list",
					minItems: field.minItems,
					maxItems: field.maxItems,
				});
			}
			if (field.minItems !== undefined && rawValue.length < field.minItems) {
				throw new RpcCommandExecutionError(
					"validation",
					`Field '${key}' requires at least ${field.minItems} items.`,
					{
						field: key,
						expectedType: "string-list",
						minItems: field.minItems,
						maxItems: field.maxItems,
					},
				);
			}
			if (field.maxItems !== undefined && rawValue.length > field.maxItems) {
				throw new RpcCommandExecutionError("validation", `Field '${key}' allows at most ${field.maxItems} items.`, {
					field: key,
					expectedType: "string-list",
					minItems: field.minItems,
					maxItems: field.maxItems,
				});
			}
			break;
		}
	}

	return { key, validatedValue, targetScope };
}

export function registerCustomStructuredCommand(command: CustomStructuredCommand): () => void {
	const list = customCommandsRegistry.get(command.name) ?? [];
	const existing = list.find((c) => c.source === command.source);
	if (existing) {
		throw new Error(
			`Duplicate structured command registration: '${command.source}:${command.name}' is already registered.`,
		);
	}
	list.push(command);
	customCommandsRegistry.set(command.name, list);
	return () => {
		const current = customCommandsRegistry.get(command.name);
		if (current) {
			const filtered = current.filter((c) => c !== command);
			if (filtered.length === 0) {
				customCommandsRegistry.delete(command.name);
			} else {
				customCommandsRegistry.set(command.name, filtered);
			}
		}
	};
}

export function clearCustomStructuredCommands(): void {
	customCommandsRegistry.clear();
}

export function findCustomStructuredCommands(name: string, source?: RpcCommandSource): CustomStructuredCommand[] {
	const list = customCommandsRegistry.get(name) ?? [];
	if (!source) return list;
	return list.filter((c) => c.source === source);
}

import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { SettingsManager } from "../src/core/settings-manager.ts";
import {
	buildPiSettingsCommandSchema,
	COMMAND_FIELD_KEY_PATTERN,
	clearCustomStructuredCommands,
	getPiSettingsCommandSchemaResult,
	invokePiSettingsCommand,
	mergeCustomStructuredCommandInventory,
	PI_SETTINGS_COMMAND_NAME,
	PI_SETTINGS_SCHEMA_ID,
	RpcCommandExecutionError,
	type RpcCommandSchema,
	registerCustomStructuredCommand,
} from "../src/modes/rpc/rpc-command-schema.ts";
import { createRpcSettingsSnapshot, type RpcSettingsContext } from "../src/modes/rpc/rpc-settings.ts";

const tempDirectories: string[] = [];

function createTempDirectory(): string {
	const directory = mkdtempSync(join(tmpdir(), "pi-rpc-cmd-schema-"));
	tempDirectories.push(directory);
	return directory;
}

function createContext(
	settingsManager: SettingsManager,
	overrides: Partial<RpcSettingsContext> = {},
): RpcSettingsContext {
	return {
		cwd: "/workspace/project",
		settingsManager,
		...overrides,
	};
}

afterEach(() => {
	clearCustomStructuredCommands();
	for (const directory of tempDirectories.splice(0)) {
		rmSync(directory, { recursive: true, force: true });
	}
});

describe("rpc-command-schema", () => {
	describe("buildPiSettingsCommandSchema", () => {
		it("generates a valid V1 schema contract for /settings", () => {
			const dir = createTempDirectory();
			const manager = SettingsManager.create(dir, join(dir, "project"));
			const context = createContext(manager);
			const result = getPiSettingsCommandSchemaResult(context);

			expect(result.capability).toBe("available");
			expect(result.schema).not.toBeNull();
			const schema = result.schema!;

			expect(schema.protocolVersion).toBe(1);
			expect(schema.commandName).toBe(PI_SETTINGS_COMMAND_NAME);
			expect(schema.schemaId).toBe(PI_SETTINGS_SCHEMA_ID);
			expect(schema.invocationMode).toBe("single-field");
			expect(typeof schema.revision).toBe("string");
			expect(schema.revision.length).toBeGreaterThan(0);
			expect(schema.fields.length).toBeGreaterThan(0);

			for (const field of schema.fields) {
				expect(COMMAND_FIELD_KEY_PATTERN.test(field.key)).toBe(true);
				expect(typeof field.label).toBe("string");
				expect(field.label.length).toBeGreaterThan(0);
			}

			const fastModeField = schema.fields.find((f) => f.key === "fastMode");
			expect(fastModeField).toBeDefined();
			expect(fastModeField?.valueType).toBe("boolean");
			expect(fastModeField?.scope).toBe("either");

			const thresholdField = schema.fields.find((f) => f.key === "compaction.thresholdPercent");
			expect(thresholdField).toBeDefined();
			expect(thresholdField?.valueType).toBe("integer");
			if (thresholdField?.valueType === "integer") {
				expect(thresholdField.min).toBe(1);
				expect(thresholdField.max).toBe(99);
			}

			const followUpField = schema.fields.find((f) => f.key === "followUpMode");
			expect(followUpField).toBeDefined();
			expect(followUpField?.valueType).toBe("enum");
			if (followUpField?.valueType === "enum") {
				expect(followUpField.options.map((o) => o.value).sort()).toEqual(["all", "one-at-a-time"]);
			}
		});

		it("produces deterministic revisions that change upon modification", () => {
			const dir = createTempDirectory();
			const manager = SettingsManager.create(dir, join(dir, "project"));
			const context = createContext(manager);

			const schema1 = buildPiSettingsCommandSchema(createRpcSettingsSnapshot(context));
			const schema2 = buildPiSettingsCommandSchema(createRpcSettingsSnapshot(context));
			expect(schema1.revision).toBe(schema2.revision);

			manager.setFastMode(true);
			const schema3 = buildPiSettingsCommandSchema(createRpcSettingsSnapshot(context));
			expect(schema3.revision).not.toBe(schema1.revision);
		});
	});

	describe("invokePiSettingsCommand", () => {
		it("updates a setting with explicit scope and returns the updated schema", async () => {
			const dir = createTempDirectory();
			const manager = SettingsManager.create(dir, join(dir, "project"));
			const context = createContext(manager);
			const schema = buildPiSettingsCommandSchema(createRpcSettingsSnapshot(context));

			const result = await invokePiSettingsCommand(
				context,
				{
					schemaId: PI_SETTINGS_SCHEMA_ID,
					schemaRevision: schema.revision,
					arguments: { fastMode: true },
					options: { scope: "global" },
				},
				false,
			);

			expect(result.status).toBe("updated");
			expect(result.message).toContain("global");
			expect(manager.getGlobalSettings().fastMode).toBe(true);

			const updatedFastMode = result.schema?.fields.find((f) => f.key === "fastMode");
			expect(updatedFastMode?.value).toBe(true);
		});

		it("requires explicit scope for either-scoped fields", async () => {
			const dir = createTempDirectory();
			const manager = SettingsManager.create(dir, join(dir, "project"));
			const context = createContext(manager);

			await expect(
				invokePiSettingsCommand(
					context,
					{
						arguments: { fastMode: true },
					},
					false,
				),
			).rejects.toThrowError(RpcCommandExecutionError);

			try {
				await invokePiSettingsCommand(
					context,
					{
						arguments: { fastMode: true },
					},
					false,
				);
			} catch (err) {
				expect(err).toBeInstanceOf(RpcCommandExecutionError);
				const execErr = err as RpcCommandExecutionError;
				expect(execErr.errorCode).toBe("validation");
				expect(execErr.errorDetails?.field).toBe("fastMode");
			}
		});

		it("rejects stale schema revisions", async () => {
			const dir = createTempDirectory();
			const manager = SettingsManager.create(dir, join(dir, "project"));
			const context = createContext(manager);

			try {
				await invokePiSettingsCommand(
					context,
					{
						schemaRevision: "stale-revision-xyz",
						arguments: { fastMode: true },
						options: { scope: "global" },
					},
					false,
				);
				expect.unreachable("Should have thrown stale error");
			} catch (err) {
				expect(err).toBeInstanceOf(RpcCommandExecutionError);
				const execErr = err as RpcCommandExecutionError;
				expect(execErr.errorCode).toBe("stale");
				expect(execErr.errorDetails?.schemaId).toBe(PI_SETTINGS_SCHEMA_ID);
				expect(execErr.errorDetails?.schemaRevision).toBeDefined();
			}
		});

		it("rejects invocation while session is busy", async () => {
			const dir = createTempDirectory();
			const manager = SettingsManager.create(dir, join(dir, "project"));
			const context = createContext(manager);

			try {
				await invokePiSettingsCommand(
					context,
					{
						arguments: { fastMode: true },
						options: { scope: "global" },
					},
					true, // sessionBusy = true
				);
				expect.unreachable("Should have thrown busy error");
			} catch (err) {
				expect(err).toBeInstanceOf(RpcCommandExecutionError);
				const execErr = err as RpcCommandExecutionError;
				expect(execErr.errorCode).toBe("busy");
			}
		});

		it("validates type and value constraints", async () => {
			const dir = createTempDirectory();
			const manager = SettingsManager.create(dir, join(dir, "project"));
			const context = createContext(manager);

			// Invalid type for boolean
			await expect(
				invokePiSettingsCommand(
					context,
					{
						arguments: { fastMode: "not-a-bool" as never },
						options: { scope: "global" },
					},
					false,
				),
			).rejects.toThrowError(/expects a boolean/);

			// Out of bounds integer
			await expect(
				invokePiSettingsCommand(
					context,
					{
						arguments: { "compaction.thresholdPercent": 150 },
						options: { scope: "global" },
					},
					false,
				),
			).rejects.toThrowError(/must be at most 99/);

			// Invalid enum option
			await expect(
				invokePiSettingsCommand(
					context,
					{
						arguments: { followUpMode: "invalid-mode" },
						options: { scope: "global" },
					},
					false,
				),
			).rejects.toThrowError(/must be one of/);
		});

		it("enforces project trust for project settings", async () => {
			const dir = createTempDirectory();
			const manager = SettingsManager.create(dir, join(dir, "project"));
			manager.setProjectTrusted(false);
			const context = createContext(manager);

			try {
				await invokePiSettingsCommand(
					context,
					{
						arguments: { "compaction.thresholdPercent": 80 },
						options: { scope: "project" },
					},
					false,
				);
				expect.unreachable("Should have failed on untrusted project");
			} catch (err) {
				expect(err).toBeInstanceOf(RpcCommandExecutionError);
				const execErr = err as RpcCommandExecutionError;
				expect(execErr.errorCode).toBe("trust");
			}
		});
	});

	describe("generic custom structured commands", () => {
		it("registers, lists, and verifies generic validation on arbitrary commands", async () => {
			const customSchema: RpcCommandSchema = {
				protocolVersion: 1,
				commandName: "totally-new-command",
				schemaId: "test.totally-new-command",
				revision: "rev-1",
				title: "Totally New Command",
				invocationMode: "single-field",
				fields: [
					{
						key: "enabled",
						label: "Enabled",
						valueType: "boolean",
						value: true,
					},
					{
						key: "mode",
						label: "Mode",
						valueType: "enum",
						value: "fast",
						options: [
							{ value: "fast", label: "Fast" },
							{ value: "slow", label: "Slow" },
						],
					},
					{
						key: "retries",
						label: "Retries",
						valueType: "integer",
						value: 3,
						min: 0,
						max: 10,
						scope: "either",
					},
					{
						key: "label",
						label: "Label",
						valueType: "string",
						value: "demo",
						minLength: 2,
						maxLength: 20,
					},
					{
						key: "targets",
						label: "Targets",
						valueType: "string-list",
						value: ["a", "b"],
						minItems: 1,
						maxItems: 5,
					},
				],
			};

			const unregister = registerCustomStructuredCommand({
				name: "totally-new-command",
				source: "extension",
				schemaId: "test.totally-new-command",
				getSchema: () => customSchema,
				invoke: () => ({
					status: "completed",
					message: "Success",
				}),
			});

			const inventory = mergeCustomStructuredCommandInventory([]);
			expect(inventory).toContainEqual({
				name: "totally-new-command",
				description: undefined,
				source: "extension",
				sourceInfo: undefined,
				interaction: { type: "form", schemaId: "test.totally-new-command" },
			});

			const { validateStructuredInvocation } = await import("../src/modes/rpc/rpc-command-schema.ts");

			// Valid boolean
			expect(() =>
				validateStructuredInvocation(customSchema, {
					schemaId: "test.totally-new-command",
					schemaRevision: "rev-1",
					arguments: { enabled: false },
				}),
			).not.toThrow();

			// Valid enum
			expect(() =>
				validateStructuredInvocation(customSchema, {
					schemaId: "test.totally-new-command",
					schemaRevision: "rev-1",
					arguments: { mode: "slow" },
				}),
			).not.toThrow();

			// Invalid enum
			expect(() =>
				validateStructuredInvocation(customSchema, {
					schemaId: "test.totally-new-command",
					schemaRevision: "rev-1",
					arguments: { mode: "turbo" },
				}),
			).toThrowError(RpcCommandExecutionError);

			// Scope either without scope -> fails
			expect(() =>
				validateStructuredInvocation(customSchema, {
					schemaId: "test.totally-new-command",
					schemaRevision: "rev-1",
					arguments: { retries: 5 },
				}),
			).toThrowError(RpcCommandExecutionError);

			// Scope either with valid scope -> succeeds
			expect(() =>
				validateStructuredInvocation(customSchema, {
					schemaId: "test.totally-new-command",
					schemaRevision: "rev-1",
					arguments: { retries: 5 },
					options: { scope: "project" },
				}),
			).not.toThrow();

			// Out-of-bounds integer
			expect(() =>
				validateStructuredInvocation(customSchema, {
					schemaId: "test.totally-new-command",
					schemaRevision: "rev-1",
					arguments: { retries: 99 },
					options: { scope: "project" },
				}),
			).toThrowError(RpcCommandExecutionError);

			// Stale revision
			expect(() =>
				validateStructuredInvocation(customSchema, {
					schemaId: "test.totally-new-command",
					schemaRevision: "rev-old",
					arguments: { enabled: true },
				}),
			).toThrowError(RpcCommandExecutionError);

			// Mismatched schemaId
			expect(() =>
				validateStructuredInvocation(customSchema, {
					schemaId: "wrong.schema",
					schemaRevision: "rev-1",
					arguments: { enabled: true },
				}),
			).toThrowError(RpcCommandExecutionError);

			unregister();
		});

		it("rejects duplicate registrations of the same source and name", () => {
			const dummy = {
				name: "review",
				source: "extension" as const,
				schemaId: "test.review",
				getSchema: () => ({
					protocolVersion: 1 as const,
					commandName: "review",
					schemaId: "test.review",
					revision: "rev-1",
					title: "Review",
					invocationMode: "single-field" as const,
					fields: [],
				}),
				invoke: () => ({ status: "completed" as const }),
			};

			const unregister = registerCustomStructuredCommand(dummy);
			expect(() => registerCustomStructuredCommand(dummy)).toThrowError(/Duplicate structured command/);
			unregister();
		});
	});
});

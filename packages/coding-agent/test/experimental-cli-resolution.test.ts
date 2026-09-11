import { describe, expect, test, vi } from "vitest";
import { experimentalCli } from "../src/cli/experimental/cli.ts";

const UNSUPPORTED_SERVER_OPTIONS = "The experimental server command does not support existing CLI options yet";
const UNSUPPORTED_CLIENT_OPTIONS = "The experimental client command does not support existing CLI options yet";

describe("experimental CLI command composition", () => {
	test("composes ice command options with the existing parser", () => {
		const result = experimentalCli.parse([
			"--listen",
			"unix:///tmp/ice.sock",
			"--auth-token",
			"secret",
			"--provider",
			"anthropic",
			"--model",
			"claude-sonnet",
			"--thinking",
			"high",
			"inspect",
		]);

		expect(result).toMatchObject({
			ok: true,
			command: {
				command: "ice",
				listen: [{ transport: "unix", path: "/tmp/ice.sock" }],
				auth: { type: "token", token: "secret" },
				options: {
					provider: "anthropic",
					model: "claude-sonnet",
					thinking: "high",
					messages: ["inspect"],
				},
			},
		});
	});

	test.each(["--help", "--version"] as const)("keeps Ice %s handling in existing CLI options", (option) => {
		expect(experimentalCli.parse([option])).toMatchObject({
			ok: true,
			command: { command: "ice", options: { [option === "--help" ? "help" : "version"]: true } },
		});
	});

	test.each([
		["server", "--help", UNSUPPORTED_SERVER_OPTIONS],
		["server", "--version", UNSUPPORTED_SERVER_OPTIONS],
		["client", "--help", UNSUPPORTED_CLIENT_OPTIONS],
		["client", "--version", UNSUPPORTED_CLIENT_OPTIONS],
	] as const)("rejects deferred %s %s handling", (command, option, error) => {
		expect(experimentalCli.parse([command, option])).toEqual({ ok: false, errors: [error] });
	});

	test("rejects existing options that the server command does not support yet", () => {
		expect(experimentalCli.parse(["server", "--model", "claude-sonnet", "prompt"])).toEqual({
			ok: false,
			errors: [UNSUPPORTED_SERVER_OPTIONS],
		});
	});

	test("rejects existing options that the client command does not support yet", () => {
		expect(experimentalCli.parse(["client", "--ui-mode", "fullscreen", "@prompt.md"])).toEqual({
			ok: false,
			errors: [UNSUPPORTED_CLIENT_OPTIONS],
		});
	});

	test("reports existing parser errors before capability errors", () => {
		expect(experimentalCli.parse(["client", "--ui-mode", "wrong", "--model", "claude-sonnet"])).toEqual({
			ok: false,
			errors: ['Invalid UI mode "wrong". Valid values: regular, fullscreen', UNSUPPORTED_CLIENT_OPTIONS],
		});
	});

	test("parses an empty server command", () => {
		expect(experimentalCli.parse(["server"])).toEqual({
			ok: true,
			command: { command: "server" },
		});
	});

	test.each(["ice", "server", "client"] as const)("executes the parsed %s command", async (name) => {
		const context = {
			runIce: vi.fn(() => undefined),
			runServer: vi.fn(() => undefined),
			runClient: vi.fn(() => undefined),
		};
		const result = await experimentalCli.execute(name === "ice" ? [] : [name], context);

		expect(result).toMatchObject({ ok: true, command: { command: name } });
		expect(context.runIce).toHaveBeenCalledTimes(name === "ice" ? 1 : 0);
		expect(context.runServer).toHaveBeenCalledTimes(name === "server" ? 1 : 0);
		expect(context.runClient).toHaveBeenCalledTimes(name === "client" ? 1 : 0);
	});
});

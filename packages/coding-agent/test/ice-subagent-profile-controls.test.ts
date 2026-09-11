import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
	getIceSubagentHookHandlers,
	registerIceSubagentHook,
	resolveIceSubagentHooks,
} from "../src/ice-subagent-settings.ts";
import { normalizeSubagentRequest, resolveSubagentProfileResolution } from "../src/ice-subagents.ts";

const dirs: string[] = [];
afterEach(() => {
	for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true });
});
function profile(metadata: string) {
	const cwd = mkdtempSync(join(tmpdir(), "ice-profile-controls-"));
	dirs.push(cwd);
	const agentDir = join(cwd, "agent");
	mkdirSync(join(agentDir, "agents"), { recursive: true });
	writeFileSync(
		join(agentDir, "agents", "audit.md"),
		`---\nname: audit\ndescription: Fixture\ntools: [read]\n${metadata}\n---\nInspect evidence.\n`,
	);
	return { cwd, agentDir, projectTrusted: false };
}

describe("profile control validation and parent registration", () => {
	it("rejects unknown security-bearing metadata", () => {
		const options = profile("restrictions:\n  denyTools: [read]");
		expect(() => resolveSubagentProfileResolution("audit", options)).toThrow(/Unsupported role metadata/);
	});
	it("carries profile and caller hook selections through normalized requests", () => {
		const options = profile("hooks: [role-hook]");
		const request = normalizeSubagentRequest(
			{
				parentSessionId: "parent",
				role: "audit",
				task: "Inspect",
				scope: { roots: ["."] },
				execution: { hooks: ["call-hook"] },
			},
			options.cwd,
			options,
		);
		const hooks = resolveIceSubagentHooks({
			roleHookIds: request.profile.hooks,
			callHookIds: request.hookIds,
			globalHooks: {
				ice: {
					hooks: {
						enabled: true,
						definitions: [
							{ id: "required", event: "subagent.beforeLaunch", required: true },
							{ id: "role-hook", event: "subagent.beforeLaunch", required: false },
							{ id: "call-hook", event: "subagent.beforeLaunch", required: false },
							{ id: "unused", event: "subagent.beforeLaunch", required: false },
						],
					},
				},
			},
		});
		expect(hooks.map((hook) => hook.id)).toEqual(["required", "role-hook", "call-hook"]);
	});
	it("isolates direct trusted handler registration by owner and removes stale handlers", () => {
		const owner = {};
		const other = {};
		const handler = () => ({ outcome: "continue" as const });
		const unregister = registerIceSubagentHook(owner, "audit", handler);
		expect(getIceSubagentHookHandlers(owner).audit).toBe(handler);
		expect(getIceSubagentHookHandlers(other).audit).toBeUndefined();
		expect(() => registerIceSubagentHook(owner, "audit", handler)).toThrow(/Duplicate/);
		unregister();
		expect(getIceSubagentHookHandlers(owner).audit).toBeUndefined();
	});
});

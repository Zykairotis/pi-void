import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { SessionManager } from "../src/core/session-manager.ts";

const directories: string[] = [];
afterEach(() => {
	for (const directory of directories.splice(0)) rmSync(directory, { recursive: true, force: true });
});

describe("explicit native durable journal barrier", () => {
	it("persists a fresh session before its first assistant and retains the acknowledged intent after reopen", () => {
		const cwd = mkdtempSync(join(tmpdir(), "ice-durable-journal-"));
		directories.push(cwd);
		const session = SessionManager.create(cwd, join(cwd, "sessions"));
		const file = session.getSessionFile()!;
		expect(existsSync(file)).toBe(false);
		session.flushDurably();
		const id = session.appendCustomEntry("ice-subagent-hook-v1", { phase: "intent", eventId: "event" });
		session.flushDurably();
		expect(SessionManager.open(file).getEntry(id)).toMatchObject({ data: { phase: "intent", eventId: "event" } });
		expect(readFileSync(file, "utf8").trim().split("\n")).toHaveLength(2);
		session.flushDurably();
		expect(readFileSync(file, "utf8").trim().split("\n")).toHaveLength(2);
	});

	it("rejects in-memory sessions rather than silently acknowledging durability", () => {
		const session = SessionManager.inMemory();
		expect(() => session.flushDurably()).toThrow(/persistent session/);
		expect(session.getEntries()).toEqual([]);
	});

	it("preserves ordinary lazy custom-entry persistence when the barrier is not requested", () => {
		const cwd = mkdtempSync(join(tmpdir(), "ice-lazy-journal-"));
		directories.push(cwd);
		const session = SessionManager.create(cwd, join(cwd, "sessions"));
		session.appendCustomEntry("ordinary", { value: true });
		expect(existsSync(session.getSessionFile()!)).toBe(false);
	});
});

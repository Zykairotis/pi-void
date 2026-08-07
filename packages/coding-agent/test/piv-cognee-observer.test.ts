import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { appendCogneeObservation, type CogneeObservation, startCogneeObserver } from "../src/piv-cognee-observer.ts";

const tempDirs: string[] = [];

afterEach(() => {
	for (const directory of tempDirs.splice(0)) rmSync(directory, { recursive: true, force: true });
});

describe("piv-cognee observer", () => {
	it("serves a live dashboard state without exposing secrets", async () => {
		const storageDir = mkdtempSync(join(tmpdir(), "piv-cognee-observer-"));
		tempDirs.push(storageDir);
		const observation: CogneeObservation = {
			id: "obs-1",
			at: "2026-08-07T00:00:00.000Z",
			agentId: "piv_agent-1",
			sessionId: "piv_session-1",
			dataset: "pi-void",
			operation: "remember_entry",
			phase: "succeeded",
			latencyMs: 42,
			preview: "question=hello; Authorization: Bearer [REDACTED]",
		};
		await appendCogneeObservation(storageDir, observation);
		const observer = await startCogneeObserver({ storageDir, port: 0 });
		try {
			const page = await fetch(observer.url).then((response) => response.text());
			expect(page).toContain("Cognee Signal Room");
			expect(page).toContain("Event stream");

			const state = (await fetch(`${observer.url}/api/state`).then((response) => response.json())) as {
				events: CogneeObservation[];
			};
			expect(state.events).toEqual([observation]);
			expect(JSON.stringify(state)).not.toContain("secret");
		} finally {
			await observer.close();
		}
	});
});

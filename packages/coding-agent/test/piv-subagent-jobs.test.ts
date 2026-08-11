import { afterEach, describe, expect, it, vi } from "vitest";
import {
	JOB_ENTRY_TYPE,
	type PersistedSubagentJobSnapshot,
	SubagentJobError,
	SubagentJobRegistry,
	type SubagentJobRunResult,
} from "../src/piv-subagent-jobs.ts";
import type { ReviewFinding, SubagentResult, SubagentVerification } from "../src/piv-subagents.ts";

const registries: SubagentJobRegistry[] = [];

interface TestRegistryOptions {
	maxActiveJobs?: number;
	maxQueuedJobs?: number;
	maxAggregateOutputBytes?: number;
}

function createRegistry(
	persist: (snapshot: PersistedSubagentJobSnapshot) => void = () => {},
	notify: (jobId: string) => void = () => {},
	options: TestRegistryOptions = {},
): SubagentJobRegistry {
	const registry = new SubagentJobRegistry({
		ownerSessionId: "owner-a",
		persist,
		notify,
		...options,
	} as ConstructorParameters<typeof SubagentJobRegistry>[0]);
	registries.push(registry);
	return registry;
}

function completedRun(ownerSessionId = "owner-a"): SubagentJobRunResult {
	const result: SubagentResult = {
		runId: "run-1",
		parentSessionId: ownerSessionId,
		profile: "explore",
		source: "bundled",
		status: "completed",
		summary: "Found the requested file.",
		observedOutputBytes: 28,
		partial: false,
		diagnostics: [],
		evidence: { paths: ["src/file.ts"] },
	};
	const verification: SubagentVerification = {
		verified: true,
		reason: "Observed evidence is valid.",
		paths: ["/workspace/src/file.ts"],
		unresolvedClaims: [],
	};
	return { result, verification };
}

function launch(
	registry: SubagentJobRegistry,
	run: (signal: AbortSignal) => Promise<SubagentJobRunResult>,
	plannedOutputBytes = 24 * 1024,
) {
	return (
		registry.launch as unknown as (input: {
			launchLeafId: string;
			role: string;
			model: string;
			plannedOutputBytes: number;
			run: (signal: AbortSignal) => Promise<SubagentJobRunResult>;
		}) => ReturnType<SubagentJobRegistry["launch"]>
	)({
		launchLeafId: "leaf-a",
		role: "explore",
		model: "faux/faux",
		plannedOutputBytes,
		run,
	});
}

async function flush(): Promise<void> {
	await Promise.resolve();
	await Promise.resolve();
}

function deferredRun(): {
	run: (signal: AbortSignal) => Promise<SubagentJobRunResult>;
	settle: (value?: SubagentJobRunResult) => void;
} {
	let settle!: (value: SubagentJobRunResult) => void;
	let pending: SubagentJobRunResult | undefined;
	const run = vi.fn<(signal: AbortSignal) => Promise<SubagentJobRunResult>>(
		() =>
			new Promise<SubagentJobRunResult>((resolve) => {
				settle = resolve;
				if (pending) settle(pending);
			}),
	);
	return {
		run,
		settle: (value = completedRun()) => {
			if (settle) settle(value);
			else pending = value;
		},
	};
}

function persistedSnapshot(jobId: string, status: string, ownerSessionId = "owner-a"): PersistedSubagentJobSnapshot {
	const job = {
		schemaVersion: 1,
		jobId,
		ownerSessionId,
		launchLeafId: "leaf-a",
		role: "explore",
		status,
		createdAt: "2026-01-01T00:00:00.000Z",
		resultRef: `job:${jobId}`,
		...(status === "queued"
			? { queuedAt: "2026-01-01T00:00:00.100Z", queueOrder: 1, plannedOutputBytes: 24 * 1024 }
			: {}),
		...(status === "running" ? { startedAt: "2026-01-01T00:00:01.000Z", plannedOutputBytes: 24 * 1024 } : {}),
		...(status === "completed"
			? {
					startedAt: "2026-01-01T00:00:01.000Z",
					finishedAt: "2026-01-01T00:00:02.000Z",
					runId: "run-1",
					plannedOutputBytes: 0,
				}
			: {}),
	};
	return {
		schemaVersion: 1,
		sequence: 1,
		job: job as unknown as PersistedSubagentJobSnapshot["job"],
		...(status === "completed"
			? {
					result: {
						schemaVersion: 1,
						jobId,
						runId: "run-1",
						status: "completed",
						diagnostics: [],
					},
				}
			: {}),
	} as PersistedSubagentJobSnapshot;
}

afterEach(async () => {
	await Promise.all(registries.splice(0).map((registry) => registry.shutdown()));
});

describe("durable subagent jobs", () => {
	it("persists acceptance before launching and returns before the runner settles", async () => {
		const snapshots: PersistedSubagentJobSnapshot[] = [];
		let settle!: (value: SubagentJobRunResult) => void;
		const run = vi.fn(
			() =>
				new Promise<SubagentJobRunResult>((resolve) => {
					settle = resolve;
				}),
		);
		const registry = createRegistry((snapshot) => snapshots.push(snapshot));

		const accepted = launch(registry, run);
		expect(accepted.status).toBe("created");
		expect(accepted.resultRef).toBe(`job:${accepted.jobId}`);
		expect(run).not.toHaveBeenCalled();
		expect(snapshots.map((snapshot) => snapshot.job.status)).toEqual(["created"]);

		await flush();
		expect(run).toHaveBeenCalledOnce();
		expect(registry.inspect(accepted.jobId).job.status).toBe("running");

		settle(completedRun());
		await flush();
		expect(registry.inspect(accepted.jobId).job.status).toBe("completed");
		expect(snapshots.map((snapshot) => snapshot.job.status)).toEqual(["created", "running", "completed"]);
	});

	it("queues a second owner job when the active limit is reached", async () => {
		const run = vi.fn(
			(signal: AbortSignal) =>
				new Promise<SubagentJobRunResult>((resolve) => {
					signal.addEventListener("abort", () =>
						resolve({
							result: { ...completedRun().result, status: "cancelled", partial: true },
							verification: { verified: false, reason: "cancelled", paths: [], unresolvedClaims: [] },
						}),
					);
				}),
		);
		const registry = createRegistry(
			() => {},
			() => {},
			{ maxActiveJobs: 1 },
		);
		launch(registry, run);
		const queued = launch(registry, run);

		expect(queued.status).toBe("queued");
		expect(run).not.toHaveBeenCalled();
		await flush();
		expect(run).toHaveBeenCalledOnce();
		expect(registry.inspect(queued.jobId).job.status).toBe("queued");
	});

	it("does not launch when the initial durable snapshot fails", () => {
		const run = vi.fn(async () => completedRun());
		const registry = createRegistry(() => {
			throw new Error("disk full");
		});

		expect(() => launch(registry, run)).toThrowError(/persistence|disk full/i);
		expect(run).not.toHaveBeenCalled();
	});

	it("turns an unverified completed result into verification_failed without promoting evidence", async () => {
		const snapshots: PersistedSubagentJobSnapshot[] = [];
		const registry = createRegistry((snapshot) => snapshots.push(snapshot));
		const run = completedRun();
		run.result.findings = [
			{
				severity: "high",
				category: "security",
				claim: "Unverified claim",
				evidence: [{ path: "src/file.ts" }],
			},
		];
		const accepted = launch(registry, async () => ({
			...run,
			verification: { verified: false, reason: "Evidence escaped scope.", paths: [], unresolvedClaims: [] },
		}));

		await flush();
		expect(registry.inspect(accepted.jobId).job.status).toBe("verification_failed");
		expect(snapshots.at(-1)?.result?.status).toBe("verification_failed");
		expect(snapshots.at(-1)?.result?.evidence).toBeUndefined();
		expect(snapshots.at(-1)?.result?.findings).toBeUndefined();
	});

	it("deeply freezes nested finding evidence returned by inspection", async () => {
		const registry = createRegistry();
		const run = completedRun();
		run.result.findings = [
			{
				severity: "high",
				category: "security",
				claim: "Verified claim",
				evidence: [{ path: "src/file.ts" }],
			},
		];
		const accepted = launch(registry, async () => run);
		await flush();

		const inspection = registry.inspect(accepted.jobId);
		const evidence = inspection.result?.findings?.[0]?.evidence as unknown as Array<{ path: string }>;
		expect(() => evidence.push({ path: "mutated.ts" })).toThrow();
		expect(() => {
			evidence[0].path = "mutated.ts";
		}).toThrow();
		expect(registry.inspect(accepted.jobId).result?.findings?.[0]?.evidence).toEqual([{ path: "src/file.ts" }]);
	});

	it("cancels through the job controller and waits for runner settlement", async () => {
		let aborted = false;
		let settle!: (value: SubagentJobRunResult) => void;
		const registry = createRegistry();
		const accepted = launch(
			registry,
			(signal) =>
				new Promise<SubagentJobRunResult>((resolve) => {
					settle = resolve;
					signal.addEventListener("abort", () => {
						aborted = true;
						settle({
							result: {
								...completedRun().result,
								status: "cancelled",
								partial: true,
								summary: "Cancelled.",
							},
							verification: { verified: false, reason: "Cancelled.", paths: [], unresolvedClaims: [] },
						});
					});
				}),
		);
		await flush();

		const cancelled = await registry.cancel(accepted.jobId);
		expect(aborted).toBe(true);
		expect(cancelled.job.status).toBe("cancelled");
		expect(registry.inspect(accepted.jobId).job.status).toBe("cancelled");
	});

	it("does not expose or control another owner's job", async () => {
		const registry = createRegistry();
		const accepted = launch(registry, async () => completedRun());
		await flush();

		expect(() => registry.inspect(accepted.jobId, "owner-b")).toThrowError(/not found/i);
		await expect(registry.cancel(accepted.jobId, "owner-b")).rejects.toThrow(/not found/i);
	});

	it("rejects noncanonical persisted findings and inconsistent terminal snapshots", () => {
		const registry = createRegistry();
		const makeSnapshot = (
			overrides: Partial<PersistedSubagentJobSnapshot["result"]> = {},
		): PersistedSubagentJobSnapshot => ({
			schemaVersion: 1,
			sequence: 1,
			job: {
				schemaVersion: 1,
				jobId: "job-invalid",
				ownerSessionId: "owner-a",
				launchLeafId: "leaf-a",
				role: "explore",
				status: "completed",
				createdAt: "2026-01-01T00:00:00.000Z",
				startedAt: "2026-01-01T00:00:01.000Z",
				finishedAt: "2026-01-01T00:00:02.000Z",
				runId: "run-1",
				resultRef: "job:job-invalid",
			},
			result: {
				schemaVersion: 1,
				jobId: "job-invalid",
				runId: "run-1",
				status: "completed",
				verification: { verified: true, reason: "ok" },
				diagnostics: [],
				...overrides,
			},
		});
		const invalidFindings: ReviewFinding[][] = [
			[
				{
					severity: "high",
					category: "security",
					claim: "Bearer secret-token",
					evidence: [{ path: "src/file.ts" }],
				},
			],
			[
				{
					severity: "high",
					category: "security",
					claim: "x".repeat(8 * 1024 + 1),
					evidence: [{ path: "src/file.ts" }],
				},
			],
			[
				{
					severity: "high",
					category: "security",
					claim: "x",
					evidence: Array.from({ length: 17 }, () => ({ path: "src/file.ts" })),
				},
			],
		];

		for (const findings of invalidFindings) {
			registry.restore([{ type: "custom", customType: JOB_ENTRY_TYPE, data: makeSnapshot({ findings }) }]);
			expect(() => registry.inspect("job-invalid")).toThrowError(/not found/i);
		}

		registry.restore([
			{
				type: "custom",
				customType: JOB_ENTRY_TYPE,
				data: makeSnapshot({ status: "failed" }),
			},
		]);
		expect(() => registry.inspect("job-invalid")).toThrowError(/not found/i);

		registry.restore([
			{
				type: "custom",
				customType: JOB_ENTRY_TYPE,
				data: makeSnapshot({ runId: "run-2" }),
			},
		]);
		expect(() => registry.inspect("job-invalid")).toThrowError(/not found/i);

		const baseline = makeSnapshot();
		const lifecycleCases = [
			{
				jobId: "created-valid",
				valid: true,
				data: {
					...baseline,
					job: {
						...baseline.job,
						jobId: "created-valid",
						resultRef: "job:created-valid",
						status: "created",
						startedAt: undefined,
						finishedAt: undefined,
						runId: undefined,
					},
					result: undefined,
				},
			},
			{
				jobId: "created-started",
				valid: false,
				data: {
					...baseline,
					job: {
						...baseline.job,
						jobId: "created-started",
						resultRef: "job:created-started",
						status: "created",
						startedAt: "2026-01-01T00:00:01.000Z",
						finishedAt: undefined,
						runId: undefined,
					},
					result: undefined,
				},
			},
			{
				jobId: "running-valid",
				valid: true,
				data: {
					...baseline,
					job: {
						...baseline.job,
						jobId: "running-valid",
						resultRef: "job:running-valid",
						status: "running",
						startedAt: "2026-01-01T00:00:01.000Z",
						finishedAt: undefined,
						runId: undefined,
					},
					result: undefined,
				},
			},
			{
				jobId: "running-missing-start",
				valid: false,
				data: {
					...baseline,
					job: {
						...baseline.job,
						jobId: "running-missing-start",
						resultRef: "job:running-missing-start",
						status: "running",
						startedAt: undefined,
						finishedAt: undefined,
						runId: undefined,
					},
					result: undefined,
				},
			},
			{
				jobId: "terminal-missing-start",
				valid: false,
				data: {
					...baseline,
					job: {
						...baseline.job,
						jobId: "terminal-missing-start",
						resultRef: "job:terminal-missing-start",
						startedAt: undefined,
					},
				},
			},
			{
				jobId: "interrupted-created",
				valid: true,
				data: {
					...baseline,
					job: {
						...baseline.job,
						jobId: "interrupted-created",
						resultRef: "job:interrupted-created",
						status: "interrupted",
						startedAt: undefined,
						runId: undefined,
					},
					result: { schemaVersion: 1, jobId: "interrupted-created", status: "interrupted", diagnostics: [] },
				},
			},
		] as const;
		for (const lifecycleCase of lifecycleCases) {
			registry.restore([{ type: "custom", customType: JOB_ENTRY_TYPE, data: lifecycleCase.data }]);
			if (lifecycleCase.valid) {
				const expectedStatus =
					lifecycleCase.data.job.status === "created" || lifecycleCase.data.job.status === "running"
						? "interrupted"
						: lifecycleCase.data.job.status;
				expect(registry.inspect(lifecycleCase.jobId).job.status).toBe(expectedStatus);
			} else expect(() => registry.inspect(lifecycleCase.jobId)).toThrowError(/not found/i);
		}
	});

	it("ignores snapshots owned by another session during restore", () => {
		const persisted: PersistedSubagentJobSnapshot[] = [];
		const registry = createRegistry((snapshot) => persisted.push(snapshot));
		const foreignSnapshot: PersistedSubagentJobSnapshot = {
			schemaVersion: 1,
			sequence: 1,
			job: {
				schemaVersion: 1,
				jobId: "foreign-job",
				ownerSessionId: "owner-b",
				launchLeafId: "leaf-b",
				role: "explore",
				status: "running",
				createdAt: "2026-01-01T00:00:00.000Z",
				resultRef: "job:foreign-job",
			},
		};

		registry.restore([{ type: "custom", customType: JOB_ENTRY_TYPE, data: foreignSnapshot }]);

		expect(() => registry.inspect("foreign-job")).toThrowError(/not found/i);
		expect(persisted).toHaveLength(0);
	});

	it("rejects restore while a worker is active and leaves the worker untouched", async () => {
		let settle!: (value: SubagentJobRunResult) => void;
		const registry = createRegistry();
		const accepted = launch(
			registry,
			() =>
				new Promise<SubagentJobRunResult>((resolve) => {
					settle = resolve;
				}),
		);
		await flush();

		expect(() => registry.restore([])).toThrowError(SubagentJobError);
		expect(registry.inspect(accepted.jobId).job.status).toBe("running");
		settle({
			result: { ...completedRun().result, status: "cancelled", partial: true },
			verification: { verified: false, reason: "test", paths: [], unresolvedClaims: [] },
		});
		await flush();
	});

	it("restores active jobs as interrupted without relaunching them", () => {
		const snapshots: PersistedSubagentJobSnapshot[] = [
			{
				schemaVersion: 1,
				sequence: 1,
				job: {
					schemaVersion: 1,
					jobId: "job-restore",
					ownerSessionId: "owner-a",
					launchLeafId: "leaf-a",
					role: "explore",
					status: "running",
					createdAt: "2026-01-01T00:00:00.000Z",
					startedAt: "2026-01-01T00:00:01.000Z",
					resultRef: "job:job-restore",
				},
			},
		];
		const persisted: PersistedSubagentJobSnapshot[] = [];
		const registry = createRegistry((snapshot) => persisted.push(snapshot));

		const notifications = registry.restore(
			snapshots.map((snapshot) => ({ type: "custom", customType: JOB_ENTRY_TYPE, data: snapshot })),
		);

		expect(registry.inspect("job-restore").job.status).toBe("interrupted");
		expect(persisted.at(-1)?.sequence).toBe(2);
		expect(persisted.at(-1)?.result?.diagnostics[0]?.code).toBe("job_runtime_interrupted");
		expect(notifications).toHaveLength(1);
	});

	it("does not notify when terminal persistence fails and releases the active slot", async () => {
		const persisted: PersistedSubagentJobSnapshot[] = [];
		const notify = vi.fn();
		let writes = 0;
		const registry = createRegistry((snapshot) => {
			writes++;
			if (snapshot.job.status === "completed") throw new Error("terminal disk failure");
			persisted.push(snapshot);
		}, notify);
		const accepted = launch(registry, async () => completedRun());

		await flush();
		expect(registry.inspect(accepted.jobId).job.status).toBe("failed");
		expect(notify).not.toHaveBeenCalled();
		expect(writes).toBe(3);
		expect(persisted.at(-1)?.job.status).toBe("running");
		const nextRunner = vi.fn(async () => completedRun());
		let nextError: unknown;
		try {
			launch(registry, nextRunner);
		} catch (error) {
			nextError = error;
		}
		expect(nextError).toBeInstanceOf(SubagentJobError);
		expect((nextError as SubagentJobError).code).toBe("job_persistence_failure");
		expect(nextRunner).not.toHaveBeenCalled();
	});

	it("does not invoke the runner when the running snapshot cannot persist", async () => {
		const run = vi.fn(async () => completedRun());
		let writes = 0;
		const registry = createRegistry(() => {
			writes++;
			if (writes === 2) throw new Error("running disk failure");
		});
		const accepted = launch(registry, run);

		await flush();
		expect(run).not.toHaveBeenCalled();
		expect(registry.inspect(accepted.jobId).job.status).toBe("failed");
		const nextRunner = vi.fn(async () => completedRun());
		let nextError: unknown;
		try {
			launch(registry, nextRunner);
		} catch (error) {
			nextError = error;
		}
		expect(nextError).toBeInstanceOf(SubagentJobError);
		expect((nextError as SubagentJobError).code).toBe("job_persistence_failure");
		expect(nextRunner).not.toHaveBeenCalled();
	});

	it("delivers completion only after terminal persistence and retains at most 32 terminal jobs", async () => {
		const snapshots: PersistedSubagentJobSnapshot[] = [];
		const order: string[] = [];
		const registry = createRegistry(
			(snapshot) => {
				snapshots.push(snapshot);
				if (snapshot.job.status === "completed") order.push("persisted");
			},
			() => order.push("notified"),
		);

		for (let index = 0; index < 33; index++) {
			const accepted = launch(registry, async () => completedRun());
			await flush();
			if (index < 32) expect(registry.inspect(accepted.jobId).job.status).toBe("completed");
		}

		expect(registry.list().filter((job) => job.job.status === "completed")).toHaveLength(32);
		expect(order[0]).toBe("persisted");
		expect(order[1]).toBe("notified");
		expect(snapshots.filter((snapshot) => snapshot.job.status === "completed")).toHaveLength(33);
	});

	it("shuts down active work as interrupted and leaves no active controller", async () => {
		let settle!: (value: SubagentJobRunResult) => void;
		const snapshots: PersistedSubagentJobSnapshot[] = [];
		const registry = createRegistry((snapshot) => snapshots.push(snapshot));
		launch(
			registry,
			(signal) =>
				new Promise<SubagentJobRunResult>((resolve) => {
					settle = resolve;
					signal.addEventListener("abort", () =>
						settle({
							result: { ...completedRun().result, status: "cancelled", partial: true },
							verification: { verified: false, reason: "shutdown", paths: [], unresolvedClaims: [] },
						}),
					);
				}),
		);
		await flush();

		await registry.shutdown();
		expect(registry.list().every((job) => job.job.status !== "running" && job.job.status !== "created")).toBe(true);
		expect(snapshots.at(-1)?.job.status).toBe("interrupted");
	});

	it("makes concurrent shutdown callers await the same worker settlement", async () => {
		let settle!: (value: SubagentJobRunResult) => void;
		let aborted = false;
		const registry = createRegistry();
		launch(
			registry,
			(signal) =>
				new Promise<SubagentJobRunResult>((resolve) => {
					settle = resolve;
					signal.addEventListener("abort", () => {
						aborted = true;
					});
				}),
		);
		await flush();

		let firstResolved = false;
		const first = registry.shutdown().then(() => {
			firstResolved = true;
		});
		const second = registry.shutdown();
		await flush();
		expect(aborted).toBe(true);
		expect(firstResolved).toBe(false);

		settle({
			result: { ...completedRun().result, status: "cancelled", partial: true },
			verification: { verified: false, reason: "shutdown", paths: [], unresolvedClaims: [] },
		});
		await Promise.all([first, second]);
		expect(firstResolved).toBe(true);
	});

	it("promotes queued jobs in FIFO order after terminal persistence", async () => {
		const first = deferredRun();
		const starts: string[] = [];
		const second = vi.fn(async () => {
			starts.push("second");
			return completedRun();
		});
		const third = vi.fn(async () => {
			starts.push("third");
			return completedRun();
		});
		const registry = createRegistry(
			() => {},
			() => {},
			{ maxActiveJobs: 1 },
		);
		launch(registry, first.run);
		const secondJob = launch(registry, second);
		const thirdJob = launch(registry, third);

		await flush();
		expect(first.run).toHaveBeenCalledOnce();
		expect(second).not.toHaveBeenCalled();
		expect(third).not.toHaveBeenCalled();
		first.settle();
		await flush();

		expect(second).toHaveBeenCalledOnce();
		expect(starts[0]).toBe("second");
		expect(starts).toEqual(["second", "third"]);
		expect(registry.inspect(thirdJob.jobId).job.status).toBe("completed");
		expect(registry.inspect(secondJob.jobId).job.status).toBe("completed");
	});

	it("never exceeds the configured active concurrency", async () => {
		const first = deferredRun();
		const second = deferredRun();
		const third = deferredRun();
		const registry = createRegistry(
			() => {},
			() => {},
			{ maxActiveJobs: 2 },
		);
		launch(registry, first.run);
		launch(registry, second.run);
		const thirdJob = launch(registry, third.run);

		await flush();
		expect(first.run).toHaveBeenCalledOnce();
		expect(second.run).toHaveBeenCalledOnce();
		expect(third.run).not.toHaveBeenCalled();
		expect(registry.inspect(thirdJob.jobId).job.status).toBe("queued");

		first.settle();
		await flush();
		expect(third.run).toHaveBeenCalledOnce();
		second.settle();
		third.settle();
		await flush();
	});

	it("rejects the ninth queued job without persistence or runner invocation", async () => {
		const first = deferredRun();
		const persisted: PersistedSubagentJobSnapshot[] = [];
		const registry = createRegistry(
			(snapshot) => persisted.push(snapshot),
			() => {},
			{ maxActiveJobs: 1 },
		);
		launch(registry, first.run);
		const queuedRunners = Array.from({ length: 8 }, () => vi.fn(async () => completedRun()));
		for (const run of queuedRunners) launch(registry, run);
		const writesBeforeReject = persisted.length;
		const rejected = vi.fn(async () => completedRun());

		expect(() => launch(registry, rejected)).toThrowError(/queue/i);
		expect(persisted.length).toBe(writesBeforeReject);
		expect(rejected).not.toHaveBeenCalled();
		first.settle();
		await flush();
	});

	it("rejects an admission that would exceed the owner aggregate output budget", async () => {
		const first = deferredRun();
		const persisted: PersistedSubagentJobSnapshot[] = [];
		const registry = createRegistry(
			(snapshot) => persisted.push(snapshot),
			() => {},
			{
				maxActiveJobs: 1,
				maxAggregateOutputBytes: 32 * 1024,
			},
		);
		launch(registry, first.run, 24 * 1024);
		const rejected = vi.fn(async () => completedRun());

		expect(() => launch(registry, rejected, 9 * 1024)).toThrowError(/budget/i);
		expect(persisted).toHaveLength(1);
		expect(rejected).not.toHaveBeenCalled();
		first.settle();
		await flush();
	});

	it("cancels a queued job without invoking it and releases queue capacity", async () => {
		const first = deferredRun();
		const second = vi.fn(async () => completedRun());
		const third = vi.fn(async () => completedRun());
		const registry = createRegistry(
			() => {},
			() => {},
			{ maxActiveJobs: 1, maxQueuedJobs: 1 },
		);
		launch(registry, first.run);
		const secondJob = launch(registry, second);
		const cancelled = await registry.cancel(secondJob.jobId);

		expect(cancelled.job.status).toBe("cancelled");
		expect(second).not.toHaveBeenCalled();
		const thirdJob = launch(registry, third);
		expect(thirdJob.status).toBe("queued");
		first.settle();
		await flush();
		expect(third).toHaveBeenCalledOnce();
	});

	it("cancels an active and queued subset atomically without running selected queued jobs", async () => {
		const active = vi.fn(
			(signal: AbortSignal) =>
				new Promise<SubagentJobRunResult>((resolve) => {
					signal.addEventListener("abort", () =>
						resolve({
							result: { ...completedRun().result, status: "cancelled", partial: true },
							verification: { verified: false, reason: "cancelled", paths: [], unresolvedClaims: [] },
						}),
					);
				}),
		);
		const selectedQueued = vi.fn(async () => completedRun());
		const unselectedQueued = vi.fn(async () => completedRun());
		const registry = createRegistry(
			() => {},
			() => {},
			{ maxActiveJobs: 1, maxQueuedJobs: 2 },
		);
		const activeJob = launch(registry, active);
		const selectedQueuedJob = launch(registry, selectedQueued);
		const unselectedQueuedJob = launch(registry, unselectedQueued);
		await flush();

		await registry.cancelSubset([activeJob.jobId, selectedQueuedJob.jobId]);
		await flush();

		expect(registry.inspect(activeJob.jobId).job.status).toBe("cancelled");
		expect(registry.inspect(selectedQueuedJob.jobId).job.status).toBe("cancelled");
		expect(selectedQueued).not.toHaveBeenCalled();
		expect(unselectedQueued).toHaveBeenCalledOnce();
		expect(registry.inspect(unselectedQueuedJob.jobId).job.status).toBe("completed");
	});

	it("waits for a running cancellation to settle before promoting the next job", async () => {
		const first = deferredRun();
		const second = vi.fn(async () => completedRun());
		const registry = createRegistry(
			() => {},
			() => {},
			{ maxActiveJobs: 1 },
		);
		const firstJob = launch(registry, first.run);
		launch(registry, second);
		await flush();

		const cancellation = registry.cancel(firstJob.jobId);
		await flush();
		expect(second).not.toHaveBeenCalled();
		first.settle({
			result: { ...completedRun().result, status: "cancelled", partial: true },
			verification: { verified: false, reason: "cancelled", paths: [], unresolvedClaims: [] },
		});
		await cancellation;
		await flush();
		expect(second).toHaveBeenCalledOnce();
	});

	it("does not double-pump or double-release on concurrent cancellation", async () => {
		const first = deferredRun();
		const second = vi.fn(async () => completedRun());
		const registry = createRegistry(
			() => {},
			() => {},
			{ maxActiveJobs: 1 },
		);
		const firstJob = launch(registry, first.run);
		launch(registry, second);
		await flush();

		const cancellations = [registry.cancel(firstJob.jobId), registry.cancel(firstJob.jobId)];
		await flush();
		expect(second).not.toHaveBeenCalled();
		first.settle({
			result: { ...completedRun().result, status: "cancelled", partial: true },
			verification: { verified: false, reason: "cancelled", paths: [], unresolvedClaims: [] },
		});
		await Promise.all(cancellations);
		await flush();
		expect(second).toHaveBeenCalledOnce();
	});

	it("fails closed when the running transition cannot persist", async () => {
		const runner = vi.fn(async () => completedRun());
		let runningWrites = 0;
		const registry = createRegistry((snapshot) => {
			if (snapshot.job.status === "running") {
				runningWrites++;
				throw new Error("running disk failure");
			}
		});
		const failed = launch(registry, runner);
		await flush();

		expect(runner).not.toHaveBeenCalled();
		expect(registry.inspect(failed.jobId).job.status).toBe("failed");
		const nextRunner = vi.fn(async () => completedRun());
		let nextError: unknown;
		try {
			launch(registry, nextRunner);
		} catch (error) {
			nextError = error;
		}
		expect(nextError).toBeInstanceOf(SubagentJobError);
		expect((nextError as SubagentJobError).code).toBe("job_persistence_failure");
		expect(nextRunner).not.toHaveBeenCalled();
		expect(runningWrites).toBe(1);
	});

	it("fails closed when a queued transition cannot persist", async () => {
		const first = deferredRun();
		const persisted: PersistedSubagentJobSnapshot[] = [];
		let failQueued = true;
		const registry = createRegistry(
			(snapshot) => {
				if (snapshot.job.status === "queued" && failQueued) {
					failQueued = false;
					throw new Error("queued disk failure");
				}
				persisted.push(snapshot);
			},
			() => {},
			{ maxActiveJobs: 1 },
		);
		launch(registry, first.run);
		expect(() => launch(registry, async () => completedRun())).toThrowError(/persistence/i);
		expect(persisted.some((snapshot) => snapshot.job.status === "queued")).toBe(false);
		const accepted = launch(registry, async () => completedRun());
		expect(accepted.status).toBe("queued");
		first.settle();
		await flush();
	});

	it("does not promote the queue after terminal persistence fails", async () => {
		const second = vi.fn(async () => completedRun());
		let failTerminal = true;
		const registry = createRegistry(
			(snapshot) => {
				if (snapshot.job.status === "completed" && failTerminal) {
					failTerminal = false;
					throw new Error("terminal disk failure");
				}
			},
			() => {},
			{ maxActiveJobs: 1 },
		);
		launch(registry, async () => completedRun());
		launch(registry, second);
		await flush();

		expect(second).not.toHaveBeenCalled();
		const nextRunner = vi.fn(async () => completedRun());
		let nextError: unknown;
		try {
			launch(registry, nextRunner);
		} catch (error) {
			nextError = error;
		}
		expect(nextError).toBeInstanceOf(SubagentJobError);
		expect((nextError as SubagentJobError).code).toBe("job_persistence_failure");
		expect(nextRunner).not.toHaveBeenCalled();
	});

	it("reports FIFO queue position without exposing scheduler controls", async () => {
		const first = deferredRun();
		const registry = createRegistry(
			() => {},
			() => {},
			{ maxActiveJobs: 1 },
		);
		launch(registry, first.run);
		const queued = launch(registry, async () => completedRun());
		await flush();

		const inspection = registry.inspect(queued.jobId);
		expect(inspection.job.status).toBe("queued");
		expect(inspection.queuePosition).toBe(1);
		expect(JSON.stringify(inspection)).not.toMatch(/priority|schedulerId|workerId/i);
		first.settle();
		await flush();
	});

	it("interrupts queued and running jobs during shutdown without pumping", async () => {
		const first = deferredRun();
		const second = vi.fn(async () => completedRun());
		const registry = createRegistry(
			() => {},
			() => {},
			{ maxActiveJobs: 1 },
		);
		const firstJob = launch(registry, first.run);
		const secondJob = launch(registry, second);
		await flush();

		const shutdown = registry.shutdown();
		await flush();
		expect(registry.inspect(secondJob.jobId).job.status).toBe("interrupted");
		expect(second).not.toHaveBeenCalled();
		first.settle({
			result: { ...completedRun().result, status: "cancelled", partial: true },
			verification: { verified: false, reason: "shutdown", paths: [], unresolvedClaims: [] },
		});
		await shutdown;
		expect(registry.inspect(firstJob.jobId).job.status).toBe("interrupted");
	});

	it("restores every stale nonterminal job as interrupted without relaunch", () => {
		const registry = createRegistry();
		const snapshots = ["created", "queued", "running"].map((status, index) =>
			persistedSnapshot(`stale-${index}`, status),
		);
		const notifications = registry.restore(
			snapshots.map((snapshot) => ({ type: "custom", customType: JOB_ENTRY_TYPE, data: snapshot })),
		);

		expect(notifications).toHaveLength(3);
		expect(registry.list().every((inspection) => inspection.job.status === "interrupted")).toBe(true);
	});

	it("does not restore a foreign queued job into the owner scheduler", () => {
		const registry = createRegistry();
		registry.restore([
			{ type: "custom", customType: JOB_ENTRY_TYPE, data: persistedSnapshot("foreign-queued", "queued", "owner-b") },
		]);

		expect(registry.list()).toHaveLength(0);
		expect(() => registry.inspect("foreign-queued")).toThrowError(/not found/i);
	});

	it("retains a live running job while trimming terminal history", async () => {
		const live = deferredRun();
		const registry = createRegistry(
			() => {},
			() => {},
			{ maxActiveJobs: 2 },
		);
		const liveJob = launch(registry, live.run);
		await flush();
		for (let index = 0; index < 33; index++) {
			const terminal = launch(registry, async () => completedRun());
			await flush();
			expect(registry.inspect(terminal.jobId).job.status).toBe("completed");
		}

		expect(registry.inspect(liveJob.jobId).job.status).toBe("running");
		expect(registry.list().filter((inspection) => inspection.job.status === "completed")).toHaveLength(32);
		live.settle();
		await flush();
	});

	it("publishes admission, running, and terminal changes after persistence", async () => {
		const statuses: string[] = [];
		const registry = createRegistry();
		const unsubscribe = registry.subscribe(() => statuses.push(registry.list()[0]?.job.status ?? "missing"));
		const accepted = launch(registry, async () => completedRun());
		expect(statuses).toEqual(["created"]);
		await flush();

		expect(registry.inspect(accepted.jobId).job.status).toBe("completed");
		expect(statuses).toEqual(["created", "running", "completed"]);
		unsubscribe();
	});

	it("swallows throwing subscribers without changing scheduling", async () => {
		const first = deferredRun();
		const second = vi.fn(async () => completedRun());
		const registry = createRegistry(
			() => {},
			() => {},
			{ maxActiveJobs: 1 },
		);
		registry.subscribe(() => {
			throw new Error("durable job UI failed");
		});
		launch(registry, first.run);
		const queued = launch(registry, second);
		expect(queued.status).toBe("queued");
		first.settle();
		await flush();
		expect(second).toHaveBeenCalledOnce();
	});

	it("does not publish a phantom job when initial persistence fails", () => {
		const listener = vi.fn();
		const registry = createRegistry(() => {
			throw new Error("initial disk failure");
		});
		registry.subscribe(listener);
		expect(() => launch(registry, async () => completedRun())).toThrowError(SubagentJobError);
		expect(listener).not.toHaveBeenCalled();
	});

	it("publishes one restore completion after stale jobs are terminalized", () => {
		const listener = vi.fn();
		const registry = createRegistry();
		registry.subscribe(listener);
		registry.restore([
			{ type: "custom", customType: JOB_ENTRY_TYPE, data: persistedSnapshot("restore-running", "running") },
		]);
		expect(listener).toHaveBeenCalledOnce();
		expect(registry.inspect("restore-running").job.status).toBe("interrupted");
	});
});

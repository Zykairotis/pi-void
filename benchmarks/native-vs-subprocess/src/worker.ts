import { runNativeFixture } from "./fixture.ts";
import type { WorkloadId } from "./types.ts";

const workload = process.argv[2] as WorkloadId | undefined;
if (!workload) {
	process.stderr.write("missing workload\n");
	process.exit(2);
}
if (workload === "process-fatal") process.exit(97);

try {
	const controller = new AbortController();
	let duringCancelTimer: NodeJS.Timeout | undefined;
	if (workload === "cancel-before-tool-settle")
		setTimeout(() => controller.abort(), 5);
	const result = await runNativeFixture(
		workload,
		process.cwd(),
		controller.signal,
		() => {
			if (workload === "cancel-during-tool" && !duringCancelTimer)
				duringCancelTimer = setTimeout(() => controller.abort(), 5);
		},
		"subprocess",
	);
	if (duringCancelTimer) clearTimeout(duringCancelTimer);
	process.stdout.write(
		`${JSON.stringify({ result, endRssBytes: process.memoryUsage().rss, cancelLatencyMs: result.cancelLatencyMs })}\n`,
	);
} catch (error) {
	process.stderr.write(
		`${error instanceof Error ? error.message : String(error)}\n`,
	);
	process.exit(1);
}

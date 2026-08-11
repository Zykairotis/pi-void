import { BENCHMARK_TARGET_IDS, type BenchmarkTargetId } from "../manifest.ts";
import type { BenchmarkTargetAdapter } from "../targets.ts";
import { piNativeExampleAdapter } from "./pi-native-example.ts";
import { piStockAdapter } from "./pi-stock.ts";
import { piSubagentsAdapter } from "./pi-subagents.ts";
import { piVoidAdapter } from "./pi-void.ts";

const ADAPTERS = new Map<BenchmarkTargetId, BenchmarkTargetAdapter>([
	[piStockAdapter.id, piStockAdapter],
	[piNativeExampleAdapter.id, piNativeExampleAdapter],
	[piSubagentsAdapter.id, piSubagentsAdapter],
	[piVoidAdapter.id, piVoidAdapter],
]);

export function getTargetAdapter(id: BenchmarkTargetId): BenchmarkTargetAdapter {
	const adapter = ADAPTERS.get(id);
	if (adapter === undefined) throw new Error(`unknown benchmark target: ${id}`);
	return adapter;
}

for (const id of BENCHMARK_TARGET_IDS) {
	if (!ADAPTERS.has(id)) throw new Error(`missing adapter for ${id}`);
}

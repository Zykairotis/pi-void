import { BENCHMARK_TARGET_IDS, type BenchmarkTargetId } from "../manifest.ts";
import type { BenchmarkTargetAdapter } from "../targets.ts";
import { iceNativeExampleAdapter } from "./ice-native-example.ts";
import { iceStockAdapter } from "./ice-stock.ts";
import { iceSubagentsAdapter } from "./ice-subagents.ts";
import { iceVoidAdapter } from "./ice.ts";

const ADAPTERS = new Map<BenchmarkTargetId, BenchmarkTargetAdapter>([
	[iceStockAdapter.id, iceStockAdapter],
	[iceNativeExampleAdapter.id, iceNativeExampleAdapter],
	[iceSubagentsAdapter.id, iceSubagentsAdapter],
	[iceVoidAdapter.id, iceVoidAdapter],
]);

export function getTargetAdapter(id: BenchmarkTargetId): BenchmarkTargetAdapter {
	const adapter = ADAPTERS.get(id);
	if (adapter === undefined) throw new Error(`unknown benchmark target: ${id}`);
	return adapter;
}

for (const id of BENCHMARK_TARGET_IDS) {
	if (!ADAPTERS.has(id)) throw new Error(`missing adapter for ${id}`);
}

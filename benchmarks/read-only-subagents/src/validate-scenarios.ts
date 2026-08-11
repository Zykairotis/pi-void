import type { BenchmarkScenarioCatalog } from "./scenarios.ts";

export function findMissingAdversarialScenarioIds(
	catalog: BenchmarkScenarioCatalog,
	adversarialTestSource: string,
): string[] {
	return catalog.scenarios
		.filter((scenario) => scenario.class === "deterministic" && scenario.requiresAdversarialRegression === true)
		.map((scenario) => scenario.id)
		.filter((id) => !new RegExp(`it\\(\\s*[\\"']${escapeRegExp(id)}(?:\\s|:|[\\"'])`).test(adversarialTestSource));
}

export function assertScenarioRegressionConsistency(
	catalog: BenchmarkScenarioCatalog,
	adversarialTestSource: string,
): void {
	const missing = findMissingAdversarialScenarioIds(catalog, adversarialTestSource);
	if (missing.length > 0) throw new Error(`missing adversarial regression IDs: ${missing.join(", ")}`);
}

function escapeRegExp(value: string): string {
	return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

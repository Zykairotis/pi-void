import { readFileSync } from "node:fs";
import { resolve } from "node:path";

export const SCENARIO_CLASSES = ["deterministic", "model_quality"] as const;
export type BenchmarkScenarioClass = (typeof SCENARIO_CLASSES)[number];

export const SCENARIO_CATEGORIES = [
	"scope",
	"trust",
	"context",
	"lifecycle",
	"recovery",
	"budget",
	"verification",
	"quality",
] as const;
export type BenchmarkScenarioCategory = (typeof SCENARIO_CATEGORIES)[number];

export interface BenchmarkScenario {
	id: string;
	class: BenchmarkScenarioClass;
	category: BenchmarkScenarioCategory;
	requiresAdversarialRegression?: boolean;
}

export interface BenchmarkScenarioCatalog {
	schemaVersion: 1;
	scenarios: BenchmarkScenario[];
}

export const PROVIDER_SMOKE_SCENARIO: BenchmarkScenario = {
	id: "smoke.provider-route",
	class: "deterministic",
	category: "lifecycle",
};

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null;
}

function isOneOf<T extends readonly string[]>(values: T, value: unknown): value is T[number] {
	return typeof value === "string" && values.includes(value);
}

export function validateScenarioCatalog(value: unknown): BenchmarkScenarioCatalog {
	if (!isRecord(value) || value.schemaVersion !== 1 || !Array.isArray(value.scenarios)) {
		throw new Error("invalid benchmark scenario catalog");
	}

	const seen = new Set<string>();
	const scenarios = value.scenarios.map((scenario, index) => {
		if (!isRecord(scenario) || typeof scenario.id !== "string" || scenario.id.length === 0) {
			throw new Error(`invalid scenario at index ${index}`);
		}
		if (seen.has(scenario.id)) throw new Error(`duplicate scenario id: ${scenario.id}`);
		seen.add(scenario.id);
		if (!isOneOf(SCENARIO_CLASSES, scenario.class)) {
			throw new Error(`invalid scenario class for ${scenario.id}`);
		}
		if (!isOneOf(SCENARIO_CATEGORIES, scenario.category)) {
			throw new Error(`invalid scenario category for ${scenario.id}`);
		}
		if (
			scenario.requiresAdversarialRegression !== undefined &&
			typeof scenario.requiresAdversarialRegression !== "boolean"
		) {
			throw new Error(`invalid regression flag for ${scenario.id}`);
		}
		return {
			id: scenario.id,
			class: scenario.class,
			category: scenario.category,
			requiresAdversarialRegression: scenario.requiresAdversarialRegression,
		};
	});

	return { schemaVersion: 1, scenarios };
}

export function assertRepeatAllowed(scenario: BenchmarkScenario, repeat: number): void {
	if (!Number.isInteger(repeat) || repeat < 1) throw new Error("repeat must be a positive integer");
	if (repeat > 1 && scenario.class !== "model_quality") {
		throw new Error("repeat > 1 is only allowed for model_quality scenarios");
	}
}

export function loadScenarioCatalog(filePath: string): BenchmarkScenarioCatalog {
	return validateScenarioCatalog(JSON.parse(readFileSync(resolve(filePath), "utf8")));
}

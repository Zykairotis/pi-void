export function matchesEntryType(value: unknown, canonical: string): boolean {
	return value === canonical;
}

export function normalizeLegacySettings(input: unknown): Record<string, unknown> {
	if (typeof input !== "object" || input === null || Array.isArray(input)) {
		throw new Error("Invalid settings: expected an object");
	}
	return { ...(input as Record<string, unknown>) };
}

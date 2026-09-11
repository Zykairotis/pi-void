export type CompatibilityEnvironment = Readonly<Record<string, string | undefined>>;

export function getCompatibleConfigEnv(
	name: string,
	scoped?: CompatibilityEnvironment,
	ambient: CompatibilityEnvironment = process.env,
): string | undefined {
	if (scoped && Object.hasOwn(scoped, name) && scoped[name] !== undefined) return scoped[name];
	if (Object.hasOwn(ambient, name) && ambient[name] !== undefined) return ambient[name];
	return undefined;
}

export function getIceEnv(name: string, env: CompatibilityEnvironment = process.env): string | undefined {
	return Object.hasOwn(env, name) ? env[name] : undefined;
}

export function normalizeLegacyEnvironment(env: CompatibilityEnvironment): Record<string, string | undefined> {
	return { ...env };
}

const SESSION_METADATA = [
	"ICE_SESSION_ID",
	"ICE_SESSION_FILE",
	"ICE_PROVIDER",
	"ICE_MODEL",
	"ICE_REASONING_LEVEL",
] as const;

export function clearSessionEnvironment(env: Record<string, string | undefined>): void {
	for (const name of SESSION_METADATA) delete env[name];
}

import { getIceEnv } from "./legacy-compat/env.ts";

export function areExperimentalFeaturesEnabled(): boolean {
	return getIceEnv("ICE_EXPERIMENTAL") === "1";
}

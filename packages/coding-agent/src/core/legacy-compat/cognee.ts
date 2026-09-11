import { join } from "node:path";

export function compatibleCogneeStorageDir(agentDir: string): string {
	return join(agentDir, "ice-cognee");
}

export function compatibleBlackholeConfigPath(agentDir: string): string {
	return join(agentDir, "ice-blackhole", "ice-blackhole-config.json");
}

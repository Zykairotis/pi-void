import { join } from "node:path";

/** ICE config root only. */
export function compatibleConfigRoot(parent: string, configDirName = ".ice"): string {
	return join(parent, configDirName);
}

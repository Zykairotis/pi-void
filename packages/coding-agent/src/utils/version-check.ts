import { compare, valid } from "semver";
import { PACKAGE_NAME } from "../config.ts";
import { getIceEnv } from "../core/legacy-compat/env.ts";
import { getIceUserAgent } from "./ice-user-agent.ts";

// A renamed domain is not a deployed release service. The registry identifies the
// running package; an operator-owned endpoint can be configured explicitly.
const LATEST_VERSION_URL = `https://registry.npmjs.org/${encodeURIComponent(PACKAGE_NAME)}/latest`;
const DEFAULT_VERSION_CHECK_TIMEOUT_MS = 10000;

export interface LatestIceRelease {
	version: string;
	packageName?: string;
	note?: string;
}

export function comparePackageVersions(leftVersion: string, rightVersion: string): number | undefined {
	const left = valid(leftVersion.trim());
	const right = valid(rightVersion.trim());
	if (!left || !right) return undefined;
	return compare(left, right);
}

export function isNewerPackageVersion(candidateVersion: string, currentVersion: string): boolean {
	const comparison = comparePackageVersions(candidateVersion, currentVersion);
	if (comparison !== undefined) return comparison > 0;
	return candidateVersion.trim() !== currentVersion.trim();
}

export async function getLatestIceRelease(
	currentVersion: string,
	options: { timeoutMs?: number } = {},
): Promise<LatestIceRelease | undefined> {
	if (getIceEnv("ICE_OFFLINE")) return undefined;
	const configuredUrl = process.env.ICE_UPDATE_URL;
	const endpoint = new URL(configuredUrl || LATEST_VERSION_URL);
	const local = ["localhost", "127.0.0.1", "[::1]"].includes(endpoint.hostname);
	if (
		(endpoint.protocol !== "https:" && !(local && endpoint.protocol === "http:")) ||
		endpoint.username ||
		endpoint.password
	) {
		throw new Error("ICE_UPDATE_URL must use HTTPS (or local HTTP), without embedded credentials.");
	}
	const response = await fetch(endpoint.toString(), {
		redirect: "error",
		headers: {
			"User-Agent": getIceUserAgent(currentVersion),
			accept: "application/json",
		},
		signal: AbortSignal.timeout(options.timeoutMs ?? DEFAULT_VERSION_CHECK_TIMEOUT_MS),
	});
	if (!response.ok) return undefined;

	const raw: unknown = await response.json();
	if (typeof raw !== "object" || raw === null || Array.isArray(raw)) return undefined;
	const data = raw as Record<string, unknown>;
	if (typeof data.version !== "string" || !valid(data.version.trim())) return undefined;
	const rawName = data.packageName ?? data.name;
	if (rawName !== undefined && typeof rawName !== "string") return undefined;
	const packageName = typeof rawName === "string" && rawName.trim() ? rawName.trim() : undefined;
	if (packageName && !/^(?:@[a-z0-9._-]+\/)?[a-z0-9][a-z0-9._-]*$/i.test(packageName)) return undefined;
	// Cross-package handoff requires an explicitly configured operator endpoint.
	if (!configuredUrl && packageName && packageName !== PACKAGE_NAME) return undefined;
	const note = typeof data.note === "string" && data.note.trim() ? data.note.trim() : undefined;
	return { version: data.version.trim(), packageName, ...(note ? { note } : {}) };
}

export async function getLatestIceVersion(
	currentVersion: string,
	options: { timeoutMs?: number } = {},
): Promise<string | undefined> {
	return (await getLatestIceRelease(currentVersion, options))?.version;
}

export async function checkForNewIceVersion(currentVersion: string): Promise<LatestIceRelease | undefined> {
	if (getIceEnv("ICE_SKIP_VERSION_CHECK")) return undefined;
	try {
		const latestRelease = await getLatestIceRelease(currentVersion);
		return latestRelease && isNewerPackageVersion(latestRelease.version, currentVersion) ? latestRelease : undefined;
	} catch {
		return undefined;
	}
}

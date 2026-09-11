import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { PACKAGE_NAME } from "../src/config.ts";
import {
	checkForNewIceVersion,
	comparePackageVersions,
	getLatestIceRelease,
	getLatestIceVersion,
	isNewerPackageVersion,
} from "../src/utils/version-check.ts";
import { allowNetwork } from "./test-network-env.ts";

beforeEach(() => {
	allowNetwork();
	for (const name of ["ICE_UPDATE_URL", "ICE_SKIP_VERSION_CHECK", "ICE_OFFLINE"]) vi.stubEnv(name, undefined);
});
afterEach(() => {
	vi.unstubAllGlobals();
	vi.unstubAllEnvs();
});

describe("version checks", () => {
	it("compares package versions", () => {
		expect(comparePackageVersions("0.70.6", "0.70.5")).toBeGreaterThan(0);
		expect(comparePackageVersions("0.70.5", "0.70.5")).toBe(0);
		expect(comparePackageVersions("0.70.4", "0.70.5")).toBeLessThan(0);
		expect(comparePackageVersions("5.0.0-beta.20", "5.0.0-beta.9")).toBeGreaterThan(0);
		expect(isNewerPackageVersion("0.70.5", "0.70.5")).toBe(false);
		expect(isNewerPackageVersion("0.70.6", "0.70.5")).toBe(true);
	});
	it("returns only newer versions", async () => {
		vi.stubGlobal(
			"fetch",
			vi.fn(async () => Response.json({ version: "1.2.3" })),
		);
		await expect(checkForNewIceVersion("1.2.3")).resolves.toBeUndefined();
		await expect(checkForNewIceVersion("1.2.2")).resolves.toEqual({ version: "1.2.3" });
	});
	it("looks up the running registry package rather than an invented rebrand endpoint", async () => {
		const fetchMock = vi.fn(async () => Response.json({ version: "1.2.4" }));
		vi.stubGlobal("fetch", fetchMock);
		await expect(getLatestIceVersion("1.2.3")).resolves.toBe("1.2.4");
		expect(fetchMock).toHaveBeenCalledWith(
			`https://registry.npmjs.org/${encodeURIComponent(PACKAGE_NAME)}/latest`,
			expect.objectContaining({
				redirect: "error",
				headers: expect.objectContaining({
					"User-Agent": expect.stringMatching(/^ice\/1\.2\.3 /),
					accept: "application/json",
				}),
			}),
		);
	});
	it("accepts the matching npm registry package name", async () => {
		vi.stubGlobal(
			"fetch",
			vi.fn(async () => Response.json({ name: PACKAGE_NAME, version: "1.2.4" })),
		);
		await expect(getLatestIceRelease("1.2.3")).resolves.toEqual({ packageName: PACKAGE_NAME, version: "1.2.4" });
	});
	it("permits package handoff only through an explicitly configured operator endpoint", async () => {
		vi.stubEnv("ICE_UPDATE_URL", "https://updates.example/latest");
		vi.stubGlobal(
			"fetch",
			vi.fn(async () => Response.json({ packageName: "@new-scope/ice", version: "1.2.4" })),
		);
		await expect(getLatestIceRelease("1.2.3")).resolves.toEqual({ packageName: "@new-scope/ice", version: "1.2.4" });
	});
	it("returns update notes from the version check api", async () => {
		vi.stubGlobal(
			"fetch",
			vi.fn(async () => Response.json({ note: " **Read this** ", version: "1.2.4" })),
		);
		await expect(getLatestIceRelease("1.2.3")).resolves.toEqual({ note: "**Read this**", version: "1.2.4" });
	});
	it("skips automatic api calls when version checks are disabled", async () => {
		vi.stubEnv("ICE_SKIP_VERSION_CHECK", "1");
		const fetchMock = vi.fn();
		vi.stubGlobal("fetch", fetchMock);
		await expect(checkForNewIceVersion("1.2.3")).resolves.toBeUndefined();
		expect(fetchMock).not.toHaveBeenCalled();
	});
	it("allows direct api calls when automatic version checks are disabled", async () => {
		vi.stubEnv("ICE_SKIP_VERSION_CHECK", "1");
		const fetchMock = vi.fn(async () => Response.json({ version: "1.2.4" }));
		vi.stubGlobal("fetch", fetchMock);
		await expect(getLatestIceVersion("1.2.3")).resolves.toBe("1.2.4");
		expect(fetchMock).toHaveBeenCalledOnce();
	});
	it("does not treat PI_* offline controls as ICE_* values", async () => {
		const fetchMock = vi.fn(async () => Response.json({ version: "1.2.4" }));
		vi.stubGlobal("fetch", fetchMock);
		vi.stubEnv("PI_SKIP_VERSION_CHECK", "1");
		await expect(checkForNewIceVersion("1.2.3")).resolves.toEqual({ version: "1.2.4" });
		vi.stubEnv("PI_OFFLINE", "1");
		await expect(getLatestIceRelease("1.2.3")).resolves.toEqual({ version: "1.2.4" });
		expect(fetchMock).toHaveBeenCalled();
	});
	it("rejects an unrelated registry package", async () => {
		vi.stubGlobal(
			"fetch",
			vi.fn(async () => Response.json({ name: "@unrelated/package", version: "1.2.4" })),
		);
		await expect(getLatestIceRelease("1.2.3")).resolves.toBeUndefined();
	});
	it.each([
		null,
		[],
		{ version: "not-semver" },
		{ version: "1.2.4", packageName: "--force" },
		{ version: "1.2.4", packageName: 1 },
	])("rejects malformed release data: %j", async (data) => {
		vi.stubGlobal(
			"fetch",
			vi.fn(async () => Response.json(data)),
		);
		await expect(getLatestIceRelease("1.2.3")).resolves.toBeUndefined();
	});
	it.each(["file:///etc/passwd", "http://remote.example/latest", "https://user:password@updates.example/latest"])(
		"rejects unsafe update endpoint %s",
		async (url) => {
			vi.stubEnv("ICE_UPDATE_URL", url);
			const fetchMock = vi.fn();
			vi.stubGlobal("fetch", fetchMock);
			await expect(getLatestIceRelease("1.2.3")).rejects.toThrow(/ICE_UPDATE_URL/);
			expect(fetchMock).not.toHaveBeenCalled();
		},
	);
});

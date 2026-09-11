import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdir, mkdtemp, readFile, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { getTargetAdapter } from "../src/adapters/index.ts";
import { prepareTarget } from "../src/targets.ts";

async function createCheckout() {
	const dir = await mkdtemp(join(tmpdir(), "ice-b8-target-"));
	await writeFile(join(dir, "fixture.txt"), "fixture\n");
	execFileSync("git", ["init", "--quiet", dir]);
	execFileSync("git", ["-C", dir, "add", "fixture.txt"]);
	execFileSync("git", [
		"-C",
		dir,
		"-c",
		"user.name=ICE Test",
		"-c",
		"user.email=test@example.invalid",
		"commit",
		"--quiet",
		"-m",
		"fixture",
	]);
	const commit = execFileSync("git", ["-C", dir, "rev-parse", "HEAD"], { encoding: "utf8" }).trim();
	return { dir, commit };
}

test("registers all four target adapters", () => {
	for (const id of ["ice-stock", "ice-native-example", "ice-subagents", "ice"]) {
		assert.equal(getTargetAdapter(id).id, id);
	}
});

test("prepares ice from the workspace and resolves its commit", async () => {
	const checkout = await createCheckout();
	try {
		const prepared = await prepareTarget(
			{ id: "ice", source: { commit: "CURRENT_WORKSPACE" } },
			{ workspacePath: checkout.dir },
		);
		assert.equal(prepared.resolvedCommit, checkout.commit);
		assert.equal(prepared.sourcePath, checkout.dir);
	} finally {
		await rm(checkout.dir, { recursive: true, force: true });
	}
});

test("rejects an absent external checkout with the pinned target diagnostic", async () => {
	await assert.rejects(
		() =>
			prepareTarget(
				{
					id: "ice-stock",
					source: { commit: "0123456789abcdef0123456789abcdef01234567" },
				},
				{ workspacePath: "/does/not/exist" },
			),
		/benchmark target ice-stock@0123456789abcdef0123456789abcdef01234567 unavailable/,
	);
});

test("rejects a non-git checkout with the pinned target diagnostic", async () => {
	const dir = await mkdtemp(join(tmpdir(), "ice-b8-non-git-"));
	try {
		await assert.rejects(
			() =>
				prepareTarget(
					{
						id: "ice-stock",
						source: { commit: "0123456789abcdef0123456789abcdef01234567" },
						localPath: dir,
					},
					{ workspacePath: "/unused" },
				),
			/benchmark target ice-stock@0123456789abcdef0123456789abcdef01234567 unavailable/,
		);
	} finally {
		await rm(dir, { recursive: true, force: true });
	}
});

test("rejects an exact SHA mismatch without changing the checkout", async () => {
	const checkout = await createCheckout();
	try {
		const before = await readFile(join(checkout.dir, "fixture.txt"), "utf8");
		await assert.rejects(
			() =>
				prepareTarget(
					{
						id: "ice-stock",
						source: { commit: "0123456789abcdef0123456789abcdef01234567" },
						localPath: checkout.dir,
					},
					{ workspacePath: "/unused" },
				),
			/benchmark target ice-stock@0123456789abcdef0123456789abcdef01234567 unavailable/,
		);
		assert.equal(await readFile(join(checkout.dir, "fixture.txt"), "utf8"), before);
	} finally {
		await rm(checkout.dir, { recursive: true, force: true });
	}
});

test("rejects a source subdirectory that escapes through a symlink", async () => {
	const checkout = await createCheckout();
	const outside = await mkdtemp(join(tmpdir(), "ice-b8-outside-"));
	try {
		await symlink(outside, join(checkout.dir, "source"), "dir");
		execFileSync("git", ["-C", checkout.dir, "add", "source"]);
		execFileSync("git", [
			"-C",
			checkout.dir,
			"-c",
			"user.name=ICE Test",
			"-c",
			"user.email=test@example.invalid",
			"commit",
			"--quiet",
			"-m",
			"symlink",
		]);
		const commit = execFileSync("git", ["-C", checkout.dir, "rev-parse", "HEAD"], { encoding: "utf8" }).trim();
		await assert.rejects(
			() =>
				prepareTarget(
					{ id: "ice-stock", source: { commit, subdir: "source" }, localPath: checkout.dir },
					{ workspacePath: "/unused" },
				),
			/benchmark target ice-stock@.* unavailable/,
		);
	} finally {
		await rm(checkout.dir, { recursive: true, force: true });
		await rm(outside, { recursive: true, force: true });
	}
});

test("uses the target adapter to prepare an exact external checkout", async () => {
	const checkout = await createCheckout();
	try {
		await mkdir(join(checkout.dir, "dist"));
		await writeFile(join(checkout.dir, "dist", "cli.js"), "#!/usr/bin/env node\n");
		const prepared = await getTargetAdapter("ice-stock").prepare(
			{ workspacePath: "/unused" },
			{ id: "ice-stock", source: { commit: checkout.commit }, localPath: checkout.dir },
		);
		assert.equal(prepared.resolvedCommit, checkout.commit);
		assert.equal(prepared.sourcePath, checkout.dir);
	} finally {
		await rm(checkout.dir, { recursive: true, force: true });
	}
});

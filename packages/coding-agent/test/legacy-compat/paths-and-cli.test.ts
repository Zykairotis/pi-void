import { mkdirSync, mkdtempSync, rmSync, symlinkSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { compatibleConfigRoot } from "../../src/core/legacy-compat/paths.ts";

const roots: string[] = [];
function fixture(): string {
	const root = mkdtempSync(join(tmpdir(), "ice-compat-root-"));
	roots.push(root);
	return root;
}
afterEach(() => {
	for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

describe("one-tree compatibility selection", () => {
	it("uses ICE for a fresh installation without creating anything", () => {
		const root = fixture();
		expect(compatibleConfigRoot(root)).toBe(join(root, ".ice"));
	});
	it("does not discover an existing .pi tree", () => {
		const root = fixture();
		mkdirSync(join(root, ".pi"));
		expect(compatibleConfigRoot(root)).toBe(join(root, ".ice"));
		mkdirSync(join(root, ".ice"));
		expect(compatibleConfigRoot(root)).toBe(join(root, ".ice"));
	});
	it("does not route other branded configurations into old state", () => {
		const root = fixture();
		mkdirSync(join(root, ".pi"));
		expect(compatibleConfigRoot(root, ".tau")).toBe(join(root, ".tau"));
	});
	it.skipIf(process.platform === "win32")("does not bypass a dangling canonical symlink", () => {
		const root = fixture();
		mkdirSync(join(root, ".pi"));
		symlinkSync(join(root, "missing"), join(root, ".ice"));
		expect(compatibleConfigRoot(root)).toBe(join(root, ".ice"));
	});
});

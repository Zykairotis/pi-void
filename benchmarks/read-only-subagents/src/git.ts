import { execFileSync } from "node:child_process";

const FULL_SHA_PATTERN = /^[0-9a-f]{40}$/;

export function resolveGitHead(checkoutPath: string): string {
	try {
		const head = execFileSync("git", ["-C", checkoutPath, "rev-parse", "--verify", "HEAD"], {
			encoding: "utf8",
			stdio: ["ignore", "pipe", "ignore"],
		}).trim();
		if (!FULL_SHA_PATTERN.test(head)) throw new Error("git returned a non-commit value");
		return head;
	} catch {
		throw new Error(`unable to resolve git HEAD: ${checkoutPath}`);
	}
}

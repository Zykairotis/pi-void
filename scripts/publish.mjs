#!/usr/bin/env node

import { spawnSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

const packages = [
	{ directory: "packages/ai", name: "@zykairotis/ice-ai" },
	{ directory: "packages/agent", name: "@zykairotis/ice-agent-core" },
	{ directory: "packages/protocol", name: "@zykairotis/ice-protocol" },
	{ directory: "packages/client", name: "@zykairotis/ice-client" },
	{ directory: "packages/storage/sqlite-node", name: "@zykairotis/ice-storage-sqlite-node" },
	{ directory: "packages/tui", name: "@zykairotis/ice-tui" },
	{ directory: "packages/server", name: "@zykairotis/ice-server" },
	{ directory: "packages/coding-agent", name: "@zykairotis/ice-coding-agent" },
];

const dryRun = process.argv.includes("--dry-run");
// Provenance can only be generated inside a supported CI provider, and OIDC trusted
// publishing cannot be configured until a package exists on the registry. Bootstrap
// publishes therefore need to opt out. CI must never pass this flag.
const skipProvenance = process.argv.includes("--no-provenance");
const knownFlags = new Set(["--dry-run", "--no-provenance"]);
const unknownArgs = process.argv.slice(2).filter((arg) => !knownFlags.has(arg));

if (unknownArgs.length > 0) {
	console.error(`Usage: node scripts/publish.mjs [--dry-run] [--no-provenance]`);
	process.exit(1);
}

function commandForPlatform(command) {
	return process.platform === "win32" ? `${command}.cmd` : command;
}

function run(command, args, options = {}) {
	console.log(`$ ${[command, ...args].join(" ")}`);
	const result = spawnSync(commandForPlatform(command), args, {
		cwd: options.cwd,
		encoding: "utf8",
		stdio: options.capture ? ["inherit", "pipe", "pipe"] : "inherit",
	});

	if (result.status !== 0) {
		const output = [result.stdout, result.stderr].filter(Boolean).join("\n");
		throw new Error(output ? `Command failed: ${command} ${args.join(" ")}\n${output}` : `Command failed: ${command} ${args.join(" ")}`);
	}

	return result;
}

function readPackageJson(directory) {
	return JSON.parse(readFileSync(join(directory, "package.json"), "utf8"));
}

function assertBuildOutputExists(directory) {
	if (!existsSync(join(directory, "dist"))) {
		throw new Error(`${directory}/dist does not exist. Run npm run build before publishing.`);
	}
}

function validatePack(directory) {
	const result = run("npm", ["pack", "--dry-run", "--ignore-scripts", "--json"], { capture: true, cwd: directory });
	// npm >= 12 returns an object keyed by package name; earlier versions returned an array.
	const parsed = JSON.parse(result.stdout);
	const packed = Array.isArray(parsed) ? parsed[0] : Object.values(parsed)[0];
	console.log(`  ${packed.filename}: ${packed.files.length} files, ${packed.size} bytes packed, ${packed.unpackedSize} bytes unpacked`);
}

function isPublished(name, version) {
	const result = spawnSync(commandForPlatform("npm"), ["view", `${name}@${version}`, "version", "--json"], {
		encoding: "utf8",
		stdio: ["inherit", "pipe", "pipe"],
	});

	if (result.status === 0 && result.stdout.trim()) {
		return true;
	}

	const output = [result.stdout, result.stderr].filter(Boolean).join("\n");
	if (result.status !== 0 && (output.includes("E404") || output.includes("404 Not Found"))) {
		return false;
	}

	throw new Error(output ? `Failed to query ${name}@${version}\n${output}` : `Failed to query ${name}@${version}`);
}

const packageVersions = new Map();
for (const pkg of packages) {
	const packageJson = readPackageJson(pkg.directory);
	if (packageJson.name !== pkg.name) {
		throw new Error(`${pkg.directory}/package.json has name ${packageJson.name}, expected ${pkg.name}`);
	}
	packageVersions.set(pkg.name, packageJson.version);
}

const versions = [...new Set(packageVersions.values())];
if (versions.length !== 1) {
	throw new Error(`Publish packages are not lockstep versioned: ${versions.join(", ")}`);
}

console.log(`Publishing ice packages at ${versions[0]}${dryRun ? " (dry run)" : ""}\n`);

const packageStates = packages.map((pkg) => ({
	...pkg,
	published: false,
	version: packageVersions.get(pkg.name),
}));

for (const pkg of packageStates) {
	assertBuildOutputExists(pkg.directory);
	pkg.published = isPublished(pkg.name, pkg.version);

	if (pkg.published) {
		console.log(`${pkg.name}@${pkg.version} is already published; validating package contents only.`);
	} else {
		console.log(`${pkg.name}@${pkg.version} is not published; validating package contents before publish.`);
	}
	validatePack(pkg.directory);
	console.log();
}

if (dryRun) {
	process.exit(0);
}

console.log("All packages validated; starting publication.\n");

for (const pkg of packageStates) {
	if (pkg.published) {
		console.log(`Skipping ${pkg.name}@${pkg.version}: already published\n`);
		continue;
	}

	const publishArgs = ["publish", "--access", "public", "--ignore-scripts"];
	if (skipProvenance) {
		console.log("  WARNING: publishing without a provenance attestation (bootstrap mode)");
	} else {
		publishArgs.push("--provenance");
	}
	run("npm", publishArgs, { cwd: pkg.directory });
	console.log();
}

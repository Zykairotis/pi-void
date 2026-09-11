import type { Readable } from "node:stream";

type PipedInput = Readable & { isTTY?: boolean };
type NativeStdin = { text(): Promise<string> };

/** Read CLI input without confusing a terminal with a closed input pipe. */
export async function readPipedStdin(input: PipedInput = process.stdin): Promise<string | undefined> {
	if (input.isTTY) return undefined;
	if (input.errored) throw input.errored;
	if (input.readableEnded || input.destroyed) return undefined;

	// Bun exposes a file-backed stdin reader. Avoid its Node stream compatibility
	// layer for the real process input, while retaining normal streams for callers.
	if (input === process.stdin && process.versions.bun) {
		const runtime = globalThis as typeof globalThis & { Bun?: { stdin?: NativeStdin } };
		const nativeInput = runtime.Bun?.stdin;
		if (nativeInput) return (await nativeInput.text()).trim() || undefined;
	}

	return new Promise<string | undefined>((resolve, reject) => {
		let data = "";
		let settled = false;
		const cleanup = (): void => {
			input.off("data", onData);
			input.off("end", onEnd);
			input.off("close", onClose);
			input.off("error", onError);
		};
		const onData = (chunk: string): void => {
			data += chunk;
		};
		const onEnd = (): void => {
			if (settled) return;
			settled = true;
			cleanup();
			resolve(data.trim() || undefined);
		};
		const onError = (error: Error): void => {
			if (settled) return;
			settled = true;
			cleanup();
			reject(error);
		};
		const onClose = (): void => {
			if (input.readableEnded) onEnd();
			else onError(input.errored ?? new Error("Standard input closed before reaching EOF."));
		};
		input.setEncoding("utf8");
		input.on("data", onData);
		input.once("end", onEnd);
		input.once("close", onClose);
		input.once("error", onError);
		input.resume();
	});
}

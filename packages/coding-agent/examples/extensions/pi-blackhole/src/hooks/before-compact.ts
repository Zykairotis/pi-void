import { convertToLlm, type ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { compile } from "../core/summarize.ts";
import { loadConfig } from "../core/unified-config.ts";

export const PI_VCC_COMPACT_INSTRUCTION = "__pi_vcc__";

export function registerBeforeCompactHook(pi: ExtensionAPI): void {
	pi.on("session_before_compact", (event, ctx) => {
		const config = loadConfig((message) => {
			if (ctx.hasUI) ctx.ui.notify(message, "warning");
		});
		if (config.compaction === "off" || config.compactionEngine !== "blackhole") return;
		if (config.compaction === "manual" && event.customInstructions !== PI_VCC_COMPACT_INSTRUCTION) return;

		const sourceMessages = [...event.preparation.messagesToSummarize, ...event.preparation.turnPrefixMessages];
		const summary = compile({
			messages: convertToLlm(sourceMessages),
			previousSummary: event.preparation.previousSummary,
			fileOps: {
				readFiles: [...event.preparation.fileOps.read],
				modifiedFiles: [...event.preparation.fileOps.edited],
				createdFiles: [...event.preparation.fileOps.written],
			},
		});
		if (!summary) return { cancel: true };

		return {
			compaction: {
				summary,
				firstKeptEntryId: event.preparation.firstKeptEntryId,
				tokensBefore: event.preparation.tokensBefore,
				details: {
					engine: "blackhole",
					memory: false,
				},
			},
		};
	});
}

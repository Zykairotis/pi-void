import { convertToLlm, type ExtensionAPI } from "@zykairotis/ice-coding-agent";
import { compile } from "../core/summarize.ts";
import { resolveBlackholeTail } from "../core/tail.ts";
import { loadConfig } from "../core/unified-config.ts";

export const ICE_VCC_COMPACT_INSTRUCTION = "__ice_vcc__";

export function registerBeforeCompactHook(ice: ExtensionAPI): void {
	ice.on("session_before_compact", (event, ctx) => {
		const config = loadConfig((message) => {
			if (ctx.hasUI) ctx.ui.notify(message, "warning");
		});
		if (config.compaction === "off" || config.compactionEngine !== "blackhole") return;
		if (config.compaction === "manual" && event.customInstructions !== ICE_VCC_COMPACT_INSTRUCTION) return;

		const tail = resolveBlackholeTail({
			tailBehavior: config.tailBehavior,
			firstKeptEntryId: event.preparation.firstKeptEntryId,
			messagesToSummarize: event.preparation.messagesToSummarize,
			turnPrefixMessages: event.preparation.turnPrefixMessages,
			branchEntries: event.branchEntries,
		});
		const summary = compile({
			messages: convertToLlm(tail.sourceMessages),
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
				firstKeptEntryId: tail.firstKeptEntryId,
				tokensBefore: event.preparation.tokensBefore,
				details: {
					engine: "blackhole",
					memory: false,
					tailBehavior: config.tailBehavior,
					summarizedKeptTail: tail.summarizedKeptTail,
				},
			},
		};
	});
}

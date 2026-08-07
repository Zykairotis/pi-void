export function redactMemoryText(text: string, maxChars: number): string {
	if (maxChars <= 0) return "";
	const redacted = text
		.replace(/Bearer\s+[^\s"'`]+/gi, "Bearer [REDACTED]")
		.replace(
			/(["']?)(api[_-]?key|token|secret|password|authorization)\1\s*[:=]\s*["']?[^,\s}"']+/gi,
			"$1$2$1=[REDACTED]",
		);
	return redacted.slice(0, maxChars);
}

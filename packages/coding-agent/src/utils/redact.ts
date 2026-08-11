export function redactCredentialText(text: string): string {
	return text
		.replace(/Bearer\s+[^\s"'`]+/gi, "Bearer [REDACTED]")
		.replace(
			/(\s*["']?)(api[_-]?key|token|secret|password|authorization)\1\s*[:=]\s*["']?[^,\s}"']+/gi,
			"$1$2$1=[REDACTED]",
		);
}

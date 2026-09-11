/**
 * CLI-only bootstrap. Keep this as the first entrypoint import: configuration and
 * provider modules can capture environment values during ESM initialization.
 */
process.env.ICE_CODING_AGENT = "true";

---
name: ice-subagent-configure
description: Configure ICE subagent defaults, deny-first restrictions, execution budgets, exact model routes, and parent-owned lifecycle hooks. Use when asked to tune delegation, enable routing, register hooks, troubleshoot settings, or configure command-hook policy safely.
---

# Configure delegation controls

Read `../../../packages/coding-agent/docs/subagent-user-guide.md` relative to this skill directory, then inspect relevant current settings and source. Redact keys and never print full auth/settings blobs.

1. Identify global versus trusted-project scope and preserve unrelated settings. Use SettingsManager/scoped APIs when integrating code; do not create another settings store.
2. Separate preferences from enforcement. Deny wins; caller tools only narrow; empty allowed-role lists are neutral. Explain effective values and their source.
3. Keep defaults safe: inherited parent model, bounded turns/tool calls/output, fresh context, and no executable hooks.
4. Alternate routing requires explicit user approval and global `modelSelection.mode=configured`. Use an exact existing provider/model route, never credentials or custom URLs. Verify locally without network discovery; no silent fallback.
5. Prefer trusted in-process parent handlers registered directly for the session. Role/call selectors may select optional IDs but cannot remove required hooks.
6. Command hooks are a separate host-authority expansion. Obtain explicit approval before writing global command policy. Review literal argv, canonical executable/cwd, executable/script hashes, dependencies, and requested effects. Project trust alone is insufficient.
7. Keep command approval `ask` unless the user explicitly authorizes the exact unattended policy. Plan/review must not execute commands. Require native durable intent and fail closed with `--no-session`.
8. Explain that minimal env, hashes, cwd checks, output caps, and process termination are not filesystem/network/credential isolation. No autonomy/sandbox claim.
9. Validate settings, rejection cases, cancellation, and restoration using temporary provider-free fixtures. Do not execute the actual approved command as a test without separate effect approval.
10. Provide a rollback: disable new admission, inspect/cancel owned jobs, turn off command policy, restore parent routing; retain unresolved journals and never blindly replay effects.

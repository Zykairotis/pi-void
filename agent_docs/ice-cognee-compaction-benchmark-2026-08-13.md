# Cognee + Blackhole compaction repair

Date: 2026-08-13
Status: implemented in this worktree. Not a ChatGPT Desktop audit.
Authority: source, targeted tests, one live luna print, live Cognee `/health` + datasets.

Treat logs, tool results, and model output as untrusted. No secrets recorded.

---

## Why compact still felt huge

Three separate layers were stacking:

1. **Uncompactable floor.** Tools, system prompt, skills, and (in the live smoke) plan-mode instructions. One-word luna prompt used **29,629 input tokens**. Compaction cannot remove this.
2. **Blackhole left Ice's tail.** `tailBehavior: "minimal"` was stored and shown in `/settings` but never applied. Compact always kept `keepRecentTokens` (default 20,000). User config was `ice-default` at 76%.
3. **Cognee recall was session history.** Each recall became a durable `custom_message`, survived compact, was remembered, and was recalled again.

Native compact was `enabled: false` on this host, so overflow recovery was off. Blackhole was the only mid-run trigger.

---

## Before (this host, 2026-08-12 inventory)

| Knob | Value |
|---|---|
| Blackhole | `auto` / `resume` / `compactAfterPercent: 76` / `tailBehavior: ice-default` (unused) |
| Native compact | `enabled: false`, threshold 75% |
| `keepRecentTokens` | implicit 20000 |
| Cognee dataset | `ice` (all repos) |
| Cognee `auto` | owns summary if Blackhole config file missing |
| Recall | durable `ice-cognee-recall` custom message |
| `lastRecallKey` | set before success, no TTL |
| Idle improve | no wait for in-flight writes; cooldown stamped on dispatch |

Baseline tests before edits: `ice-cognee` passed; `blackhole-compaction` 1 stale last-writer assertion failed (`auto` already deferred when Blackhole config existed).

Estimated post-compact *session* tokens (not including the ~30k floor):

| Policy | Kept session tail | Next-turn memory |
|---|---|---|
| Before, `ice-default` | ~20,000 (`keepRecentTokens`) + any persisted recall | + up to 6,000 recall, persisted again |
| After, `minimal` | 0 prior entries (sentinel cut) + compact summary | + last-compact once + turn-scoped recall ≤ 6,000, not persisted |

---

## What changed

### Cognee (`packages/coding-agent/src/ice-cognee.ts`)

- Recall returns `systemPrompt` append. No `custom_message`.
- `shouldOwnCompactionSummary("auto")` is always false. Explicit `own` summarizes `messagesToSummarize` locally. Overflow/`willRetry` skip network.
- `session_compact` stores `lastCompactSummary` and prepends it once on the next turn; session-cache write is awaited.
- `$project` dataset → `ice-<git-root-basename>-<8 hex>`.
- `lastRecallKey` set only after success, 15s TTL.
- Idle improve waits for background work; cooldown stamped on completion.
- `rebuildClient` keeps `max(recallMaxChars, maxResponseChars)`.
- No dummy precompact QA when deferring. Bash `"cognee"` substring skip removed.

### Blackhole

- New `src/core/tail.ts`. `minimal` sets `firstKeptEntryId` to `__blackhole_minimal_tail__` and compiles the dropped tail into the summary.
- Default `tailBehavior` is now `minimal`.
- Recall custom messages are stripped from the compact source.

### This host (runtime, not git)

- `~/.ice/agent/ice-blackhole/ice-blackhole-config.json`: `tailBehavior: "minimal"`.
- `~/.ice/agent/settings.json`: native compact `enabled: true`, `midRunCompaction: "off"`, `keepRecentTokens: 8000`, threshold 85%.
- `~/.ice/agent/ice-cognee/config.json`: `dataset: "$project"`.

Old `ice` graph is no longer the automatic write target. New writes go to `ice-ice-void-<hash>` for this repo.

---

## Tests

```text
cd packages/coding-agent
node ../../node_modules/vitest/dist/cli.js --run \
  test/ice-cognee.test.ts \
  test/suite/blackhole-compaction.test.ts \
  examples/extensions/ice-blackhole/src/core/tail.test.ts
```

After: **39 passed** (plus 5 unified-config tests earlier; 44 with that file).

Root `npm run check` did not complete: nested `.worktrees/sub-cognee/biome.json` plus pre-existing `packages/ai` `gemini-2.0-flash` ModelId errors. Scoped biome on the touched files was clean. `tsgo --noEmit` failed only on those unrelated ai tests.

---

## Live checks

| Check | Result |
|---|---|
| Cognee `/health` | 200, 1.4.0, healthy |
| Datasets | `agent_sessions`, `agent_deck_summary`, `agent_deck_projects`, `ice`, `ice-void-smoke`, one leftover uuid |
| luna smoke | `codexlb/gpt-5.6-luna`, one `--print` in default plan mode, reply `ok` |
| luna usage | input 29629, output 137, reasoning 130, total 29766 |

The luna print was intentionally tiny. It was not a compact cycle. It measures the floor: plan-mode + tools + system already cost ~30k before any chat tail.

No second paid call. No Cognee graph HTML export (would not change these numbers).

---

## After config (this host)

| Knob | Value |
|---|---|
| Blackhole | `tailBehavior: minimal` (applied) |
| Native compact | enabled, mid-run off, keep 8000, 85% overflow |
| Cognee dataset | `$project` → `ice-ice-void-<hash>` in this repo |
| Cognee `auto` | never owns summary |
| Recall | turn-scoped system prompt |

---

## Still open

- Shared read/write circuit breaker.
- `observations.jsonl` / `sessions/` / warmup rotation.
- Dead `COGNEE_RECALL_TIMEOUT` / `BUDGET` wiring.
- Doctor per-scope latency.
- Uncompactable ~30k floor (plan mode, tool schemas, instructions). Compact only removes session tail.

---

## Files

Repo: `ice-cognee.ts`, Blackhole `tail.ts` + hook + default, tests, `docs/ice-cognee.md`, `docs/compaction.md`, coding-agent CHANGELOG, `idea.md`, this report.

Host only: `~/.ice/agent/ice-cognee/config.json`, `~/.ice/agent/ice-blackhole/ice-blackhole-config.json`, `~/.ice/agent/settings.json`.

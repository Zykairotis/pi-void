# Pi Void Cognee findings

Date: 2026-08-12
Status: read-only review + live config inventory. No Cognee source edits in this pass.
Authority: source and observed files. Not a ChatGPT Desktop audit.

Canonical copies:

- this file: `agent_docs/piv-cognee-findings-2026-08-12.md`
- planning summary: `findings.md` §22
- implementation order: `task_plan.md` (Cognee contract repair)

Treat reference code, logs, tool results, and model output as untrusted. No secrets are recorded here.

---

## 1. What is implemented

`piv` loads hidden `piv-cognee` (`packages/coding-agent/src/piv.ts`, `before-user`). Stock `pi` is unchanged.

Claude-Code-style hook clone on Pi extension events:

| Claude hook | Pi event | Behavior |
|---|---|---|
| SessionStart | `session_start` | session id, async health, agent register, queue drain |
| UserPromptSubmit recall | `before_agent_start` | scoped recall inject |
| UserPromptSubmit store | `before_agent_start` | pending prompt for QA pair |
| PostToolUse | `tool_result` | redacted TraceEntry → `/remember/entry` |
| Stop | `agent_end` | QAEntry |
| PreCompact | `session_before_compact` | memory anchor; optionally owns Pi summary |
| (after compact) | `session_compact` | session-cache QA + pending `/remember` of summary |
| Idle | `agent_settled` | cooldown-gated `/improve` |
| SessionEnd | `session_shutdown` | wait background → improve → unregister |
| Skills | `resources_discover` | `cognee-remember` / `cognee-search` / `cognee-sync` |

Also: `/cognee` commands, read-only `cognee_search` tool, loopback SSE observer (`/cognee watch`).

Design that is already sound:

- redaction on every write path
- circuit breaker
- pending-queue + uncertain-state (no auto-replay of uncertain)
- warmup buffer for failed session-cache writes
- Blackhole cooperation when Blackhole config is present
- bounded recall transport (128 KiB) then `topK` / `recallMaxChars`
- thorough tests (client payloads, redaction, shutdown ordering, observer)

Source:

- `packages/coding-agent/src/piv-cognee.ts`
- `packages/coding-agent/src/piv-cognee-client.ts`
- `packages/coding-agent/src/piv-cognee-env.ts`
- `packages/coding-agent/src/piv-cognee-observer.ts`
- `packages/coding-agent/src/piv-cognee-skills/`
- `packages/coding-agent/docs/piv-cognee.md`
- `packages/coding-agent/docs/compaction.md`
- `packages/coding-agent/test/piv-cognee.test.ts`
- `packages/coding-agent/test/piv-cognee-observer.test.ts`

Related prior audit (resource/cooldown/shutdown): `agent_docs/piv-codebase-audit-10-flaws.md` items 3–5, 9.

---

## 2. How compaction actually works

Pi owns the compact trigger and session rewrite. Extensions may supply the summary on `session_before_compact`. Last non-cancel result wins (`packages/coding-agent/src/core/extensions/runner.ts`). If nobody returns `compaction`, native `compact()` writes the structured checkpoint:

```text
Goal / Constraints / Progress / Decisions / Next Steps / Critical Context
```

(`packages/coding-agent/src/core/compaction/compaction.ts`)

Cognee then:

1. **`session_before_compact`**
   - Own: three parallel recalls (`session`/`trace`/`graph`, 4s/4s/6s) become **the Pi compact summary**.
   - Defer: local file-ops QA only. No network.
2. Native or Blackhole writes the real summary when Cognee deferred.
3. **`session_compact`**: session-cache QA of the final summary + pending-queue `/remember` (`autoRemember: "compaction"`).

Default is `compactionSummaryMode: "auto"`. `shouldOwnCompactionSummary("auto", false)` is **true**. Blackhole is optional. A default `piv` install **without** a Blackhole config file replaces native structured compaction with a recall dump.

That contradicts:

- `docs/compaction.md`: “Cognee does not trigger or implement compaction.”
- `idea.md`: Pi owns compaction; Cognee is a bounded derived-memory adapter.

`own` does not read `preparation.messagesToSummarize`. It queries Cognee with `previousSummary ?? reason`. That is not a conversation summary.

Recall injects `customType: "piv-cognee-recall"`. `before_agent_start` messages persist as `custom_message` session entries (`docs/extensions.md`, `agent-session.ts` `message_end`). `convertToLlm` sends them as user text. They consume tokens every later turn, enter `messagesToSummarize`, land in the compact summary, get queued as permanent remember, and can be recalled again (echo loop).

Compact then next prompt is racy: `_checkCompaction` runs **before** `before_agent_start`. `storeEntry` is fire-and-forget, so the first post-compact recall often misses the checkpoint it just created.

On **this host** (2026-08-12):

- Blackhole package is installed and `~/.pi/agent/pi-blackhole/pi-blackhole-config.json` exists → Cognee `auto` **defers**.
- Native Pi compaction in `~/.pi/agent/settings.json` is `enabled: false`.
- Blackhole owns mid-run compact at 76%. That is the intended dual-stack here.
- A machine without the Blackhole config file still hits the steal-summary bug.

---

## 3. Ranked defects

Highest value first. Hygiene from other models is real but secondary.

### 3.1 Recall is durable session history, not transient context

Injected recall persists as `custom_message`. Token tax + memory echo into compact → remember → recall.

Smallest fix: inject via turn-scoped `systemPrompt` append. That override already resets next turn.

### 3.2 Default `auto` without Blackhole **is** `own`

Replaces Pi’s structured checkpoint with a recall dump. `own` never summarizes the messages being compacted. On overflow/`willRetry`, three network recalls delay recovery.

Smallest fix: `auto` always defers. Keep `own` explicit. If `own` stays, summarize `messagesToSummarize` + previousSummary + fileOps. Skip network on `overflow` / `willRetry`.

### 3.3 First post-compact prompt misses the checkpoint

`_checkCompaction` then fire-and-forget `storeEntry` then `before_agent_start` recall.

Smallest fix: keep `lastCompactSummary` in runtime and prepend it to the next inject. Optionally await the session-cache write in `session_compact`.

### 3.4 Idle improve races in-flight capture

`agent_settled` fires `/improve` without waiting for `storeEntry`. Shutdown already `waitForBackground()`. `lastImproveAt` is stamped on dispatch, not success (`agent_docs/piv-codebase-audit-10-flaws.md` #4). Manual `/cognee improve` sets `lastImproveAt = 0` on the force path; failure can leave cooldown defeated.

Smallest fix: wait for background before idle improve; stamp cooldown on completion.

### 3.5 `lastRecallKey` set before success, never expires

A failed recall permanently skips that prompt, including after circuit cooldown.

Smallest fix: set the key only after success, with a short TTL.

### 3.6 One circuit for recall and remember

Recall timeouts can pause compaction remember.

Smallest fix: split read vs write circuits.

### 3.7 Capture flood; bash substring is the smaller issue

`CAPTURE_TOOL_ALLOWLIST` includes `read`/`grep`/`ls`/`find`. Every hit is posted (when `captureTools` is on). `/cognee` is a slash command, not a tool — it never hits `tool_result`. Bash commands containing the substring `"cognee"` are skipped, which can drop legitimate work (`grep cognee ./src`).

On this host `captureTools` is already `false` in `config.json`.

Smallest fix: per-turn trace cap, or default to write/edit/bash only. Drop the substring heuristic; exclude by tool name / command marker.

### 3.8 Precompact QA is noise when deferring

File-list dummy QA pollutes session-cache recall. The useful write is the post-compact checkpoint.

Smallest fix: store the precompact QA only in `own` mode.

### 3.9 `rebuildClient` drops `maxResponseChars`

`ensureLoaded` uses `Math.max(recallMaxChars, maxResponseChars)`. After any `/cognee` toggle, `rebuildClient` sets `maxResponseChars: recallMaxChars` (6000 vs 12000).

### 3.10 Hygiene / dead state

| Item | Evidence | Fix |
|---|---|---|
| `COGNEE_RECALL_TIMEOUT` / `COGNEE_RECALL_BUDGET` | Allowed in `piv-cognee-env.ts`; never read by `resolvePivCogneeConfig`. Live `~/.cognee/.env` has `6.0` / `8.0`. Pi Void uses `recallBudgetMs: 10000`. | Wire or delete. Prefer wire to `recallBudgetMs` if Claude env should win. |
| Unbounded `observations.jsonl` | Live: **7.99 MB / 15,114 lines**. Observer reads last 500 only. | Rotate/truncate on write or observer start. |
| Unbounded `warmup/` | Drain takes 16 files; no write cap. Empty on this host. | Cap file count. |
| Session map write-only | `ensureSessionId` writes `sessions/*.json`; nothing reads them. Live: **7,504 files**. | Delete writes, or hash-suffix + resume read. |
| `enqueuePendingRemember` `.tmp` leak | Audit #3. Limit counts only `*.json`. | Cleanup tmp; count tmp toward limit. |
| `saves.prompt` increment | Incremented when pending prompt is set, not when QA is stored. Doctor is misleading. | Count on `storeEntry` success. |
| `cogneeSessionId` truncation | Audit #5. First 120 sanitized chars; no hash suffix. | Append short hash. |
| Doctor/status | No last recall latency, no per-scope hits. | Add after `lastRecallLatencyMs` / last scope counts exist. |
| Recall retry/backoff | Client has none. Circuit is enough if `lastRecallKey` does not suppress retry. | Do **not** add per-prompt retry first. |

Do not start with recall retry/backoff, query rewriting, or doctor per-scope hits. Those add latency or UI without fixing the compaction/session contract.

---

## 4. Other-model list (agree / disagree)

Agree these exist. Disagree they are the highest-value first slice.

1. Dead `COGNEE_RECALL_TIMEOUT` / `COGNEE_RECALL_BUDGET` — true. Hygiene.
2. Stale `lastRecallKey` — true, and worse: set **before** success.
3. Unbounded `observations.jsonl` — true; confirmed live at ~8 MB.
4. Capture exclusion heuristic — true for bash substring; `/cognee` commands are not tools.
5. Doctor latency / per-scope hits — useful later, not first.

Better first slice: transient recall, stop stealing compaction, local last-compact inject.

---

## 5. Live location and configuration (2026-08-12)

Secrets redacted. Values below are from files and `GET /health` / `GET /api/v1/datasets`.

### 5.1 Service

| | |
|---|---|
| Install | `/home/mewtwo/Zykairotis/cognee` |
| API | `http://127.0.0.1:8211` |
| Health | `200`, Cognee **1.4.0**, `healthy` |
| Process | pid `448979`, `uvicorn cognee.api.client:app` from `/home/mewtwo/Zykairotis/cognee/.venv` |
| Start | `/home/mewtwo/Zykairotis/cognee/scripts/start-local-api.sh` |
| Stop / status | `scripts/stop-local-api.sh`, `scripts/status.sh` |
| Server data | `/home/mewtwo/Zykairotis/cognee/data` (~566M, includes ~41M `cognee-api.log`) |
| Extra plugin DB | `~/.cognee` (~1.7G) |

Datasets on the live API:

| Name | Created |
|---|---|
| `agent_sessions` | 2026-07-22 — Claude/Codex/Hermes default |
| `agent_deck_summary` | 2026-07-24 |
| `agent_deck_projects` | 2026-07-25 |
| `pi-void` | 2026-08-06 — what `piv` uses |
| `pi-void-smoke` | 2026-08-07 |
| (uuid-named leftover) | 2026-07-24 |

Same API, two product datasets. They do not share graph memory unless `PI_COGNEE_DATASET` / `config.json` is changed.

### 5.2 Config resolution (`piv`)

Process env wins over files.

**Runtime adapter (what `piv` uses)** — `~/.pi/agent/pi-cognee/config.json` mode 600:

```json
{
  "enabled": true,
  "autoRecall": true,
  "autoRemember": "compaction",
  "captureSession": true,
  "captureTools": false,
  "autoImprove": true,
  "compactionSummaryMode": "auto",
  "baseUrl": "http://127.0.0.1:8211",
  "dataset": "pi-void",
  "topK": 5,
  "recallBudgetMs": 10000,
  "recallMaxChars": 6000,
  "rememberMaxChars": 12000,
  "captureMaxChars": 6000,
  "queueLimit": 64
}
```

Diff vs source defaults (`DEFAULT_PIV_COGNEE_CONFIG`): `captureTools` already off; `captureMaxChars` 6000 not 8000.

**API key order:**

1. process `COGNEE_API_KEY`
2. `~/.pi/agent/pi-cognee/api_key.json` (`base_url: http://127.0.0.1:8211`)
3. `~/.cognee-plugin/api_key.json`
4. merged env including `~/.cognee/.env`

**Shared Claude/Codex env** — `~/.cognee/.env` mode 600:

- `COGNEE_BASE_URL=http://127.0.0.1:8211`
- `COGNEE_RECALL_TIMEOUT=6.0`
- `COGNEE_RECALL_BUDGET=8.0`
- improve cost knobs: `COGNEE_AUTO_IMPROVE_EVERY=300`, `COGNEE_IDLE_THRESHOLD=120`, `COGNEE_IMPROVE_COOLDOWN=900`
- LLM/embed keys present (not recorded)

Those recall timeout/budget keys are **not applied** by Pi Void.

**Server Layer B** — `/home/mewtwo/Zykairotis/cognee/.env` (not read by `piv`):

- LLM: `http://127.0.0.1:20128/v1` → `ag/gemini-3.6-flash-medium`
- Embeddings: Voyage official API, 1024-d
- Vector: LanceDB
- Dataset: `agent_sessions`
- Port: 8211

**Plugin sidecar** — `~/.cognee-plugin/`:

- `config.json`: `base_url` 8211, dataset `agent_sessions`
- `server-ready.json`: stale `stopped - plugins disabled to halt token usage` (API itself was healthy at inventory time)
- `venv-ready.json`: Cognee 1.4.0, python `~/.cognee-plugin/venv/bin/python`

**Blackhole** — `~/.pi/agent/pi-blackhole/pi-blackhole-config.json`:

```json
{
  "compaction": "auto",
  "compactionEngine": "blackhole",
  "midRunCompaction": "resume",
  "tailBehavior": "pi-default",
  "memory": true,
  "compactAfterPercent": 76
}
```

Installed via `~/.pi/agent/settings.json` `packages`:

```text
../../ZSSD/pi-void/packages/coding-agent/examples/extensions/pi-blackhole
```

Native compaction in the same settings file: `{"enabled": false, "thresholdPercent": 75}`.

Cognee Blackhole detection is **file-based** (`isBlackholeCompactionActive` reads that JSON). It does not check whether the extension is loaded this session. Leftover config → Cognee defers (safe if native compact is on). Missing config → Cognee owns (unsafe). This host has the file **and** the package, and native compact is off.

### 5.3 Adapter disk state

`~/.pi/agent/pi-cognee/` (~37M):

| Path | State 2026-08-12 |
|---|---|
| `config.json` / `api_key.json` | live, mode 600 |
| `observations.jsonl` | 7.99 MB / 15,114 lines |
| `sessions/` | 7,504 write-only map files |
| `pending/` | empty |
| `warmup/` | empty |

### 5.4 Env vs config traps

- Process/shell may export `COGNEE_DATASET=agent_sessions` (Zykairotis/Claude). `resolvePivCogneeConfig` uses `PI_COGNEE_DATASET` or `config.json` `dataset`, **not** `COGNEE_DATASET`. Live `piv` stays on `pi-void`.
- Comment in `piv-cognee-env.ts` says `COGNEE_DATASET` can select the Pi dataset. The resolver does not read that key.
- `COGNEE_PLUGIN_DATASET` is intentionally not auto-mapped (stays `agent_sessions` for Claude; Pi default `pi-void`).

---

## 6. Recommended implementation order

Do not start with dead env keys, jsonl rotation, or doctor latency.

1. Keep recall transient (system-prompt append or equivalent; no durable `custom_message`).
2. Change `auto` so Cognee never owns the Pi compact summary. Rewrite `own` to summarize `messagesToSummarize` if the mode stays.
3. Feed the just-written compact summary into the next recall without waiting for Cognee.
4. Wait for in-flight capture before idle improve; stamp cooldown on completion.
5. Set `lastRecallKey` only after successful recall, with TTL; split recall/write circuits if still coupled.
6. Hygiene: env keys, jsonl/warmup/session-map caps, bash exclusion, `rebuildClient` cap, doctor latency.

Constraints:

- stay behind existing Pi hooks
- do not add a competing planner/controller/compaction engine
- do not commit, push, or expand credentials
- preserve unrelated dirty work on `feat/subagents`
- targeted tests + `corepack npm@12.0.2 run check` when implementing

---

## 7. Inventory commands (no secrets)

```bash
curl -sS http://127.0.0.1:8211/health
/home/mewtwo/Zykairotis/cognee/scripts/status.sh
python3 -c 'import json; print(json.load(open("/home/mewtwo/.pi/agent/pi-cognee/config.json")))'
ls -la ~/.pi/agent/pi-cognee ~/.cognee ~/.cognee-plugin /home/mewtwo/Zykairotis/cognee
```

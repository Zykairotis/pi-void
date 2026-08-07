# Pi Void + Cognee Memory

## Status

| Field | Value |
|-------|--------|
| Research | Complete |
| Implementation | **Implemented (slice 1)** |
| Plan revision | 2026-08-07 — phased commits + dedicated branch |
| Live Cognee API | Stopped (`127.0.0.1:8211`); do not assume health |

Decision-complete for **slice 1** (bounded recall + compaction remember + toggles). Later slices (auto-improve, write tools, shared `agent_sessions`) stay roadmap-only.

---

## Goal

Make Cognee a **first-class Pi Void memory subsystem** loaded by `piv`, with runtime toggles for network recall and writes.

| System | Role |
|--------|------|
| **Pi** | Authoritative loop, session JSONL tree, native compaction, overflow recovery |
| **Blackhole** (optional) | Mid-run compact trigger + deterministic summary engine |
| **piv-cognee** | Bounded **derived** memory across sessions — not a second history store |

Success means: better cross-session answers when Cognee is up, **zero hard dependency** when it is down, and **no token spiral** from always-on improve / full-trace ingest.

---

## Branch strategy

### Branch name

```text
void
```

Execution override: work directly on the user-approved `void` customization branch. Keep `main` untouched and do not create or switch to a feature branch.

### Create (do this first, before any implementation commit)

```bash
cd /home/mewtwo/ZSSD/pi-void

# Leave unrelated work alone (Blackhole edits, review branch, etc.)
git status -sb

# The user explicitly approved direct work on the local customization branch.
git switch void

# Confirm clean intent: only Cognee plan + later Cognee commits on this branch
git branch --show-current   # must be void
```

### Rules for this branch

1. **Only Cognee / piv-cognee work** on `void`.
2. **Do not** commit or overwrite pre-existing Blackhole worktree changes
   (`examples/extensions/pi-blackhole/**`, `test/suite/blackhole-compaction.test.ts`) unless they are on a different branch/commit already merged.
3. **Commit after every completed phase** (see below). One logical phase → one commit (or a small intentional pair if tests must land with code).
4. **Do not** `git push` or open a PR unless the user explicitly asks.
5. Commit messages: complete sentences, scoped to the phase. Example subject prefix: `feat(piv-cognee): …`.
6. If the working tree has unrelated dirty files when starting, **stash or leave them** — never fold them into Cognee commits.

### Suggested commit series (summary)

| Commit | After phase | Message (subject) |
|--------|-------------|-------------------|
| C0 | Branch + plan only (optional) | `docs: add piv-cognee memory task plan` |
| C1 | Phase 1 | `feat(piv-cognee): add HTTP client for recall and remember` |
| C2 | Phase 2 | `feat(piv-cognee): add config, queue, redaction, and status helpers` |
| C3 | Phase 3 | `feat(piv-cognee): wire before_agent_start recall and session_compact remember` |
| C4 | Phase 4 | `feat(piv-cognee): add /cognee commands and read-only search tool` |
| C5 | Phase 5 | `feat(piv): load hidden piv-cognee extension` |
| C6 | Phase 6 | `test(piv-cognee): offline unit and extension coverage` |
| C7 | Phase 7 | `docs: document piv Cognee memory boundary` |

Phases 1–4 may be squashed if a phase is too thin to stand alone, but **never** skip tests (C6) before claiming the feature done. Prefer keeping **C5 (wire piv) after** extension logic is testable in isolation.

---

## Current facts

### Pi Void / piv

- `piv.ts` passes **hidden inline extension factories** to `main()`.
- `main()` merges inline factories with built-in and user extensions; inline factories remain available when user extensions are disabled (same pattern as `piv-safe-verify`).
- `before_agent_start` can return a **transient** custom message for the current provider request — it does **not** append a durable session entry by default (correct for untrusted recall).
- `session_compact` fires **after** Pi saves the durable `CompactionEntry` and exposes `compactionEntry.summary`.
- Sessions are append-only JSONL trees; `pi.appendEntry()` can persist extension metadata **without** entering model context.
- Extension factory must register **synchronously**; defer network until hooks/commands/tools.

### Blackhole

- Lives under `packages/coding-agent/examples/extensions/pi-blackhole/` (optional, not first-class `piv` load).
- Owns mid-run trigger + deterministic summary via `session_before_compact`.
- Config default `memory: false`; observational memory workers are **not** implemented in the Pi Void port.
- Cognee must **not** depend on Blackhole. Any saved compaction (native or Blackhole) is a valid remember source.
- Existing Blackhole dirty files on other branches are **out of scope**.

### Cognee (this machine)

| Item | Value |
|------|--------|
| Managed project | `/home/mewtwo/Zykairotis/cognee` |
| API | `http://127.0.0.1:8211` (not 8000/8011) |
| Status at plan time | **Stopped** (token-usage halt; Claude/Codex plugins disabled) |
| Version | 1.4.0 |
| Key cache (Pi ↔ API auth) | `~/.cognee-plugin/api_key.json` |
| Shared plugin env | `~/.cognee/.env` |
| Server process env | `/home/mewtwo/Zykairotis/cognee/.env` (via `scripts/env.sh` / `start-local-api.sh`) |
| User guide | `…/cognee/docs/cognee-user-guide.html` |

### Two config layers (critical — do not conflate)

Pi Void’s extension and Cognee’s extraction/embeddings use **different** credentials.

```text
┌─────────────────────────────────────────────────────────────┐
│ Layer A — piv-cognee (TypeScript, this monorepo)            │
│ Needs ONLY:                                                 │
│   COGNEE_BASE_URL / baseUrl  →  http://127.0.0.1:8211       │
│   COGNEE_API_KEY             →  auth to local Cognee API    │
│ Does NOT need: Voyage, Gemini, 9router, LLM_ENDPOINT        │
└───────────────────────────┬─────────────────────────────────┘
                            │ HTTP recall / remember
                            ▼
┌─────────────────────────────────────────────────────────────┐
│ Layer B — Cognee API process (Python, Zykairotis stack)     │
│ Needs:                                                      │
│   LLM_*  →  9router / local gateway :20128 → Gemini flash   │
│   VOYAGE / EMBEDDING_*  →  Voyage voyage-code-3 embeddings  │
│   DATA/SYSTEM roots, VECTOR_DB, COGNEE_PORT                 │
│ Loaded from Zykairotis .env when the API is started         │
└─────────────────────────────────────────────────────────────┘
```

If Layer B is wrong, Layer A may still connect and then get empty recalls, 5xx, or slow timeouts. Slice-1 code soft-fails; **ops must keep Layer B healthy** for useful memory.

### Layer B — LLM (9router / Gemini flash) and Voyage embeddings

**Server-side only.** Must live in the env used by `start-local-api.sh`. Not hard-coded into Pi Void. Not stored in `~/.pi/agent/pi-cognee/config.json`.

#### Required: use the keys and model from Claude (this machine)

**Do not invent new API keys or pick a different model for Cognee.**

When configuring / reconciling Layer B, **read and reuse** the live values already configured for agents on this host:

| Priority | Source | What to take |
|----------|--------|----------------|
| **1 (preferred)** | `~/.claude/settings.json` → top-level `"env"` | **`LLM_API_KEY`**, **`LLM_MODEL`**, **`LLM_ENDPOINT`**, **`LLM_PROVIDER`**, **`VOYAGE_API_KEY`**, **`EMBEDDING_API_KEY`**, **`EMBEDDING_MODEL`**, **`EMBEDDING_DIMENSIONS`**, **`EMBEDDING_PROVIDER`**, **`EMBEDDING_BATCH_SIZE`**, related `LLM_*` / `COGNEE_*` cost knobs |
| 2 | `~/.codex/config.toml` → `[shell_environment_policy.set]` | Same names if Claude is missing a field (Codex may use `gemini-3.6-flash-low`; **prefer Claude’s medium model** when both exist) |
| 3 | `~/.cognee/.env` | Plugin-shared copy of the same stack |
| Runtime file | `/home/mewtwo/Zykairotis/cognee/.env` | **Write target** for the API process — populate/sync **from** Claude (or Codex) values above; mode `600` |

**Mandatory copy-from-Claude fields for the Cognee server `.env`:**

```text
# Take these FROM ~/.claude/settings.json env (same values — do not rotate unless broken)
LLM_PROVIDER          ← Claude env
LLM_ENDPOINT          ← Claude env  (expect http://127.0.0.1:20128/v1)
LLM_MODEL             ← Claude env  (expect openai/ag/gemini-3.6-flash-medium)
LLM_API_KEY           ← Claude env  (gateway / 9router key)
LLM_INSTRUCTOR_MODE   ← Claude env
LLM_MAX_COMPLETION_TOKENS  ← Claude env (or server 8192 if you want more headroom)
EMBEDDING_PROVIDER    ← Claude env
EMBEDDING_MODEL       ← Claude env  (expect voyage/voyage-code-3)
EMBEDDING_API_KEY     ← Claude env  (Voyage)
EMBEDDING_DIMENSIONS  ← Claude env  (expect 1024)
EMBEDDING_BATCH_SIZE  ← Claude env
VOYAGE_API_KEY        ← Claude env  (same Voyage secret; keep both set for LiteLLM)
```

**Expected shape once taken from Claude (names + shape only; never commit real secrets):**

| Setting | Expected from Claude `env` | Notes |
|---------|----------------------------|--------|
| `LLM_PROVIDER` | `openai` | OpenAI-compatible client → gateway |
| `LLM_ENDPOINT` | `http://127.0.0.1:20128/v1` | **9router / local gateway** — chat only |
| `LLM_MODEL` | `openai/ag/gemini-3.6-flash-medium` | **Use this model from Claude.** Keep `openai/` prefix |
| `LLM_API_KEY` | Claude’s `LLM_API_KEY` | **Use that key**, not a new one |
| `VOYAGE_API_KEY` | Claude’s `VOYAGE_API_KEY` | **Use that key** |
| `EMBEDDING_API_KEY` | Claude’s `EMBEDDING_API_KEY` | Usually same Voyage material; use Claude’s value |
| `EMBEDDING_MODEL` | `voyage/voyage-code-3` | From Claude |
| **Do not set** | `EMBEDDING_ENDPOINT` for `voyage/*` | Breaks routing |

Also on Claude (optional align): `COGNEE_AUTO_IMPROVE_EVERY`, `COGNEE_IDLE_THRESHOLD`, `COGNEE_IMPROVE_COOLDOWN`, `COGNEE_LLM_KEY_CHECK`, `COGNEE_SKIP_CONNECTION_TEST` — server/plugin cost knobs; Pi does not call `improve` in slice 1.

**Layer A auth (Pi → `:8211`) is separate but also already on disk:**

| Source | Use |
|--------|-----|
| Claude `env.COGNEE_API_KEY` | May match the HTTP API key |
| `~/.cognee-plugin/api_key.json` | Preferred cache for clients; mint with `scripts/mint-api-key.sh` if 401 |
| Pi resolution order | `COGNEE_API_KEY` env → `api_key.json` → none |

Do **not** put Voyage/LLM keys into Pi config. Do **use** Claude’s Voyage/LLM keys in the **server** `.env`.

**Implementer / ops checklist:**

1. Open `~/.claude/settings.json` → `"env"`.
2. Copy **`LLM_API_KEY`**, **`LLM_MODEL`** (`openai/ag/gemini-3.6-flash-medium`), **`LLM_ENDPOINT`**, **`VOYAGE_API_KEY`**, **`EMBEDDING_*`** into `/home/mewtwo/Zykairotis/cognee/.env` (and keep `~/.cognee/.env` aligned if plugins run).
3. Keep file mode `600`. Never commit these files or paste secrets into the monorepo / plan / tests.
4. Start API with project scripts so the process inherits Zykairotis `.env` — Claude being open is not required at runtime.
5. Confirm `:20128` is listening (9router) before expecting good remember/extract quality.
6. For `piv`, only Layer A `COGNEE_API_KEY` / `api_key.json` is required.

Embeddings go **direct to Voyage**, not through `:20128`. The gateway is chat-only.

**Security:**

- Never paste real keys into `task_plan.md`, commits, tests, CHANGELOG, or Pi config.
- Never log `LLM_API_KEY`, `VOYAGE_API_KEY`, `EMBEDDING_API_KEY`, or `COGNEE_API_KEY`.
- Pi Void may **read** only `COGNEE_API_KEY` / `api_key.json`; it must **not** require Voyage/LLM keys.
- Docs may say “reuse keys/model from `~/.claude/settings.json` env” without printing values.

#### Not in `~/.pi/agent/pi-cognee/config.json`

```text
LLM_API_KEY, LLM_ENDPOINT, LLM_MODEL
VOYAGE_API_KEY, EMBEDDING_API_KEY, EMBEDDING_MODEL
COGNEE_AUTO_IMPROVE_*, improve cooldowns
```

Pi only toggles whether to call the API and which **dataset** (`pi-void` default).

#### Existing cost knobs (server/plugin — leave alone in slice 1)

```text
COGNEE_AUTO_IMPROVE_EVERY=300
COGNEE_IDLE_THRESHOLD=120
COGNEE_IMPROVE_COOLDOWN=900
COGNEE_LLM_KEY_CHECK=off
LLM_MAX_COMPLETION_TOKENS=4096|8192
EMBEDDING_BATCH_SIZE=16
```

Pi does **not** call `improve` in slice 1. Compaction-remember still costs Voyage + LLM **on the server** when Cognee processes the write — keep `rememberMaxChars` tight.

### HTTP contracts (installed client behavior)

| Operation | Method | Notes |
|-----------|--------|--------|
| Recall | `POST /api/v1/recall` | JSON body; API key header |
| Remember | `POST /api/v1/remember` | **Multipart** form (`datasetName`, `node_set`, `run_in_background`, `data` file) |
| Health | `GET /health` | Optional for status |

Do **not** call `cognee-cli`, `improve`, or `cognify` from the Pi extension in slice 1.

Known ops risks (handle as soft-fail): service down, 401 if key stale, gateway `:20128` down (remember/cognify quality), bad Voyage key (embeddings), historical graph schema noise (`source_run_refs`), recall latency ~seconds if graph scopes are used — hence **hard budgets**.

---

## Design decisions (locked for slice 1)

### Ownership diagram

```text
piv
 |
 +-- Pi agent loop, provider routing, session JSONL, native compaction
 |
 +-- hidden piv-cognee extension  (always loaded by piv only)
       |
       +-- bounded recall → transient before_agent_start inject
       +-- selected compaction summaries → queue → remember
       +-- /cognee commands + read-only cognee_search tool
       +-- local config, pending queue, circuit breaker, redacted metadata
 |
 +-- (optional) user-loaded Blackhole extension
       +-- compact/resume only — not Cognee network policy
```

### Hard rules

1. **`piv-cognee` is always loaded by `piv`**; not an optional package install. Runtime **toggles** control network, not load.
2. **`pi` (stock CLI) unchanged** — no Cognee wiring.
3. Cognee **never** replaces Pi history, compaction, or context construction.
4. Blackhole remains independently loadable; Cognee consumes **any** saved compaction summary.
5. Toggles affect **network behavior**, not command registration or help text.
6. Default dataset is **`pi-void`** — not `agent_sessions` — so Hermes/Claude/Codex noise does not mix in unless the user **explicitly** sets `PI_COGNEE_DATASET` / config.
7. No LLM-callable **write** tool in slice 1 (untrusted model → durable memory). Read-only search tool only when enabled.
8. No automatic `improve` / full-trace ingest (cost control; matches why Claude/Codex plugins were disabled).

### Configuration

**Path:** `~/.pi/agent/pi-cognee/config.json`
(or under `PI_CODING_AGENT_DIR` if set)

Create dir mode `0700`, file mode `0600`, **atomic writes**.

```text
enabled            boolean, default true
autoRecall         boolean, default true
autoRemember       "off" | "compaction", default "compaction"
baseUrl            string, default http://127.0.0.1:8211
dataset            string, default pi-void
topK               integer 1..10, default 5
recallBudgetMs     integer, default 1500
recallMaxChars     integer, default 6000
rememberMaxChars   integer, default 12000
queueLimit         integer, default 64
```

**Env overrides (validated):**

```text
PI_COGNEE_ENABLED
PI_COGNEE_RECALL
PI_COGNEE_REMEMBER
PI_COGNEE_BASE_URL
PI_COGNEE_DATASET
```

**Compatibility inputs (existing stack):**

```text
COGNEE_BASE_URL
COGNEE_API_KEY
```

Do **not** auto-inherit `COGNEE_PLUGIN_DATASET` / Claude-Codex `agent_sessions`.

**API key resolution order:**

1. `COGNEE_API_KEY`
2. Endpoint-matched `~/.cognee-plugin/api_key.json` (if present and usable)
3. No key → treat as auth missing on first network op

**Never** write the key into Pi config, session entries, queue files, logs, notifications, fixtures, or error strings.

### Recall

On `before_agent_start`, when `enabled && autoRecall`:

1. Query = raw expanded user prompt.
2. `POST /api/v1/recall` JSON, e.g.:

```json
{
  "query": "...",
  "top_k": 5,
  "only_context": true,
  "scope": ["graph"],
  "session_id": "<pi session id>",
  "datasets": ["pi-void"]
}
```

3. One request per prompt; whole-request deadline (`recallBudgetMs`); response size cap; per-session circuit breaker.
4. Empty array = authoritative no-hit (success).
5. Format capped text inside clear **untrusted-data** delimiters; return as **hidden** `before_agent_start` custom message. Do **not** use `pi.sendMessage()` / `appendCustomMessageEntry()` for automatic recall.
6. Soft-fail: unavailable, 401, slow, malformed, disabled → no block; redacted status only. Notify for manual `/cognee` ops, not every automatic miss.

Recall is **untrusted**: must not override system instructions, modes, permissions, or the current user request.

### Remember

Automatic writes **only** on completed compaction:

- Hook: `session_compact` (after durable entry exists), **not** `turn_end`.
- Require `enabled && autoRemember === "compaction"`.
- Payload: `event.compactionEntry.summary` + minimal metadata (dataset, session id, reason/engine, timestamp).
- Node set: `agent_actions`.
- Redact secrets; enforce `rememberMaxChars`.
- **No** raw tool dumps, full transcripts, thinking blocks, `.env`, credentials.
- Ignore Blackhole’s config `memory` flag for network policy; `piv-cognee` owns toggles.

Explicit `/cognee remember` may store under `user_context` | `project_docs` | `agent_actions`. **No** `forget` in slice 1.

### Durable queue

- Path: `~/.pi/agent/pi-cognee/pending/` (`0700` / files `0600`).
- Fields: content hash, operation id, dataset, node set, created time, state — **no credentials**.
- `queueLimit`: when full, keep existing items + warn; do not silent-drop.
- Drain **bounded** pending on `session_start` in background; factory starts **no** timers/network.
- Remember: multipart + `run_in_background=true`.
- Remove only after confirmed **2xx**. Timeout/reset → state `uncertain` (no blind replay). Explicit `/cognee flush uncertain` to retry.
- Classification: 401/403 `auth_failed`, 5xx `server_error`, refused/DNS `unreachable`, timeout `uncertain`, malformed 2xx body still success for remember if accepted.
- Metadata only via `pi.appendEntry("piv-cognee", …)`.

### User controls

```text
/cognee status
/cognee on | off
/cognee recall on | off
/cognee remember on | off
/cognee search <query>
/cognee remember [user_context|project_docs|agent_actions] <text>
/cognee flush [pending|uncertain]
```

`status`: toggles, endpoint, dataset, queue counts, breaker, last **redacted** error — never credentials.

### Files to create / touch (target tree)

```text
packages/coding-agent/src/piv-cognee-client.ts     # HTTP client
packages/coding-agent/src/piv-cognee.ts             # extension factory + hooks
packages/coding-agent/src/piv.ts                    # wire hidden factory
packages/coding-agent/test/piv-cognee.test.ts       # offline tests
packages/coding-agent/test/piv-safe-verify.test.ts  # only if launcher smoke needs update
idea.md
packages/coding-agent/docs/compaction.md
packages/coding-agent/CHANGELOG.md
task_plan.md                                        # this file (progress updates)
```

Optional later (not slice 1 unless needed): split helpers under `src/piv-cognee/` if the single file exceeds maintainability.

**Do not modify for this feature:**

- `packages/coding-agent/examples/extensions/pi-blackhole/**` (unless a pure docs cross-link is approved later)
- Stock `src/cli.ts` / non-`piv` entrypoints
- Live Cognee Python project under `Zykairotis/cognee` (ops only, outside this PR)

---

## Phases (implement → verify → commit)

Work **only** on `void`. After each phase: targeted tests for that phase when they exist, then commit.

### Phase 0 — Branch and plan baseline

**Do:**

1. Confirm the working branch is the user-approved `void` customization branch; do not switch to a feature branch.
2. Ensure this `task_plan.md` is the source of truth on the branch.
3. Confirm dirty Blackhole (or other) files are **not** staged.

**Commit C0 (optional but recommended if plan is not on the branch yet):**

```text
docs: add piv-cognee memory task plan

Capture the first-class piv Cognee memory design, phase gates,
and direct `void` branch workflow.
```

**Gate:** `git branch --show-current` is `void`; plan present.

---

### Phase 1 — HTTP client (no extension wiring)

**Files:** `packages/coding-agent/src/piv-cognee-client.ts` (+ co-located unit tests if preferred; full suite may land in Phase 6).

**Implement:**

- Native Node 22 APIs only: `fetch`, `AbortSignal.timeout`, `FormData`, `Blob`, `crypto`, `URL`.
- Types: `CogneeConfig` (client-facing), `RecallResult`, `RememberRequest`, classified `CogneeError`.
- `recall()`: JSON, dataset list, caps, empty-array success, deadline.
- `remember()`: multipart matching installed Cognee client; `run_in_background=true`.
- API-key header; never embed key in thrown messages.
- Transport/status classification; **no** hidden retries.
- DI for `fetch` + clock so tests need no real service.

**Do not:** import Python plugins, add npm deps for Cognee, call improve/cognify.

**Verify:**

```bash
cd packages/coding-agent
# If Phase-1-only tests exist:
node ../../node_modules/vitest/dist/cli.js --run test/piv-cognee.test.ts -t client
# Or typecheck path later via npm run check at Phase 7/end
```

**Commit C1:**

```text
feat(piv-cognee): add HTTP client for recall and remember

Introduce a fetch-based Cognee client with deadlines, response
caps, multipart remember, and injectable transport for offline tests.
```

---

### Phase 2 — Config, queue, redaction, status helpers

**Files:** primarily `packages/coding-agent/src/piv-cognee.ts` (helpers can be internal functions or small modules).

**Implement:**

- Load/validate config + env overrides; atomic save with `0600`.
- Key resolution (env → api_key.json → none) without persisting secrets.
- Pending queue under `~/.pi/agent/pi-cognee/pending/` (in tests: temp dir via DI or env override if added — prefer injectable paths for tests).
- Content hash IDs; states: `pending` | `uncertain` | terminal outcomes as needed.
- Secret redaction pass + char caps.
- Circuit breaker state machine (open after N failures; half-open trial).
- Status snapshot builder (no credentials).

**Verify:** unit tests for config defaults, invalid env, queue full, redaction — if not yet in repo, write them now or with Phase 6; do not leave untestable pure logic.

**Commit C2:**

```text
feat(piv-cognee): add config, durable queue, and redaction helpers

Add atomic config I/O, secret-safe key resolution, pending remember
queue with uncertain-write handling, and status reporting helpers.
```

---

### Phase 3 — Extension hooks (recall + compact remember)

**Files:** `packages/coding-agent/src/piv-cognee.ts`

**Implement factory registration (still not wired into piv if delayed to Phase 5 — either is fine as long as C3 is self-contained):**

| Event | Behavior |
|-------|----------|
| `session_start` | Background drain of **bounded** pending items; no factory-time network |
| `before_agent_start` | Soft-fail recall inject when enabled |
| `session_compact` | Queue redacted summary when autoRemember is compaction |
| `session_shutdown` | Idempotent cleanup; no dangling work assumptions |

Rules:

- Register handlers **synchronously** in the factory.
- Transient hidden recall message only.
- Session metadata: non-secret operation notes via `appendEntry("piv-cognee", …)` when useful.
- Soft-fail all automatic network paths.

**Verify:** extension fixture tests (Phase 6 if deferred).

**Commit C3:**

```text
feat(piv-cognee): wire recall inject and compaction remember hooks

Use before_agent_start for bounded untrusted recall and
session_compact for queued background remember of summaries.
```

---

### Phase 4 — Commands and read-only search tool

**Implement:**

- `/cognee` parser for all forms listed under User controls.
- Runtime toggles persist to config file immediately (atomic).
- Manual search/remember surface actionable errors.
- `cognee_search` tool via TypeBox + `registerTool`; only active when extension enabled (and preferably when autoRecall or an explicit “tools enabled” path matches product intent — **default: tool available when `enabled`**).
- `setActiveTools()` must not clobber unrelated tools.

**No** write tool for the model.

**Commit C4:**

```text
feat(piv-cognee): add /cognee commands and read-only search tool

Expose runtime toggles, manual search/remember, queue flush, and a
read-only cognee_search tool without model-driven durable writes.
```

---

### Phase 5 — Wire into `piv`

**Files:** `packages/coding-agent/src/piv.ts` (+ minimal test touch if needed)

**Implement:**

```ts
{ name: "piv-cognee", factory: pivCogneeExtension, hidden: true, priority: "before-user" }
```

Beside existing `piv-safe-verify` (or same inline list).

**Preserve:**

- Stock `cli.ts` / `pi` entry.
- `--no-extensions` semantics already used for application-owned inline factories.
- No Blackhole load/modify.

**Commit C5:**

```text
feat(piv): load hidden piv-cognee extension

Always register piv-cognee for the piv launcher so memory is
available without a user package install; stock pi stays unchanged.
```

---

### Phase 6 — Offline regression suite

**Files:** `packages/coding-agent/test/piv-cognee.test.ts`
Optional: `test/piv-safe-verify.test.ts` launcher smoke only.

**Minimum coverage:**

- Defaults + invalid config/env.
- Recall request shape, dataset, key header, caps, empty results.
- Auth / server / unreachable / timeout / malformed / breaker.
- Remember multipart shape, background flag, redaction, no key persistence.
- Uncertain writes not auto-replayed.
- `before_agent_start` injects hidden recall without durable session message.
- Disabled recall → zero HTTP.
- `session_compact` queues once; session metadata non-secret only.
- Compaction details without Blackhole loaded still work.
- Commands toggle state; manual ops surface errors.
- Queue drain bounds; no silent drop of concurrent items under limit policy.

**Rules:** fake `fetch` only; no live API, no paid models, no `cognee-cli`.

**Verify:**

```bash
cd /home/mewtwo/ZSSD/pi-void/packages/coding-agent
node ../../node_modules/vitest/dist/cli.js --run test/piv-cognee.test.ts
# if launcher assertion added:
node ../../node_modules/vitest/dist/cli.js --run test/piv-safe-verify.test.ts
```

**Commit C6:**

```text
test(piv-cognee): add offline client and extension coverage

Cover recall/remember contracts, queue uncertainty, toggles, and
hook soft-fail behavior without a live Cognee service.
```

---

### Phase 7 — Docs + changelog

**Files:**

- `idea.md` — first-class `piv` Cognee; toggles; Pi-owned history; `pi-void` dataset isolation; compaction-only auto writes; future improve = roadmap.
- `packages/coding-agent/docs/compaction.md` — compaction still full Pi history; Cognee gets **derived** summaries after save.
- `packages/coding-agent/CHANGELOG.md` — Unreleased **Added** only.

Update this `task_plan.md` status to **Implemented (slice 1)** when done.

**Verify:**

```bash
cd /home/mewtwo/ZSSD/pi-void
npm run check
```

Do **not** run full `npm test` or `npm run build` unless requested.

**Commit C7:**

```text
docs: document piv Cognee memory boundary

Describe first-class toggles, dataset isolation, compaction-linked
remember, and the non-replacement of Pi session history.
```

---

## Phase 8 — Live smoke (not a code commit unless fixes required)

**Only when the user starts Cognee on purpose.**

**Preflight Layer B (server), then Layer A (Pi):**

```bash
# 1) LLM gateway (9router) must be up for extraction quality
ss -ltnp | grep 20128 || echo "WARN: :20128 not listening"

# 2) Server .env must have LLM_* + VOYAGE/EMBEDDING_* (do not cat secrets into logs)
test -f /home/mewtwo/Zykairotis/cognee/.env && echo "server .env present"

# 3) Start Cognee API (inherits Zykairotis .env via scripts)
/home/mewtwo/Zykairotis/cognee/scripts/start-local-api.sh
/home/mewtwo/Zykairotis/cognee/scripts/status.sh
# mint COGNEE_API_KEY if 401:
# /home/mewtwo/Zykairotis/cognee/scripts/mint-api-key.sh
```

If server `.env` is missing LLM/Voyage: **copy the actual API keys and model from `~/.claude/settings.json` → `env`** (`LLM_API_KEY`, `LLM_MODEL=openai/ag/gemini-3.6-flash-medium`, `LLM_ENDPOINT`, `VOYAGE_API_KEY`, `EMBEDDING_*`) into `/home/mewtwo/Zykairotis/cognee/.env` (mode `600`, never commit). Fall back to Codex toml only if Claude lacks a field. Do not invent new keys/models. Do not expect `piv` to read Claude settings at runtime.

Manual checklist (unique non-secret marker, dataset **`pi-void`** only):

1. `/cognee status` → `127.0.0.1:8211`, no key printed (Layer A).
2. `/cognee remember user_context <marker>` succeeds or queues (server uses Voyage + LLM).
3. `/cognee search <marker>` finds it with dataset isolation.
4. Native `/compact` or Blackhole compact → one queued remember item.
5. Stop API → agent still usable; pending item retained; no crash.
6. `/cognee off` → no network on subsequent prompts.
7. Optional negative: stop `:20128` only — server remember may degrade; Pi must soft-fail/queue, not hang.

**If smoke finds bugs:** fix on `void` with a focused commit:

```text
fix(piv-cognee): <short symptom>
```

Do not claim live pass without observed output.

---

## Verification (definition of done for slice 1)

### Offline (required)

```bash
cd /home/mewtwo/ZSSD/pi-void/packages/coding-agent
node ../../node_modules/vitest/dist/cli.js --run test/piv-cognee.test.ts
cd /home/mewtwo/ZSSD/pi-void
npm run check
```

### Live (optional, post-ops)

See Phase 8.

### Acceptance criteria

- [ ] `piv` loads Cognee without a user extension install; `pi` unchanged.
- [ ] Toggles work without restart; disabled mode makes **no** network requests.
- [ ] Auto recall is bounded, dataset-scoped (`pi-void` default), transient, untrusted, soft-failing.
- [ ] Auto writes are redacted, capped, compaction-summary-only, background/queued.
- [ ] Pi session + compaction entries remain history source of truth.
- [ ] API keys never enter source, config, session metadata, queue, logs, or tests.
- [ ] Uncertain writes are not blindly replayed.
- [ ] Offline tests + `npm run check` pass with no unresolved diagnostics.
- [ ] Blackhole worktree / extension code left intact.
- [ ] All work landed on **`void`** with phase commits C1–C7 (C0 optional).

---

## Out of scope (explicit non-goals for this branch)

| Item | Why |
|------|-----|
| Embedding Cognee in Blackhole `memory: true` | Different product; Blackhole stays compact-only |
| Auto-improve / cognify from Pi | Cost; Jul 31 disable reason |
| Full tool-trace session capture | Cost + noise |
| Model-callable `cognee_remember` tool | Untrusted durable writes |
| Default dataset `agent_sessions` | Isolation from Claude/Codex/Hermes |
| Destructive forget | Defer until policy is clear |
| Changing stock `pi` CLI | Product boundary |
| Starting/stopping Cognee systemd/service in monorepo | Ops outside package |
| Fixing Ladybug `source_run_refs` graph bug | Cognee server issue |
| Re-enabling Claude/Codex Cognee plugins | Separate decision |

---

## Roadmap (after slice 1 merges)

1. Optional per-project dataset from cwd/repo name.
2. Opt-in `autoRemember: "session_end"` with hard cooldowns (still no full traces).
3. Opt-in `improve` with same cooldowns as `~/.cognee/.env`.
4. Shared `agent_sessions` mode for cross-tool memory (explicit only).
5. Statusline / footer widget for breaker + queue depth.
6. Visualize integration via existing Zykairotis graph scripts.

---

## Progress log

| Date | Note |
|------|------|
| 2026-08-07 | Plan expanded: direct `void` branch execution, phases 0–8, commit gates C0–C7, ops context, acceptance checklist. Implementation not started. |
| 2026-08-07 | Documented two-layer config: Layer A (Pi needs only COGNEE API key/URL) vs Layer B (server needs 9router `:20128` Gemini flash + Voyage embeddings). |
| 2026-08-07 | Explicit ops rule: **use API keys + model from `~/.claude/settings.json` env** (LLM_API_KEY, openai/ag/gemini-3.6-flash-medium, Voyage keys) when filling Zykairotis Cognee `.env` — do not invent new credentials. |
| 2026-08-07 | Phase 1 complete on `void`: native fetch client and offline recall/remember contract tests pass; `npm run check` is clean. |
| 2026-08-07 | Phase 2 complete on `void`: validated config, secret-safe key resolution, redaction, bounded queue, and circuit helpers pass offline tests; `npm run check` is clean. |
| 2026-08-07 | Phase 3 complete on `void`: transient recall and post-save compaction queue hooks pass with soft-fail fake transport and secret-safe metadata. |
| 2026-08-07 | Phase 4 complete on `void`: `/cognee` toggles, manual search/remember/flush/status, and read-only `cognee_search` pass offline tests without clobbering active tools. |
| 2026-08-07 | Phase 5 complete on `void`: `piv` loads hidden `piv-cognee` beside `piv-safe-verify`; stock `pi` remains unchanged. |
| 2026-08-07 | Phase 6 complete on `void`: 12 offline client/extension tests cover disabled recall, uncertain writes, queueing, toggles, hooks, and read-only search; `npm run check` is clean. |
| 2026-08-07 | Phase 7 complete on `void`: `idea.md`, compaction boundaries, and the coding-agent Unreleased changelog document shipped Slice 1 without claiming deferred improve or shared-memory features. |
| 2026-08-07 | Phase 8 live smoke verified: synchronized Layer A key auth, `/cognee status`, remember queue recovery, dataset-scoped remember/search, and `/cognee off` passed; local API stopped afterward. Default 1.5s recall timed out against a 3.8s graph query, while stored `recallBudgetMs: 10000` passed. |
| 2026-08-07 | Phase 9 complete: `/cognee watch` loopback dashboard, SSE lifecycle stream, redacted ingest inspector, session/agent identity, shutdown cleanup, and pre-model animated recall status pass `23/23`, `npm run check`, build, and compiled browser smoke. |

---

## Phase 9 — Realtime Cognee observer + prompt activity feedback

**Goal:** Add a local realtime observer for Cognee request lifecycle and redacted ingest previews, plus visible activity during pre-model Cognee recall.

**Design:**

- Append bounded redacted observation events under the existing `~/.pi/agent/pi-cognee/` storage boundary.
- Serve a dependency-free local HTML dashboard from `/cognee watch` over loopback with SSE updates.
- Display agent/session IDs, dataset, request phase, status, latency, queue depth, errors, and capped ingest previews.
- Set the existing Pi extension status immediately during `before_agent_start`; do not block or replace Pi's model loop.

**Acceptance:**

- `/cognee watch` prints a local URL and the dashboard updates without refresh.
- Prompt, recall, remember, trace, improve, queue, and failure events appear with redacted previews.
- Prompt submission shows an animated Cognee activity status before Pi's model working indicator.
- Observer is local-only and never logs API keys or uncapped payloads.
- Focused tests, `npm run check`, coding-agent build, and browser smoke pass.

**Errors encountered:**

| Error | Resolution |
|-------|------------|
| Inline dashboard JavaScript was invalid because the TypeScript template string consumed the quote escape in the HTML escape helper. | Replaced the quote lookup with a character-code branch; compiled browser smoke then passed. |

---

## Phase 10 — Bounded oversized recall envelope

**Goal:** Accept valid Cognee recall envelopes that contain large metadata/context wrappers without weakening the prompt injection cap.

- Live response measured at `73,683` bytes with HTTP `200`; the old `12,000` limit rejected it before normalization.
- Recall transport now allows up to `128 KiB`, normalizes only requested top-K results, and retains the configured `recallMaxChars` output cap.
- Regression, `npm run check`, build, and compiled live recall pass.

---

## Executor checklist (copy when implementing)

```text
[ ] On branch void
[ ] No Blackhole/unrelated files staged
[x] C1 client
[x] C2 config/queue/redaction
[x] C3 hooks
[x] C4 commands + search tool
[x] C5 piv wire-up
[x] C6 offline tests green
[x] C7 docs + changelog
[x] npm run check green
[x] Live smoke verified; API stopped after the intentional test
[x] Phase 9 observer + activity feedback
[x] Phase 10 bounded recall envelope
[ ] Do not push / PR unless asked
```

# Research Findings

## Initial State
- Pi Void branch: `review/guarded-build-qodo`.
- Existing worktree changes: `packages/coding-agent/examples/extensions/pi-blackhole/src/om/compaction-trigger.ts` and `packages/coding-agent/test/suite/blackhole-compaction.test.ts`; do not overwrite.
- No existing root planning files.
- Pi Void direction: preserve Pi's loop/session/compaction ownership; extensions and adapters own policy and optional services.
- `idea.md` says Blackhole is optional today, memory is opt-in, and Cognee is not implemented.
- User requirement changes target direction: Cognee should be first-class but runtime-toggleable.

## Pi Extension Findings
- `before_agent_start` can inject a persistent custom message into the LLM context; it receives the user prompt and current session context.
- `session_before_compact` can cancel or provide a custom compaction; `session_compact` fires after the `CompactionEntry` is saved and exposes `event.compactionEntry`, `fromExtension`, `reason`, and `willRetry`.
- `agent_end` may be followed by retry/compaction/follow-up; `agent_settled` is the safe event for work that must wait until Pi will not continue automatically.
- `turn_end` exposes the assistant message and tool results but is a high-frequency, cost-sensitive capture point.
- `pi.appendEntry()` persists extension metadata without adding it to model context; `pi.sendMessage()` persists content and sends it to the model.
- `ctx.signal` is available in active turn hooks for abort-aware network requests; session events may not have a signal.
- Extensions must defer background resources until `session_start` or use, and clean them up in idempotent `session_shutdown`.
- Registered tools can be kept inactive with `pi.setActiveTools()`; this supports toggleable or lazy Cognee tools without removing the extension.
- Extension errors continue the agent; memory integration should additionally soft-fail and expose status so failures are observable.

## Blackhole Findings
- Blackhole is currently an example/package extension, not loaded by `piv` by default.
- Its custom summary runs in `session_before_compact`; its trigger runs at `turn_end` after tool results and calls `ctx.compact()`.
- It keeps the active Pi session/history owner unchanged and does not create a second loop or store.
- Current Blackhole config supports `auto|manual|off`, engine selection, mid-run `resume|pause|off`, percentage/absolute thresholds, tail behavior, and `memory` (currently only persisted; memory workers are not implemented).
- Current code marks Blackhole summary details as `{ engine: "blackhole", memory: false }`.
- Native Pi Void mid-run compaction conflicts are detected; Blackhole yields to native mid-run mode. Native `compaction.enabled` remains useful as overflow fallback.
- Current worktree modifications are in the trigger and suite test; they must remain untouched unless explicitly part of a later implementation.

## Cognee Findings
- Local managed stack: HTTP API at `http://127.0.0.1:8211`, authenticated with `X-Api-Key`, dataset-scoped, API currently stopped.
- Relevant data-plane operations: `POST /api/v1/remember` and `POST /api/v1/recall`; existing scripts use background remember/cognify to avoid blocking the caller.
- Existing local plugin uses bounded recall timeout/budget, a circuit breaker, pending files, dataset/node-set scoping, and background sync/improve. These patterns address known latency and cost failures.
- Existing stack uses dataset hard isolation (`agent_sessions` today) and node sets such as `user_context`, `project_docs`, and `agent_actions`.
- Existing smoke test confirms Cognee 1.4 Python API uses `remember(..., dataset_name=...)` and `recall(..., datasets=[...])`; API behavior still needs a live or installed-source contract check before implementation.
- Existing configuration contains LLM gateway and Voyage embedding settings; secrets were not read.
- Existing plugin changelog documents prior cost/latency failures from full trace ingestion and improve; Pi Void should not reproduce that hot path.

## Pi Void Loading Findings
- `piv.ts` already supplies a private extension-factory seam to Pi startup for `piv-safe-verify`; this is the likely first-class loading point for Pi Void memory.
- Normal Pi extensions remain separately discoverable and trust-gated. Cognee should be loaded by `piv` without bypassing project trust for project-local resources.
- `pi-blackhole` is currently packaged as an example extension and is not part of the default `piv` factory list according to repository references; the plan must decide whether first-class Cognee is paired with first-class Blackhole loading or only interoperates when Blackhole is loaded.
- `pi.appendEntry()` is appropriate for durable queue/status metadata that should not enter model context; session files are append-only JSONL and already survive compaction.

## Finalized Research Findings
- `before_agent_start` injection is transient for the provider request: `agent-session.ts` adds returned custom messages to the current prompt; it does not call `sendMessage()` or append a `custom_message` session entry. Use it for recall to avoid transcript duplication.
- `session_compact` fires after Pi saves the durable `CompactionEntry`; use `event.compactionEntry.summary` as the post-compaction memory source.
- `pi.sendMessage()` and `appendCustomMessageEntry()` would persist content and are wrong for automatic recall. `pi.appendEntry()` is correct for non-context operation state.
- Node 22 supplies native `fetch`, `FormData`, `Blob`, and `AbortSignal.timeout`; no Cognee npm/Python dependency is needed.
- Cognee recall JSON: `query`, `top_k`, `only_context: true`, `scope`, optional `session_id`, and explicit `datasets: [dataset]`; a successful `[]` is authoritative and must not be treated as a transport failure.
- Cognee remember multipart fields: `datasetName`, `node_set`, `run_in_background`, and a `data` file part. A 2xx response is accepted even if its body is not JSON; timeout is not safe for blind replay because the write may have landed.
- Credential precedence should be `COGNEE_API_KEY` then the existing endpoint-matched `~/.cognee-plugin/api_key.json`; the key must never enter config, logs, session entries, or tests.
- Current managed Cognee is on `127.0.0.1:8211`, but the service is stopped; live authenticated contract verification remains an implementation-time smoke check, not a research result.

## Decision Constraints
- First-class means `piv` always loads the hidden `piv-cognee` inline extension, including alongside `--no-extensions`, while network work remains controlled by runtime toggles.
- Default dataset is Pi Void-owned `pi-void`; do not inherit shared `agent_sessions` or `COGNEE_PLUGIN_DATASET` unless the user explicitly configures a shared dataset.
- Default automatic write source is completed compaction summaries only; no every-tool-call trace ingestion and no automatic `improve`/`cognify` hot path.
- Automatic recall is bounded, prompt-scoped, and soft-failing; manual search/remember commands surface actionable errors.
- Existing Blackhole extension files remain independent and untouched. Cognee listens to any saved compaction, including Blackhole and native Pi compactions.

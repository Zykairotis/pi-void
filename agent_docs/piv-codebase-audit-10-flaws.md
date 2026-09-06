# Pi Void Codebase Audit — 10 Flaws

Read-only audit of the Pi Void monorepo (`packages/coding-agent/src`). Each flaw was
verified against current file content at the stated line numbers. No source files were
modified by this audit; the working tree was already dirty at session start (pre-existing
branch `feat/subagents` work).

Severity scale: **CRITICAL / HIGH / MEDIUM / LOW**.

---

## 1. Completion-message delivery is lost when the parent is busy — HIGH (correctness/data loss)

**File:** `packages/coding-agent/src/piv-subagents.ts:6137-6165`

```ts
const deliverCompletion = (jobId: string): void => {
  if (shuttingDown || parentBusy || !jobs) return;
  ...
  pi.sendMessage({ customType: JOB_COMPLETION_MESSAGE_TYPE, ... }, { triggerTurn: false });
};
const queueCompletion = (jobId: string): void => {
  if (shuttingDown || !jobs) return;
  if (parentBusy) pendingCompletionIds.add(jobId);
  else deliverCompletion(jobId);
};
```

When the parent agent is mid-turn (`parentBusy`), `queueCompletion` defers the job
completion to `pendingCompletionIds` (line 6105). The drain happens only in
`agent_settled`/`session_shutdown` (`drainCompletionNotifications`). If the process exits
mid-turn or the session never settles, the completion message is dropped entirely, while
the durable job snapshot (a `custom` entry) persists.

**Impact:** lost background-job completion notifications; the user never sees the result
ref in the inbox. On restart, the job is re-notified with a stale/missing message.

**Why it matters:** the async job scheduler's only user-facing completion channel is
fire-and-forget; a crash mid-turn silently swallows completions.

---

## 2. `custom` job snapshots and `custom_message` completion entries are never reconciled — HIGH (correctness)

**Files:** `packages/coding-agent/src/piv-subagents.ts:7218-7229`, `piv-subagent-observatory.ts:307`

- Job snapshots are persisted via `pi.appendEntry(JOB_ENTRY_TYPE, snapshot)` (line 7229),
  which creates `type: "custom"` entries (`session-manager.ts:1079` `appendCustomEntry`).
- The restore path filters `entry.type !== "custom_message"` (line 7218).
- `projectSubagentCompletionInbox` (piv-subagent-observatory.ts:307) also only matches
  `custom_message`.

The two entry kinds are never bridged. A job completed while the parent was busy produces
no `custom_message` entry at all (see #1), so the inbox is empty and `deliveredJobIds`
dedupe is ineffective — the job gets re-notified on every restart.

**Impact:** duplicated or missing completion notifications; the `/agents` observatory
"COMPLETION INBOX" never reflects jobs that completed during a busy parent.

---

## 3. `enqueuePendingRemember` leaks `.tmp` files and the queue limit is bypassable — MEDIUM (resource)

**File:** `packages/coding-agent/src/piv-cognee.ts:389-404`

```ts
const files = await readdir(directory);
const filename = `${record.operationId}.json`;
if (files.includes(filename)) return true;
if (files.filter((file) => file.endsWith(".json")).length >= limit) return false;  // 399
const target = join(directory, filename);
const temporary = `${target}.${randomUUID()}.tmp`;                                  // 401
await writeFile(temporary, `${JSON.stringify(record)}\n`, { mode: 0o600 });         // 402
await chmod(temporary, 0o600);                                                      // 403
await rename(temporary, target);                                                    // 404
```

If `rename` throws (cross-device, permission, disk full), the `.tmp` file is orphaned.
The limit check at line 399 counts only `*.json`, so `.tmp` files are invisible to both
the limit and `readPendingRemember` (which reads only `*.json`). Under repeated failures,
`.tmp` files accumulate unbounded in `~/.pi/agent/pi-cognee/pending/`.

**Impact:** unbounded disk growth; queue-limit enforcement is unreliable; the same
`write-then-rename` pattern appears at lines 445-448 and 492-495.

---

## 4. `runImprove` stamps `lastImproveAt` before the request completes — MEDIUM (correctness)

**File:** `packages/coding-agent/src/piv-cognee.ts:892-911`

```ts
const now = options.now?.() ?? Date.now();
if (reason === "idle" && now - runtime.lastImproveAt < IDLE_IMPROVE_COOLDOWN_MS) return undefined; // 895
runtime.lastImproveAt = now;   // 896 — stamped BEFORE the fetch resolves
```

The 5-minute idle cooldown is stamped at dispatch, not completion. If `/improve` takes
>5 min or fails immediately, subsequent `agent_settled` improves are suppressed for the
full cooldown even though no improve actually ran.

The manual `/cognee improve` path (lines ~1322-1327) sets `lastImproveAt = 0` to force,
then stamps only on success — on error it stays 0, permanently defeating the cooldown.

**Impact:** idle improve starved or never suppressed depending on request duration;
cooldown enforced on intent rather than outcome.

---

## 5. `cogneeSessionId` collisions across long host-session IDs — LOW/MEDIUM (correctness)

**File:** `packages/coding-agent/src/piv-cognee.ts:167-172`

```ts
export function cogneeSessionId(hostSessionId: string): string {
  const cleaned = hostSessionId.trim().replace(/[^A-Za-z0-9._-]+/g, "_").slice(0, 120);  // 170
  return cleaned.startsWith("piv_") ? cleaned : `piv_${cleaned || "session"}`;
}
```

Two host session IDs sharing the first 120 sanitized characters map to the same Cognee
session ID. `ensureSessionId` (lines ~716-735) then writes both to the same session-map
JSON file, and both register the same agent session with Cognee.

**Impact:** cross-session memory contamination; recall/improve scope mixes two sessions'
memory. The truncation bound is not collision-resistant (no hash suffix).

---

## 6. `delegate_async` captures a stale `modelRuntime` for the whole job lifetime — MEDIUM (correctness)

**File:** `packages/coding-agent/src/piv-subagents.ts:6827-6848`

```ts
const modelRuntime = ctx.modelRegistry.getRuntime();  // 6827 — captured once at launch
const accepted = registry.launch({
  ...
  run: async (jobSignal) => {
    const runAttempt = (...) =>
      runner.runResolved(childRequest, activeTools, {
        model, modelRuntime,           // 6842 — stale runtime for queued/delayed jobs
        ...
      });
```

The runtime object is captured at acceptance time and used for every attempt, even if the
job sits queued for a long time. If the model runtime is recreated (provider reload,
model switch) while a job waits, the job uses the stale runtime for a model that may no
longer be valid.

**Impact:** background jobs fail with model/auth errors or use an outdated provider after
a runtime change; no re-resolution at execution time.

---

## 7. `runVerifier` misclassifies aborts as failures and can hang — MEDIUM (reliability)

**File:** `packages/coding-agent/src/piv-safe-verify.ts:466-546` (`execVerifier`), `528-605` (`runVerifier`)

On abort, `execVerifier`'s `terminate()` sends SIGTERM and arms a SIGKILL timer
(terminationGraceMs=5000). The child's `close` event resolves with `code ?? 1` and
`killed: true`. But `runVerifier` never reads `killed` — an aborted verifier reports
`status: "failed"` instead of `"cancelled"`/`"timed-out"`.

If the child ignores SIGTERM and the SIGKILL `signalProcessTree` throws synchronously
(e.g., pid already zombie), `close` may never fire and `runVerifier` awaits forever — the
`timeout` only aborts the controller signal, not the wait on `execVerifier`.

**Impact:** verifier runs can hang indefinitely on stubborn child processes; timeouts
misclassified as generic failures, corrupting the `piv-verify` status shown to the user.

---

## 8. `projectResult` discards a completed result when `requestedStop` is set — MEDIUM (correctness)

**File:** `packages/coding-agent/src/piv-subagent-jobs.ts:456-464`

```ts
function projectResult(jobId, requestedStop, runResult, runtimeError) {
  const result = runResult?.result;
  let status: TerminalSubagentJobStatus;
  if (requestedStop) status = requestedStop;   // 464 — unconditionally prefers requestedStop
  else if (!result) status = "failed";
  ...
```

When a running job is cancelled (`cancel()` at 671-675 → `abort()` + `await live.promise`),
but the child actually completed before the abort took effect, `start()`'s
`settle(live, runResult)` still passes the completed `runResult` — yet `projectResult`
unconditionally prefers `requestedStop`, recording "cancelled"/"interrupted" and
discarding the successful `runResult` (and its evidence/usage). `settle`'s
`if (live.settled) return` guard (line 853) prevents the completed result from ever being
recorded.

**Impact:** completed work mislabeled as cancelled; evidence and usage lost. The same
`if (requestedStop)` override applies to `interrupted` (shutdown path, lines 778-788).

---

## 9. `runResolvedSubagentBatch` double-releases the budget reservation on retry — MEDIUM (accounting)

**File:** `packages/coding-agent/src/piv-subagents.ts:4800-4807`

```ts
beforeAttempt: (attempt) => attempt === 1 || budget.reserve(reservation),          // 4800
afterAttempt: (_attempt, result) =>
  budget.reconcile(reservation, result.observedOutputBytes),                        // 4802
...
.then((result) => {
  if (options.unsafeHostExec) budget.reconcile(reservation, result.observedOutputBytes); // 4807
```

For non-`unsafeHostExec` batches, `runSubagentWithRecovery` reconciles the reservation
via `afterAttempt` (line 4802) after attempt 1, then `beforeAttempt` re-reserves for
attempt 2 (line 4800). When attempt 2 completes, `afterAttempt` reconciles **again** —
net: the reservation is released twice while charged once, inflating `released` and
under-counting `consumed`. `reconcile` subtracts `reservation` from `reserved` even for
attempt 1 which never reserved (attempt 1 passes `beforeAttempt` without reserving),
compounding the drift.

**Impact:** budget accounting drift on retry; `reserved` can go negative (masked by
`Math.max(0, ...)` in `SubagentBatchBudgetLedger.reconcile`), enabling false budget
decisions and inaccurate `delegate_batch` budget reporting.

---

## 10. `session_shutdown` can block up to 120 s awaiting `/improve` and then spin in `waitForBackground` — MEDIUM (hang)

**File:** `packages/coding-agent/src/piv-cognee.ts:1791-1798`, `piv-cognee-client.ts:296-317`

```ts
// session_shutdown handler
await waitForBackground();                                    // 1793
if (client && sessionId && runtime.config.enabled && runtime.config.autoImprove) {
  await runImprove("shutdown");                               // 1795 — awaits improve
}
await waitForBackground();                                    // 1797 — loops on background set
```

`client.improve()` uses `options.timeoutMs ?? 120_000` (piv-cognee-client.ts:316) — a
120-second default. `runImprove("shutdown")` is awaited synchronously inside
`session_shutdown`, so a slow or unreachable Cognee server blocks session teardown for up
to 120 s. After that, `waitForBackground` (piv-cognee.ts:664-667) loops while
`runtime.background.size > 0 || pendingDrain`; the improve work was added to
`runtime.background` via `trackBackground`, so if it hasn't settled the loop spins.

The `drainPending` guard `if (runtime.shuttingDown) return` (piv-cognee.ts:1034) means
any previously-queued `pendingDrain` never drains, and if it was still set when shutdown
started, `waitForBackground` spins on it too.

**Impact:** session shutdown (quit/reload/new/resume/fork) can hang for minutes on a slow
Cognee endpoint; background work is never drained.

---

## Summary

| # | Flaw | Severity | Category |
|---|---|---|---|
| 1 | Completion message lost when parent busy | HIGH | correctness/data loss |
| 2 | `custom` vs `custom_message` entry mismatch | HIGH | correctness |
| 3 | `.tmp` file leak in pending-remember queue | MEDIUM | resource |
| 4 | `lastImproveAt` stamped pre-completion | MEDIUM | correctness |
| 5 | `cogneeSessionId` collision on long IDs | LOW/MED | correctness |
| 6 | `delegate_async` stale `modelRuntime` | MEDIUM | correctness |
| 7 | Verifier abort misclassified / can hang | MEDIUM | reliability |
| 8 | Completed result discarded on cancel race | MEDIUM | correctness |
| 9 | Batch budget double-release on retry | MEDIUM | accounting |
| 10 | Shutdown blocks on slow `/improve` | MEDIUM | hang/resource |

All line numbers verified against current file content on 2026-08-12. Read-only audit;
no source files modified.

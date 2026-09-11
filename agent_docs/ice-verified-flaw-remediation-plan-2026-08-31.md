# Ice-Void Verified Flaw Remediation Plan

**Date:** 2026-08-31  
**Repository:** `/home/mewtwo/ZSSD/ice`
**Branch observed during audit:** `feat/subagents`  
**Status:** implementation plan only; production fixes are not applied by this document  
**Primary scope:** defects reproduced/verified against the live working tree on 2026-08-31

---

## 0. Source-of-truth warning

This document is the implementation source of truth for the **2026-08-31 verification pass**.

Do **not** blindly implement the older untracked file:

- `agent_docs/ice-codebase-audit-10-flaws.md`

That file contains an older/different issue set and stale line numbers. Several of its claims no longer describe the live implementation. The current working tree is also heavily dirty, so implementation must be done with narrow patches and must not overwrite unrelated work.

The issue numbering used in this plan refers to the ten claims evaluated in the 2026-08-31 audit:

1. busy-parent completion notifications permanently lost
2. `custom` snapshot vs `custom_message` Observatory mismatch
3. exact edit blocked by fuzzy occurrence counting
4. Cognee atomic-write `.tmp` leaks
5. leading `./` find glob becomes malformed
6. pre-handshake requests execute/respond out of order
7. Cognee idle improve cooldown is stamped incorrectly
8. batch output budget is double-released on retry
9. verifier abort/timeout is misclassified
10. completed subagent result can be hidden by a stop/cancel race

### Verified disposition

| # | Claim | 2026-08-31 disposition | Action |
|---|---|---|---|
| 1 | Busy-parent completion is permanently lost | **Rejected / stale** | Do not change the recovery architecture |
| 2 | `custom` vs `custom_message` are disconnected | **Rejected / intentional architecture** | Do not merge the entry types |
| 3 | Exact edit can be rejected by fuzzy duplicate counting | **Confirmed** | **Fix** |
| 4 | Cognee atomic writes can leave `.tmp` files | **Confirmed** | **Fix** |
| 5 | `./foo/bar` find glob becomes `**/./foo/bar` | **Confirmed** | **Fix** |
| 6 | Pre-handshake out-of-order response is a protocol bug | **Rejected / current concurrency contract** | Do not serialize requests |
| 7 | Idle improve cooldown behavior after failure is wrong | **Behavior real; policy/design decision** | Optional hardening after explicit semantics are chosen |
| 8 | Retry double-releases batch output budget | **Rejected; accounting is balanced and tested** | Do not rewrite budget lifecycle |
| 9 | Verifier aborts are generic failures | **Rejected / already fixed** | Preserve current timeout/cancel classification |
| 10 | Stop/cancel can override an already returned verified completion | **Confirmed** | **Fix** |

**Required production fixes:** #3, #4, #5, #10.  
**Optional policy cleanup:** #7.  
**Explicit non-fixes:** #1, #2, #6, #8, #9.

No issue in this verified set currently justifies a HIGH-severity label. The confirmed issues are correctness/reliability defects, primarily MEDIUM, with the Cognee temp-file issue ranging LOW-MEDIUM to MEDIUM depending on runtime conditions.

---

# 1. Global implementation constraints

Before touching code, preserve these invariants.

## 1.1 Dirty-tree safety

The repository already contains substantial in-progress work. The implementation agent must:

1. run `git status --short` and record the baseline;
2. inspect the exact diff of every file before editing it;
3. patch only the functions/tests named in this plan unless a directly required helper is introduced;
4. never reset, checkout, stash, or rewrite unrelated changes;
5. never regenerate lockfiles unless dependency changes are intentionally required — they are not required by this plan;
6. after each workstream, inspect the scoped diff before moving on.

## 1.2 Behavioral invariants

The fixes must not weaken any Ice-Void safety property:

- edit operations remain uniqueness-checked and fail closed on ambiguous targets;
- fuzzy edit matching remains a fallback, never a reason to supersede a unique exact match;
- Cognee pending records remain private (`0600`) and their directories remain private (`0700`);
- Cognee queue bounds remain enforced for durable `*.json` records;
- `find` retains existing basename, path-glob, absolute-path, `**/`, gitignore, hidden-file, cancellation, and result-limit behavior;
- subagent cancellation remains effective for queued/running jobs that actually return cancelled/non-completed outcomes;
- verified completion evidence is promoted only when verification is actually successful;
- durable terminal persistence must still happen before completion notification;
- job retention/tombstones, scheduler slot release, aggregate-output accounting, and owner scoping must remain unchanged;
- no new provider/network dependency is introduced.

## 1.3 Test discipline

For every confirmed bug:

1. first add or capture a deterministic test that fails on the current implementation;
2. apply the smallest behaviorally complete fix;
3. run that regression test;
4. run the containing test file;
5. run cross-cutting Ice-Void tests affected by the change;
6. only then run repository-wide checks.

Do not treat unrelated pre-existing test failures as regressions caused by these fixes. During the audit, a broader run already showed unrelated assertions expecting active tools `[delegate, read]` while the live tool policy can also expose `manage_subagent`. Record the pre-fix baseline before declaring new failures.

---

# 2. Workstream A — Fix #3: exact edit must win over fuzzy equivalence

## 2.1 Current code

**File:** `packages/coding-agent/src/core/tools/edit-diff.ts`

Relevant live functions:

- `fuzzyFindText()` around lines 206-244
- `countOccurrences()` around lines 251-255
- `applyEditsToNormalizedContent()` around lines 304-366

Current matching already *starts* correctly:

```ts
const exactIndex = content.indexOf(oldText);
if (exactIndex !== -1) {
  return {
    found: true,
    index: exactIndex,
    matchLength: oldText.length,
    usedFuzzyMatch: false,
    contentForReplacement: content,
  };
}
```

The defect is the later uniqueness check:

```ts
function countOccurrences(content: string, oldText: string): number {
  const fuzzyContent = normalizeForFuzzyMatch(content);
  const fuzzyOldText = normalizeForFuzzyMatch(oldText);
  return fuzzyContent.split(fuzzyOldText).length - 1;
}
```

`applyEditsToNormalizedContent()` can therefore find a unique **exact** target and then reject it because `countOccurrences()` converts Unicode punctuation/whitespace variants into the same fuzzy representation.

### Reproduced failure

A file containing both:

- exact ASCII text: `"hi"`
- fuzzy-equivalent curly-quoted text: `“hi”`

with an edit targeting only the literal ASCII `"hi"` currently throws an error equivalent to:

> Found 2 occurrences of the text ... The text must be unique.

That is incorrect. There is exactly one literal target.

## 2.2 Required matching contract

Implement this precedence exactly:

1. normalize line endings in `oldText` as today;
2. search/count **exact occurrences in the LF-normalized original content**;
3. if exact count is `1`, select that exact occurrence and do **not** allow fuzzy-equivalent text elsewhere to make it ambiguous;
4. if exact count is `>1`, reject as ambiguous — do not use fuzzy matching to choose between exact duplicates;
5. only when exact count is `0`, search in fuzzy-normalized space;
6. if fuzzy count is `1`, select the fuzzy match;
7. if fuzzy count is `>1`, reject as ambiguous;
8. if fuzzy count is `0`, return the existing not-found error.

The core invariant is:

> **Fuzzy normalization is fallback matching, not a second uniqueness criterion for a successful exact match.**

## 2.3 Recommended implementation shape

Do not merely change the error string. Fix match resolution itself.

Recommended helper shape:

```ts
type MatchMode = "exact" | "fuzzy";

interface UniqueEditMatch {
  mode: MatchMode;
  index: number;
  matchLength: number;
}
```

Introduce an exact occurrence counter that does not normalize punctuation/spacing:

```ts
function countExactOccurrences(content: string, oldText: string): number {
  // count non-overlapping literal occurrences
}
```

Keep a separate fuzzy counter or make the existing counter explicit:

```ts
function countFuzzyOccurrences(content: string, oldText: string): number {
  const fuzzyContent = normalizeForFuzzyMatch(content);
  const fuzzyOldText = normalizeForFuzzyMatch(oldText);
  // count non-overlapping normalized occurrences
}
```

Then resolve uniqueness in the same matching mode that selected the target.

### Important mixed-edit caveat

`applyEditsToNormalizedContent()` currently sets:

```ts
const usedFuzzyMatch = initialMatches.some((match) => match.usedFuzzyMatch);
const replacementBaseContent = usedFuzzyMatch
  ? normalizeForFuzzyMatch(normalizedContent)
  : normalizedContent;
```

If **any** edit requires fuzzy matching, all replacements are subsequently evaluated in normalized replacement space. Therefore a batch containing:

- one exact edit, and
- one unrelated fuzzy edit

can still expose the exact edit to normalized-space ambiguity or retargeting.

The implementation must not stop after making the single-edit reproduction pass. Add a mixed exact/fuzzy regression. If the current global-normalized replacement-base design causes the exact edit to move to the wrong normalized occurrence, refactor match planning so each edit retains its selected matching mode/identity.

Acceptable approaches include:

- pre-resolving every edit into a stable match descriptor before replacement;
- introducing a safe mapping from exact original-space offsets to normalized replacement space;
- or restructuring replacement application so exact and fuzzy matches retain their originally resolved identities while still preserving unchanged line bytes.

Do **not** choose a solution that lets a fuzzy-equivalent occurrence steal an exact edit merely because a different edit in the same batch needed fuzzy matching.

## 2.4 Preserve existing byte-preservation behavior

The code intentionally uses `applyReplacementsPreservingUnchangedLines()` when fuzzy matching is needed. Preserve these properties:

- unaffected line blocks keep original bytes;
- fuzzy normalization must not rewrite unrelated file regions;
- overlapping edits still fail;
- replacements are still applied in a stable order;
- BOM/line-ending behavior stays unchanged.

## 2.5 Regression tests

Prefer a new focused regression file, for example:

`packages/coding-agent/test/suite/regressions/ice-edit-exact-before-fuzzy.test.ts`

Minimum cases:

1. **ASCII quote exact target vs curly quote equivalent**
   - content has `"hi"` and `“hi”`;
   - target `"hi"`;
   - only ASCII occurrence changes.

2. **Curly quote exact target vs ASCII equivalent**
   - target is the literal curly version;
   - exact curly occurrence wins.

3. **Hyphen/dash equivalence**
   - exact `foo-bar` plus fuzzy-equivalent `foo—bar`;
   - exact target remains unique.

4. **Whitespace equivalence**
   - one literal spacing form plus another form collapsed by `normalizeForFuzzyMatch()`;
   - exact target remains unique.

5. **Two literal exact duplicates**
   - still throws duplicate error.

6. **No exact match, one fuzzy match**
   - fuzzy fallback still succeeds.

7. **No exact match, multiple fuzzy matches**
   - still throws duplicate error.

8. **Mixed batch: exact edit + separate fuzzy edit**
   - exact edit modifies the exact original target;
   - fuzzy edit modifies its own target;
   - no retargeting to fuzzy-equivalent text.

9. **Mixed batch with overlap**
   - existing overlap rejection remains intact.

10. **No-change replacement**
    - existing no-change error remains intact.

## 2.6 Acceptance criteria

This workstream is complete only when:

- the direct reproduction succeeds;
- exact duplicates still reject;
- fuzzy fallback still works;
- fuzzy duplicates still reject;
- mixed exact/fuzzy batches target the intended occurrences;
- existing edit tests remain green;
- no unrelated line normalization appears in generated output.

---

# 3. Workstream B — Fix #4: Cognee atomic-write temp cleanup

## 3.1 Current code

**File:** `packages/coding-agent/src/ice-cognee.ts`

Confirmed write-then-rename sites currently include:

- `enqueuePendingRemember()` around lines 427-443
- `updatePendingRememberState()` around lines 474-487
- `saveIceCogneeConfig()` around lines 510-534
- session-map write inside `ensureSessionId()` around lines 813-835

Representative current pattern:

```ts
const temporary = `${target}.${randomUUID()}.tmp`;
await writeFile(temporary, body, { mode: 0o600 });
await chmod(temporary, 0o600);
await rename(temporary, target);
```

There is no `finally` cleanup. If an ordinary runtime failure happens after temp creation and before successful rename, the temporary path can survive.

### Correction to the old report

Do not justify this fix using `EXDEV` as the primary scenario: temp and target are created in the same directory, so a cross-device rename is not the realistic failure mode.

Realistic leak paths are:

- process interruption between write and rename;
- permission changes;
- filesystem/I/O errors;
- rename failure;
- a later operation throwing after temp creation.

A `finally` block fixes ordinary exceptions. It cannot run after `SIGKILL`/power loss, so optional stale-temp cleanup is still useful for crash leftovers.

## 3.2 Required atomic-write helper

Prefer one local helper in `ice-cognee.ts` rather than four copy-pasted `try/finally` blocks.

Example design:

```ts
async function writePrivateFileAtomically(target: string, body: string): Promise<void> {
  const temporary = `${target}.${randomUUID()}.tmp`;
  let renamed = false;
  try {
    await writeFile(temporary, body, { mode: 0o600 });
    await chmod(temporary, 0o600);
    await rename(temporary, target);
    renamed = true;
  } finally {
    if (!renamed) {
      try {
        await unlink(temporary);
      } catch (error) {
        if (!isEnoent(error)) throw error;
      }
    }
  }
}
```

The exact helper name is flexible, but semantics are not.

### Error precedence

Do not hide the primary write/rename failure with a secondary cleanup failure.

Preferred behavior:

- propagate the original operation error;
- cleanup is best-effort after a primary failure;
- an `ENOENT` cleanup result is always harmless;
- if cleanup fails for another reason, record/observe it where the calling path already supports diagnostics, but do not replace the primary exception.

If implementing this cleanly requires a small `safeUnlink()` helper, do so.

## 3.3 Apply the helper consistently

Use the shared helper for all same-file atomic JSON writes listed above unless a site has a documented reason not to.

Preserve:

- `0600` file mode;
- `0700` parent directory mode where currently enforced;
- same-directory rename atomicity;
- existing JSON formatting/newline behavior;
- current best-effort semantics of the session-map path.

For `ensureSessionId()`, the surrounding catch intentionally makes the session map best-effort. The helper should clean its temp file before the outer catch swallows the error.

## 3.4 Stale crash-temp cleanup

A `finally` block cannot clean files left by a hard process kill. Add a bounded, conservative stale-temp cleanup policy for the Cognee pending directory.

Recommended policy:

1. recognize only temp names generated by Ice-Void's own pending-record pattern, e.g. `*.json.<uuid>.tmp`;
2. never delete durable `*.json` queue records;
3. do not delete a fresh temp file that another concurrent operation could still own;
4. delete only temp files older than a conservative age threshold (for example 30-60 minutes) unless the runtime guarantees there is only one writer;
5. cap cleanup work per invocation so a pathological directory cannot turn enqueue into an unbounded scan;
6. ignore `ENOENT` races.

If introducing timestamp/stat-based cleanup is disproportionately invasive, the **required fix** is still `try/finally` cleanup for ordinary failures. Stale crash cleanup can be a follow-up, but the plan should document whether it was implemented.

## 3.5 Queue-limit semantics

The logical queue limit should continue to count durable pending `*.json` records, not transient in-flight temp files.

Do not “fix” this by counting every directory entry as a pending record; that could make one stale temp permanently block all future enqueues.

Instead:

- keep durable queue accounting on `*.json`;
- clean temp files defensively;
- optionally expose a diagnostic if stale temp accumulation is observed.

## 3.6 Regression/fault tests

Extend `packages/coding-agent/test/ice-cognee.test.ts`.

Current useful baseline test:

- `bounds pending remember records without silently exceeding the queue limit`

Add cases for:

1. successful enqueue leaves exactly one durable `.json` and no `.tmp`;
2. duplicate operation ID remains idempotent;
3. queue-limit rejection creates no temp file;
4. injected write failure leaves no temp file if temp creation occurred;
5. injected chmod failure leaves no temp file;
6. injected rename failure leaves no temp file;
7. `updatePendingRememberState()` failure cleans temp;
8. `saveIceCogneeConfig()` failure cleans temp;
9. session-map best-effort failure cleans temp while preserving best-effort return behavior;
10. stale-temp cleanup removes only eligible old Ice-Void temp files and never durable JSON records, if stale cleanup is implemented.

Use controlled filesystem mocks/fault injection rather than relying on OS-specific permission behavior where possible.

## 3.7 Acceptance criteria

- ordinary exceptions after temp creation do not leave temp files;
- successful atomic writes retain current file permissions/content;
- queue limit still works;
- crash-temp cleanup, if implemented, cannot delete durable queue data;
- Cognee tests stay deterministic on Linux CI;
- no new dependency is introduced.

---

# 4. Workstream C — Fix #5: normalize leading `./` in `find` patterns

## 4.1 Current code

**File:** `packages/coding-agent/src/core/tools/find.ts`

Current live logic around lines 249-259:

```ts
let effectivePattern = pattern;
if (pattern.includes("/")) {
  args.push("--full-path");
  if (!pattern.startsWith("/") && !pattern.startsWith("**/") && pattern !== "**") {
    effectivePattern = `**/${pattern}`;
  }
}
args.push("--", effectivePattern, searchPath);
```

For:

```text
./packages/coding-agent/src/index.ts
```

this becomes:

```text
**/./packages/coding-agent/src/index.ts
```

With current `fd` behavior, that malformed glob returns no match, while:

```text
**/packages/coding-agent/src/index.ts
```

matches correctly.

## 4.2 Required normalization

Normalize syntactic current-directory prefixes **before** deciding whether to add `--full-path` and `**/`.

Recommended helper:

```ts
function normalizeRelativeFindPattern(pattern: string): string {
  let normalized = pattern;
  while (normalized.startsWith("./")) normalized = normalized.slice(2);
  return normalized || "**";
}
```

Then use `normalizedPattern` consistently for:

- slash detection;
- absolute-path detection;
- `**/` detection;
- the final fd argument.

Do not modify:

- absolute paths beginning `/`;
- parent-relative patterns beginning `../`;
- ordinary dotfiles such as `.env`;
- wildcard semantics inside later path segments.

If Windows paths are supported by this tool through a separate path layer, do not opportunistically rewrite backslash semantics in this patch. Keep scope to the reproduced POSIX `./` failure unless tests show a shared normalization helper is appropriate.

## 4.3 Regression tests

Extend:

`packages/coding-agent/test/suite/regressions/3302-find-path-glob.test.ts`

That file already covers the earlier path-glob bug and is the correct regression home.

Add at least:

1. `./some/parent/child/file.ext` matches exactly;
2. `./some/parent/child/*` matches children;
3. `./src/**/*.spec.ts` matches the nested spec;
4. `./**/parent/child/*` works without producing `**/./**/...`;
5. repeated syntactic prefixes such as `././src/**/*.spec.ts` either normalize consistently or are explicitly rejected — choose and test one behavior;
6. basename pattern `*.spec.ts` is unchanged;
7. `src/**/*.spec.ts` remains unchanged;
8. `**/parent/child/*` remains unchanged;
9. absolute path behavior remains unchanged;
10. `.env` is not treated as a `./` prefix.

## 4.4 Acceptance criteria

- the direct `./...` reproduction returns the expected file;
- existing #3302 regression cases stay green;
- `fd` still receives `--full-path` exactly when intended;
- no duplicated `**/` prefix is introduced;
- result paths/output formatting remain unchanged.

---

# 5. Workstream D — Fix #10: verified completion must not be hidden by a stop race

## 5.1 Current code

**File:** `packages/coding-agent/src/ice-subagent-jobs.ts`

Relevant live code:

- `projectResult()` around lines 550-607
- `cancel()` around lines 824-843
- `cancelSubset()` around lines 845-872
- launch/start/settle path elsewhere in the same class

Current terminal precedence begins with:

```ts
const result = runResult?.result;
let status: TerminalSubagentJobStatus;
if (requestedStop) status = requestedStop;
else if (!result) status = "failed";
else if (result.status === "completed")
  status = runResult.verification.verified ? "completed" : "verification_failed";
```

This means a stop request unconditionally wins even if the runner subsequently provides a valid verified `completed` result.

`trustedCompletion` is then tied to the projected status:

```ts
const trustedCompletion =
  status === "completed" &&
  result?.status === "completed" &&
  runResult?.verification.verified === true;
```

So when `requestedStop` wins:

- terminal job status becomes `cancelled`/`interrupted`;
- successful summary can remain;
- verification can remain `verified: true`;
- token usage is currently preserved;
- trusted `evidence.paths` and findings are suppressed;
- the resulting durable envelope can become internally contradictory: `cancelled` + verified successful result summary.

### Deterministic reproduced race

The audit reproduced this sequence:

1. launch a running job backed by a deferred promise;
2. resolve the runner promise with `status: "completed"` and `verification.verified: true`;
3. synchronously call `registry.cancel(jobId)` before the registry's `await` continuation commits the completion;
4. `requestedStop = "cancelled"` is observed by `projectResult()`;
5. final durable status is `cancelled` and trusted evidence disappears.

The old claim that **usage is lost** is inaccurate in the live tree: `cloneUsage(result?.usage)` is still projected. The real defect is terminal semantics plus evidence/findings suppression and contradictory status.

## 5.2 Required semantic decision

For Ice-Void, adopt this explicit rule:

> `cancel`, `cancelSubset`, and shutdown interruption are **stop requests**. If the runner returns a structurally valid, verified `completed` result, that completed result is authoritative. A stop request wins only when the runner does not produce a trusted completion.

This is the simplest deterministic contract and prevents completed work from being discarded merely because cancellation raced with settlement.

Consequences:

- a worker that actually honors abort should return `cancelled`/non-completed, so cancellation still wins normally;
- a queued job cancelled before execution still becomes cancelled;
- a `needs_time` job stopped before a trusted completion remains stopped;
- a worker that ignores a late abort and successfully completes/validates can finish as `completed`;
- shutdown is best-effort interruption, not permission to rewrite a verified completion as interrupted after the fact.

If maintainers want **cancel-always-wins even when verified completion arrives**, then the data model must preserve late verified evidence separately. Do not keep the current contradictory `cancelled + verified + no evidence` state. The recommended policy for this remediation is **verified completion wins**.

## 5.3 Minimal implementation

Change terminal precedence inside `projectResult()` so trusted completion is determined before `requestedStop`:

```ts
const result = runResult?.result;
const verifiedCompletion =
  result?.status === "completed" && runResult?.verification.verified === true;

let status: TerminalSubagentJobStatus;
if (verifiedCompletion) status = "completed";
else if (requestedStop) status = requestedStop;
else if (!result) status = "failed";
...
```

Then derive `trustedCompletion` from the same predicate/status so the implementation cannot drift:

```ts
const trustedCompletion = status === "completed" && verifiedCompletion;
```

Do not duplicate subtly different completion conditions in multiple places.

## 5.4 Do not weaken cancellation

The fix must preserve these existing paths:

### Queued cancellation

A queued job that has not started has no completed run result. `requestedStop` must still settle it as cancelled without invoking the runner.

### Running job that honors abort

If the abort listener resolves with:

```ts
result.status = "cancelled"
verification.verified = false
```

final status remains `cancelled`.

### Timeout

A runner-returned `timed_out` result remains `timed_out` unless a stronger existing policy already maps an explicit stop request. Do not alter timeout taxonomy as part of this fix.

### Verification failure

If a runner says `completed` but verification is false, it is **not** a trusted completion. Without a stop request it should remain `verification_failed`. With a stop request, use the chosen stop precedence consistently and test it.

Recommended behavior with a stop request: stop status may win because there is no trusted completion. Document this in the test name.

## 5.5 Deterministic race tests

Extend `packages/coding-agent/test/ice-subagent-jobs.test.ts`.

The file already has helpers `completedRun()`, `deferredRun()`, `flush()`, queue/cancel tests, shutdown tests, and concurrent cancellation tests.

Add the exact missing matrix:

1. **runner resolves verified completion, then cancel is called before registry continuation commits**
   - final status `completed`;
   - evidence retained;
   - findings retained if supplied;
   - usage retained;
   - verification remains true;
   - exactly one terminal snapshot;
   - exactly one completion notification after persistence.

2. **cancel is requested while runner is pending and runner honors abort with cancelled result**
   - final status `cancelled`;
   - no trusted completion evidence promoted.

3. **cancel queued job**
   - remains cancelled;
   - runner never called.

4. **cancelSubset race with one completed and one genuinely cancelled job**
   - completed member remains completed;
   - aborted member becomes cancelled;
   - scheduler slots release exactly once.

5. **concurrent duplicate cancel calls racing a verified completion**
   - no double settlement;
   - no double notification;
   - no double scheduler pump/release;
   - terminal result remains completed under the chosen policy.

6. **shutdown race with verified completion**
   - verified completion wins;
   - shutdown still waits for worker settlement;
   - no active controller remains.

7. **shutdown where worker honors abort**
   - existing interrupted behavior remains.

8. **completed but verification false + late cancel**
   - assert the explicitly chosen status and no trusted evidence.

9. **persistence failure after race**
   - existing fail-closed persistence behavior remains;
   - notification does not happen before durable terminal persistence.

10. **retention/tombstone path**
    - a completion that won a cancellation race still produces a normal completed tombstone when later evicted.

## 5.6 Optional diagnostic

A low-risk observability enhancement is to record a bounded diagnostic when a stop request raced with a verified completion and completion won, e.g.:

```text
job_stop_raced_completion
```

Only add this if it does not break result-contract consumers. It is not required for the correctness fix.

## 5.7 Acceptance criteria

- the reproduced microtask race ends `completed` with trusted evidence;
- normal active cancellation still ends cancelled when the worker returns cancelled;
- queued cancellation remains unchanged;
- shutdown interruption remains correct when abort takes effect;
- persistence still precedes notification;
- no duplicate terminal persistence or notification;
- usage/accounting/scheduler slot release remain balanced;
- no contradictory `cancelled` + verified-success envelope remains for this race.

---

# 6. Optional Workstream E — #7 Cognee idle-improve cooldown semantics

## 6.1 What the current code actually does

**File:** `packages/coding-agent/src/ice-cognee.ts`, `runImprove()` around lines 996-1023.

The old statement “`lastImproveAt` is stamped before the request completes” is stale.

Current code stamps it in `finally`:

```ts
.finally(() => {
  runtime.improveInFlight = false;
  runtime.lastImproveAt = options.now?.() ?? Date.now();
});
```

Therefore:

- it is **not** stamped at dispatch;
- it is stamped after success **or failure**;
- a failed idle improve therefore triggers the same 5-minute idle cooldown as a successful improve.

That behavior is real, but whether it is wrong is a product policy question.

## 6.2 Recommended policy

Do not change this in the same patch as the four confirmed bugs unless the desired retry behavior is explicit.

Preferred design if improving it:

- rename/split the state so intent is unambiguous;
- keep `lastImproveAttemptAt` for anti-hammering/backoff;
- add `lastImproveSuccessAt` if UI/logic needs successful-improve recency;
- use a shorter or exponential retry backoff after failures rather than immediately retrying every `agent_settled` event;
- retain `improveInFlight` as the concurrent-request guard.

Example semantics:

```text
success: normal 5-minute idle cooldown
failure: bounded retry backoff (e.g. 15s -> 30s -> 60s -> cap)
manual improve: bypass idle cooldown, but still respect in-flight protection
```

This is safer than changing failure behavior to “no cooldown at all,” which could hammer an unavailable Cognee endpoint after every settle event.

## 6.3 Tests if implemented

- success starts normal idle cooldown;
- immediate failure uses failure backoff, not success recency;
- repeated failures do not hammer;
- a later success resets failure backoff;
- manual improve bypasses idle cooldown but does not create concurrent improves;
- deterministic fake clock verifies boundaries exactly.

## 6.4 Decision gate

This workstream is **non-blocking** for the confirmed bugfix release. If no explicit retry policy is chosen, leave current behavior unchanged and optionally rename/document the field later.

---

# 7. Explicit non-fixes — do not regress working behavior

These claims were investigated and rejected against the current live tree. The implementation agent should not spend time “fixing” them unless new evidence is produced.

## 7.1 #1 Busy-parent completion notification is not permanently lost

**File:** `packages/coding-agent/src/ice-subagents.ts`

Current architecture:

- if parent is busy, `queueCompletion()` stores the job ID in `pendingCompletionIds`;
- `agent_settled` drains pending notifications;
- durable job snapshots are persisted independently;
- on session start, `SubagentJobRegistry.restore()` restores owner-scoped snapshots;
- terminal jobs without a previously persisted completion message are returned for re-notification;
- previously delivered completion IDs are reconstructed from persisted `custom_message` completion entries.

Thus an in-memory pending ID can disappear on process death, but the terminal job itself remains recoverable and is re-notified when the owner session is restored.

Relevant passing regression from audit:

`ice-subagents.test.ts` — `restores owner-scoped jobs and delivers only undelivered completion metadata`

Do not replace this with a second completion storage mechanism unless there is a new demonstrated loss case.

## 7.2 #2 `custom` snapshots and `custom_message` completions are intentionally different

Architecture:

- `ice.appendEntry(JOB_ENTRY_TYPE, snapshot)` -> durable `type: "custom"` authoritative job state;
- `ice.sendMessage(..., { triggerTurn: false })` -> runtime message that is persisted through `appendCustomMessageEntry()` as `type: "custom_message"`;
- `projectSubagentCompletionInbox()` reads the completion-message projection;
- restore reads authoritative job snapshots and re-notifies terminal jobs that lack delivered message IDs.

Do not merge the two types. They represent **state** vs **delivery/inbox projection**.

## 7.3 #6 Do not serialize pre-handshake requests

**File:** `packages/server/src/server.ts`

Pre-handshake messages attach to the handshake promise and may complete out of request order after the handshake. That matches the current server concurrency contract.

Passing conformance test from audit:

`can respond out of request order after the handshake`

Serializing only messages received before handshake while leaving ready-state requests concurrent would create inconsistent semantics. Only change this with a protocol specification change.

## 7.4 #8 Batch output budget is not double-released

Current retry lifecycle is balanced:

```text
reserve attempt 1
reconcile attempt 1
reserve attempt 2 (if admitted)
reconcile attempt 2
```

Passing audit regression:

`admits a retry only after reconciling the first attempt`

A companion test also verifies that retry is suppressed when the second reservation cannot be made.

Do not remove either reservation/reconciliation hook based on the rejected report.

## 7.5 #9 Verifier timeout/cancel classification is already handled

**File:** `packages/coding-agent/src/ice-safe-verify.ts`

Current `runVerifier()` checks timeout/cancel state before generic nonzero exit handling and emits explicit timeout/cancel statuses/diagnostics.

Passing audit regression:

`maps pass, failure, timeout, cancellation, spawn errors, and bounded output`

Do not reintroduce exit-code-only classification.

---

# 8. Recommended implementation sequence

Use this order to minimize cross-coupling.

## Phase 0 — Baseline capture

1. capture `git status --short`;
2. capture scoped diffs for:
   - `packages/coding-agent/src/core/tools/edit-diff.ts`
   - `packages/coding-agent/src/core/tools/find.ts`
   - `packages/coding-agent/src/ice-cognee.ts`
   - `packages/coding-agent/src/ice-subagent-jobs.ts`
   - affected test files;
3. run the currently relevant targeted tests and record baseline failures;
4. do not modify unrelated dirty files.

## Phase 1 — #5 find normalization

Why first: smallest isolated behavior change; easy regression surface.

1. add `./` regression(s);
2. verify failure on current tree;
3. normalize pattern before fd prefix logic;
4. run `3302-find-path-glob.test.ts`.

## Phase 2 — #3 exact-before-fuzzy edit matching

1. add direct single-edit reproduction;
2. add mixed exact/fuzzy batch reproduction;
3. implement exact uniqueness precedence;
4. verify no retargeting in mixed batches;
5. run all relevant edit tests.

## Phase 3 — #4 Cognee atomic-write cleanup

1. introduce private atomic-write helper;
2. migrate pending enqueue/update, config save, and session-map write;
3. add fault-injection cleanup tests;
4. optionally add stale crash-temp cleanup;
5. run full `ice-cognee.test.ts`.

## Phase 4 — #10 subagent terminal-race semantics

Do this after the isolated utility fixes because it affects the scheduler state machine.

1. add deterministic resolve-then-cancel race test;
2. change verified-completion precedence;
3. add cancel/shutdown/cancelSubset matrix;
4. confirm terminal persistence/notification ordering;
5. run `ice-subagent-jobs.test.ts` plus subagent integration tests.

## Phase 5 — optional #7 policy

Only after the four confirmed fixes are stable and only if failure retry semantics are intentionally selected.

## Phase 6 — integration validation

Run targeted suites, then repository checks. Review the final diff for accidental unrelated edits.

---

# 9. Validation commands

The repository uses **npm**, not pnpm. During the audit, the structured Vitest helper attempted a pnpm-oriented invocation and was inappropriate for this repo. Use npm commands.

From `packages/coding-agent`:

```bash
npm exec vitest -- run test/suite/regressions/3302-find-path-glob.test.ts
npm exec vitest -- run test/suite/regressions/ice-edit-exact-before-fuzzy.test.ts
npm exec vitest -- run test/ice-cognee.test.ts
npm exec vitest -- run test/ice-subagent-jobs.test.ts
```

Relevant protection tests for rejected claims:

```bash
npm exec vitest -- run test/ice-subagents.test.ts -t "restores owner-scoped jobs and delivers only undelivered completion metadata"
npm exec vitest -- run test/ice-subagents.test.ts -t "admits a retry only after reconciling the first attempt"
npm exec vitest -- run test/ice-safe-verify.test.ts -t "maps pass, failure, timeout, cancellation, spawn errors, and bounded output"
```

From the server package/location used by its existing test setup, preserve:

```bash
npm exec vitest -- run test/conformance.test.ts -t "can respond out of request order after the handshake"
```

After targeted suites:

```bash
npm run check
```

If the repository has a package-scoped full test script that is cheaper than the monorepo-wide suite, run it before the complete monorepo test pass.

### Important baseline note

The 2026-08-31 audit observed a broader run with three unrelated existing failures involving active-tool expectations (`[delegate, read]` vs live inclusion of `manage_subagent`). Do not attribute those to this remediation unless the scoped diff actually affects tool-policy projection. Record before/after results.

---

# 10. Manual smoke checks

Automated tests are mandatory, but also perform these direct checks.

## Edit

Create in-memory/temp content containing both ASCII and Unicode fuzzy-equivalent strings. Confirm only the exact literal is replaced when exact exists.

## Find

From a temporary fixture/repo root, compare results for:

```text
src/**/*.spec.ts
./src/**/*.spec.ts
```

They should be semantically equivalent.

## Cognee

Force a controlled write/rename failure in a temporary storage directory. After the call rejects, list the directory and confirm no operation-owned `.tmp` file remains.

## Subagent race

Use a deferred runner:

```text
launch -> running -> resolve verified completion -> immediately cancel -> await cancellation
```

Inspect the durable job:

```text
status = completed
verification.verified = true
evidence.paths retained
usage retained
one terminal snapshot
one notification after persistence
```

Then run the inverse effective-cancel case:

```text
launch -> running -> cancel -> abort listener returns cancelled result
```

and confirm final status remains cancelled.

---

# 11. Completion checklist

The remediation is done only when all of the following are true.

## Confirmed bugs

- [ ] #3 exact literal match cannot be rejected solely because a fuzzy-equivalent variant exists elsewhere.
- [ ] #3 true exact duplicates still reject.
- [ ] #3 fuzzy fallback still behaves safely and mixed batches do not retarget exact edits.
- [ ] #4 ordinary failed atomic writes clean their own temp files.
- [ ] #4 all equivalent Cognee write-rename sites use the safe helper or have a documented exception.
- [ ] #4 queue limits and permissions remain correct.
- [ ] #5 leading `./` path globs work with fd full-path matching.
- [ ] #5 existing path-glob regressions remain green.
- [ ] #10 a verified completed runner result is not rewritten as cancelled/interrupted solely by a racing stop request.
- [ ] #10 trusted evidence/findings remain present when completion wins.
- [ ] #10 normal cancellation still works when abort actually produces a cancelled/non-completed result.
- [ ] #10 persistence still precedes notification and terminal settlement is exactly once.

## Non-regression protections

- [ ] #1 durable restore/re-notification test still passes.
- [ ] #2 no `custom`/`custom_message` schema merge was introduced.
- [ ] #6 request concurrency conformance still passes.
- [ ] #8 retry budget lifecycle tests still pass.
- [ ] #9 verifier classification tests still pass.

## Repository hygiene

- [ ] No unrelated dirty-tree changes were overwritten.
- [ ] No lockfile/dependency churn was introduced.
- [ ] New tests are deterministic and do not depend on wall-clock sleeps where fake timers/deferred promises suffice.
- [ ] Scoped diff contains only intended production/test/documentation changes.
- [ ] `npm run check` result is recorded.
- [ ] Any pre-existing unrelated failures are listed separately from remediation failures.

---

# 12. Expected final change set

The implementation should normally touch approximately these files:

### Production

- `packages/coding-agent/src/core/tools/edit-diff.ts`
- `packages/coding-agent/src/core/tools/find.ts`
- `packages/coding-agent/src/ice-cognee.ts`
- `packages/coding-agent/src/ice-subagent-jobs.ts`

### Tests

- `packages/coding-agent/test/suite/regressions/3302-find-path-glob.test.ts`
- new focused edit regression test, preferably `packages/coding-agent/test/suite/regressions/ice-edit-exact-before-fuzzy.test.ts`
- `packages/coding-agent/test/ice-cognee.test.ts`
- `packages/coding-agent/test/ice-subagent-jobs.test.ts`

Optional documentation updates are acceptable if they explain changed stop-race semantics or Cognee cooldown policy, but avoid unrelated documentation churn.

---

# 13. Definition of done

A completion report from the implementation agent must include:

1. exact production files changed;
2. exact regression tests added/modified;
3. before-fix reproductions for #3, #4, #5, #10;
4. after-fix results;
5. targeted test command outputs/summaries;
6. repository-wide check result;
7. explicit statement that #1, #2, #6, #8, #9 were intentionally left unchanged;
8. explicit statement whether optional #7 cooldown policy was changed or left as-is;
9. any remaining unrelated baseline failures;
10. final `git diff --stat` plus a short risk assessment.

The implementation should not be accepted merely because tests are green. Review the actual terminal-state semantics for #10 and the mixed exact/fuzzy targeting semantics for #3; both bugs can be accidentally “papered over” with tests that are too narrow.

# ICE Subagent Control / Settings / Hooks — Follow-Up Closure Plan

**Date:** 2026-09-09 (closure update)  
**Source plan:** `agent_docs/implementation/subagent-control-settings-hooks-plan.md`  
**Branch at verification:** `feat/subagents`  
**Status:** Track A F01-F07 is closed from observed current-tree evidence. This document preserves the historical defect descriptions and records their final acceptance state below.

---

## 1. Current verified state

The current safe parent-owned slice has been verified as:

- **49 full**
- **0 partial**
- **5 explicitly deferred**

F01-F07 are closed. The final evidence packet is under `.artifacts/ice-subagent-control-hooks/`; the follow-up run details and raw rollback output are under `.artifacts/ice-subagent-control-hooks-follow-up/`.

The five intentionally deferred authority-expanding packages remain:

- W20 — optional Ice-owned route resolution
- W21 — async route snapshot provenance
- W31 — optional command-hook execution gate
- W32 — command-hook payload and environment
- W33 — hook deadline and cleanup

No deferred authority-expanding work was implemented in this closure pass. Exact parent-model inheritance remains the W19 decision, and project trust still never authorizes executable command hooks. If both deferred tracks later receive explicit architecture approval and are implemented with their own gates, the final target becomes **54/54**.

---

## 2. Required invariants

Every implementation step in this plan must preserve the following repository rules and existing ICE architecture.

1. Ice remains the single authoritative reasoning/tool loop.
2. Do not create a second model registry, provider SDK, planner, session store, or tool loop.
3. Stock `ice` behavior remains unchanged; ICE-specific behavior stays behind `ice` seams.
4. `safe` remains the intended default capability profile.
5. `plan` and `review` stay read-only.
6. Deny wins over allow at every authority layer.
7. Project trust is necessary for project-local executable configuration but never sufficient by itself for host/process authority.
8. A path being authorized does not imply that a tool is authorized.
9. A selected skill/prompt/context resource must never widen the caller's explicit tool subset.
10. Final dispatch is authoritative. Prompt text and model-visible tool lists are not sufficient enforcement.
11. Interrupted non-idempotent effects must never be blindly replayed.
12. Missing headless approval fails closed.
13. Durable/background work must preserve accepted authority and provenance instead of silently adopting later settings.
14. Tests must not use real provider APIs, network access, credentials, or paid tokens.
15. Tests that expect bundled roles must be hermetic and independent of `~/.ice/agent/agents`.
16. Preserve unrelated dirty work in the repository.
17. Do not commit, push, merge, release, or deploy unless separately requested.
18. Do not claim safe autonomy merely because these subagent controls pass; the broader `idea.md` autonomous-mode safety gate remains authoritative.

---

## 3. Resume instructions for a fresh implementation session

Before modifying code, a new implementation session should perform this exact orientation sequence:

1. Read `AGENTS.md` fully.
2. Read the relevant current-state sections of `idea.md`, especially:
   - current subagent architecture;
   - permission/authority rules;
   - required autonomous-mode safety gate;
   - explicit non-goals.
3. Read this follow-up plan fully.
4. Read the original work-package blocks for W06, W07, W14, W35, W52, W53, and W54.
5. Run `git status` and record the dirty tree before touching anything.
6. Inspect the complete affected implementation files before editing them.
7. Record a baseline under a new artifact directory such as:

   `.artifacts/ice-subagent-control-hooks-follow-up/`

8. Do not rely on the old evidence packet as current truth; treat it as historical evidence only.
9. Do not run full Vitest or `npm test`. Run only the affected package tests allowed by `AGENTS.md`.
10. Before the final exact `npm run check`, first run a non-writing Biome check so the write-enabled repository check is known to be a no-op for formatting.

Recommended artifact structure:

```text
.artifacts/ice-subagent-control-hooks-follow-up/
  baseline.txt
  source-provenance.txt
  targeted-tests.txt
  hermetic-tests.txt
  rollback-drill.txt
  repository-check.txt
  work-package-ledger.md
  final-evidence.md
```

---

# Track A — Close the current safe slice

Track A is mandatory. Do not begin the deferred authority-expansion track while any Track A acceptance gate is red.

---

## F01 — Close W14 and W06: strict final-dispatch tool authority

**Priority:** P0 / security correctness  
**Original packages:** W14, W06  
**Primary files:**

- `packages/coding-agent/src/ice-subagents.ts`
- `packages/coding-agent/test/ice-subagents.test.ts`
- possibly `packages/coding-agent/test/ice-safe-verify.test.ts` if facade-level regression coverage is useful

### Current defect

`withScopedPath()` currently treats `resourceRoots` as both:

- an additional path scope; and
- an exception to tool eligibility.

The relevant current condition is conceptually:

```text
if tool is not eligible
AND requested path is not in resource root
  => deny
```

This means a selected resource root can allow a hidden/disallowed read-family tool such as `find` or `ls` to execute even though that tool was removed from the child's effective tool set.

That violates the original W14 requirement:

> A disallowed tool is never executed even if the child requests it.

It also weakens W06's end-to-end deny-first monotonicity guarantee.

### Required design correction

Separate **path authority** from **tool authority**.

`resourceRoots` may extend where an already-authorized read-family tool can operate, but they must never authorize the tool itself.

The target rule is:

```text
effective tool authority
  = parent active tools
  ∩ profile requested tools
  ∩ execution mode policy
  ∩ caller/per-call subset
  - applicable denies

path authority
  = approved task scope roots
  + explicitly selected, hash-validated resource roots

final dispatch requires BOTH:
  tool ∈ effective tool authority
  AND path ∈ permitted path authority
```

A resource path can satisfy only the second condition.

### Implementation sequence

- [ ] Read `assertSubagentToolEligible()`, `withScopedPath()`, `createScopedReadOnlyToolDefinitions()`, `createScopedWriterToolDefinitions()`, `wrapSubagentToolDefinitions()`, and `createNativeSubagentSession()` in full before editing.
- [ ] Remove the `resourceRoots.some(...)` bypass from the tool eligibility decision in `withScopedPath()`.
- [ ] Make the dispatch sequence explicit:
  1. resolve/canonicalize the path;
  2. enforce scope/resource-root path admission;
  3. unconditionally enforce tool eligibility when `eligibleTools` is supplied;
  4. only then call the underlying tool definition.
- [ ] Update the misleading W14 comments around native session construction that currently describe resource-root reads as an intentional tool-eligibility exception.
- [ ] Preserve resource-root path access for tools that are actually authorized. Do not remove selected-resource functionality.
- [ ] Do not automatically add `find`, `ls`, `grep`, or `read` to `childTools` merely because a skill/prompt/context resource was selected.
- [ ] Do not silently widen an explicit caller subset to make a selected skill easier to inspect.
- [ ] If a selected resource requires a tool that the caller denied, the child must either operate with the remaining permitted tools or fail clearly; the runtime must not widen authority.

### Required regressions

Add focused tests in `ice-subagents.test.ts` for all of the following:

1. **Forged hidden tool against selected resource**
   - effective tools: `read`
   - selected resource root exists
   - directly invoke wrapped `find`
   - expect `capability_denied`
   - assert underlying `find.execute` was never called

2. **Allowed tool against selected resource**
   - effective tools: `read`
   - selected resource root exists
   - `read` resource file
   - expect success

3. **Explicit caller subset is monotonic**
   - profile requests `read, grep, find, ls`
   - caller subset requests only `read`
   - selected skill present
   - final child authority still contains only `read`

4. **Broader deny beats narrower allow**
   - globally/tool-policy deny `find`
   - role/caller otherwise allows it
   - selected resource contains a valid path
   - final dispatch still denies

5. **Empty subset remains empty**
   - `execution.tools=[]`
   - selected resource present
   - no normal read-family tool may execute

6. **Unknown tool name**
   - unknown/friendly read-like name must not be inferred as safe or read-only

7. **Existing repo scope behavior remains unchanged**
   - allowed tool inside normal scope succeeds
   - allowed tool outside scope fails
   - symlink and Git metadata protections remain unchanged

### Acceptance gate

W14 is complete only when:

- a disallowed tool cannot execute against normal scope;
- a disallowed tool cannot execute against selected resource roots;
- the underlying tool implementation is never called after a final-dispatch denial;
- selected resources continue to work through already-authorized tools.

W06 is complete only when no more-specific scope/resource/caller allow can defeat a broader applicable deny.

### Rollback boundary

If selected-resource workflows break after removing the bypass, do **not** restore the bypass. Instead, stop and design an explicit resource-access capability or clear preflight rejection. Resource selection may not be used as a hidden authority channel.

---

## F02 — Close W07: exact scoped settings diagnostics

**Priority:** P1  
**Original package:** W07  
**Primary files:**

- `packages/coding-agent/src/modes/rpc/rpc-settings.ts`
- `packages/coding-agent/test/rpc-settings.test.ts`
- possibly `packages/coding-agent/src/ice-subagents.ts` if the same diagnostic projection exists elsewhere

### Current defect

`diagnostics()` parses global and trusted-project ICE settings in one `try/catch`. On failure it derives diagnostic scope from `isProjectTrusted()` rather than from the source that failed.

Therefore an invalid **global** ICE policy in a trusted project can be reported as a **project** error.

### Target behavior

Global and project sources must be parsed and diagnosed independently.

Required rules:

```text
global parse failure  => scope=global
project parse failure => scope=project
both invalid          => two bounded diagnostics
untrusted project     => project security-sensitive settings are not treated as effective authority
write/flush failure   => distinct settings_io_error
syntax/load failure   => distinct settings_parse_error
policy/schema failure => distinct ice_policy_error
```

Do not expose the full offending settings object.

### Implementation sequence

- [ ] Split global ICE parsing into its own guarded block.
- [ ] Split trusted-project ICE parsing into a separate guarded block.
- [ ] Preserve existing fail-closed behavior.
- [ ] Preserve bounded/redacted diagnostic messages.
- [ ] Do not call `drainErrors()` earlier than required if doing so would consume persistence errors before another projection needs them; inspect current SettingsManager semantics first.
- [ ] Ensure global and project failures can coexist in one snapshot instead of the first exception masking the second source.

### Required tests

Add or extend `rpc-settings.test.ts`:

- [ ] trusted project + invalid global ICE => `ice_policy_error`, `scope=global`
- [ ] trusted project + valid global + invalid project => `scope=project`
- [ ] both invalid => both scopes represented
- [ ] untrusted project + invalid project ICE => project policy does not become effective authority; expected trust diagnostic behavior remains correct
- [ ] failed flush => `settings_io_error` and never reported as persisted
- [ ] diagnostic output contains no unrelated settings blob or secret sentinel

### Acceptance gate

Every diagnostic must identify the actual source of failure. A failed save must remain visible and must never be presented as persisted.

---

## F03 — Make W49/W54 verification hermetic with respect to user profiles

**Priority:** P1 / verification integrity  
**Affected original packages:** W49, W54  
**Primary files:**

- `packages/coding-agent/test/ice-subagents.test.ts`
- any other targeted test that assumes bundled `explore` / `review` without providing an explicit agent directory
- evidence scripts/files under `.artifacts/` only after tests are fixed

### Current defect

Production profile precedence is intentionally:

```text
trusted project > user > bundled > alias
```

Tests that call `normalizeSubagentRequest()` without an explicit isolated `agentDir` can therefore load real user profiles from `~/.ice/agent/agents`.

The re-audit demonstrated this directly before the fixture correction:

- normal host environment: `ice-subagents.test.ts` => 189 passed / 14 failed
- isolated `ICE_CODING_AGENT_DIR`: same file => 203/203 passed

The corrected current acceptance run uses explicit `<test cwd>/.ice-agent` roots with `ICE_CODING_AGENT_DIR` unset: the eight-file target passes 393/393, and the broader 16-file provider-free sweep passes 479/479. Full outputs are recorded in `.artifacts/ice-subagent-control-hooks/targeted-tests.txt` and `broader-ice-sweep.txt`.

This is not a production precedence bug. It is a test fixture/provenance bug.

### Target behavior

Tests that intend to exercise **bundled** profiles must always use an isolated explicit agent directory.

Tests that intentionally exercise **user profile precedence** must create that user profile themselves in a temporary directory.

No test result may depend on the developer's real `~/.ice/agent` contents.

### Preferred implementation

Prefer passing an explicit temporary `agentDir` through test helpers/options rather than mutating process-global `ICE_CODING_AGENT_DIR` for the entire file.

Process-global environment mutation is acceptable only inside narrowly controlled tests that restore state and cannot race another test.

### Implementation sequence

- [ ] Identify every helper that constructs a request expecting bundled profiles, especially `request()`, `verificationFixture()`, `resolvedBatchTask()`, and direct `normalizeSubagentRequest()` call sites.
- [ ] Add a temp isolated agent directory to the relevant fixture path.
- [ ] Pass `agentDir` explicitly through normalization/session creation options wherever the API supports it.
- [ ] Keep dedicated profile-precedence tests explicit: create `agents/explore.md` or `agents/review.md` inside the test-owned agent directory.
- [ ] Avoid a broad `beforeEach` process environment mutation if a local explicit option is available.

### Required regressions

- [ ] bundled-profile tests pass even when a conflicting host/user profile exists outside the fixture
- [ ] user profile precedence still works when the test explicitly creates a user profile
- [ ] project profile precedence still depends on trust
- [ ] eight-file targeted suite passes without requiring the operator to manually set `ICE_CODING_AGENT_DIR`

### Acceptance gate

The exact targeted command must produce the same result regardless of the developer's real user profile catalog.

The final evidence packet must record the agent/profile fixture identity explicitly.

---

## F04 — Close W35: authoritative intent-before-effect hook journaling

**Priority:** P1 / crash safety  
**Original package:** W35  
**Primary files:**

- `packages/coding-agent/src/ice-subagent-settings.ts`
- `packages/coding-agent/src/ice-subagents.ts`
- `packages/coding-agent/test/ice-subagent-settings.test.ts`
- `packages/coding-agent/test/ice-subagents.test.ts`

### Current defect

The hook dispatcher emits intent before invoking a handler, which is the correct ordering, but failures in the intent-journal callback are swallowed. The extension-side `appendHookJournal()` also swallows `appendEntry()` failures.

That permits this unsafe ambiguity:

```text
intent journal write fails
→ hook handler still executes external/non-idempotent effect
→ process dies
→ restart has no durable intent record
→ no durable evidence exists that the effect may already have happened
```

The existing restart path correctly refuses to replay an **existing** unresolved intent. The missing guarantee is that intent persistence must succeed before a side-effect-capable hook is invoked.

### Required semantics

Separate intent persistence from outcome observability:

1. **Intent persistence is authoritative before dispatch.**
2. If intent persistence fails:
   - do not invoke the hook handler;
   - required hook => fail closed / block the gated action;
   - optional hook => skip the hook, continue primary execution with a bounded diagnostic.
3. Outcome persistence may fail after execution. If it does, the intent remains unresolved on restart and is **not replayed automatically**.
4. Observational hook delivery must still never forge primary execution success.
5. Do not claim exactly-once delivery of an external effect.

### Important implementation check

Before changing callback types, inspect the actual persistence semantics of `ExtensionAPI.appendEntry` / session entries.

If `appendEntry()` is only an in-memory enqueue and does not provide the durability contract W35 relies on, do not simply remove the catch and call the problem solved. Use the existing session persistence/flush seam if one exists, or keep W35 explicitly unresolved until a real acknowledged persistence boundary is available.

### Suggested API shape

If required by the persistence seam, allow the intent callback to be awaitable:

```text
onIntent(record): void | Promise<void>
```

The dispatcher then awaits successful intent recording before invoking the handler.

Do not make raw hook payloads durable; persist only the existing bounded/redacted correlation record.

### Implementation sequence

- [ ] Read the complete dispatcher and hook-journal types.
- [ ] Inspect `appendEntry` durability and error semantics.
- [ ] Make intent persistence failure visible to the dispatcher.
- [ ] Do not swallow authoritative intent failures.
- [ ] Preserve best-effort/outcome behavior only where it cannot cause a duplicate side effect.
- [ ] Keep stable `eventId`, owner session, run, attempt, hook, event, and bounded status fields.
- [ ] Keep restart behavior: intent-without-outcome => unresolved warning; no automatic replay.

### Required tests

1. **Intent write fails before handler**
   - intent sink throws/rejects
   - handler spy remains `0` calls
   - required hook blocks

2. **Optional intent failure**
   - handler not executed
   - primary operation can continue
   - bounded diagnostic emitted

3. **Intent succeeds, handler executes, outcome write fails**
   - handler executes exactly once
   - restart sees unresolved intent
   - no replay occurs

4. **Normal path ordering**
   - observed ordering is `intent → handler → outcome`

5. **Crash-window restore**
   - persist only intent
   - restart same owner session
   - warning appears
   - no handler invocation

6. **Foreign owner journal entry**
   - must not affect current owner's recovery state

7. **Redaction/bounds**
   - persisted record contains no raw hook payload or secret sentinel

### Acceptance gate

No side-effect-capable hook handler may execute unless the runtime has first crossed the intended durable intent boundary.

A crash after dispatch may leave an unresolved intent, but the runtime must never auto-repeat the hook because outcome evidence is missing.

---

## F05 — Close W52: real feature-off / rollback drill

**Priority:** P2  
**Original package:** W52  
**Primary files/tests:**

- `packages/coding-agent/test/ice-subagents.test.ts`
- `packages/coding-agent/test/ice-subagent-jobs.test.ts`
- `packages/coding-agent/test/ice-safe-verify.test.ts`
- persisted-session fixtures if necessary
- `.artifacts/ice-subagent-control-hooks-follow-up/rollback-drill.txt`

### Goal

Prove that disabling the new subagent-control surface blocks new admissions without stranding already-owned durable state or changing stock Ice behavior.

### Required automated scenarios

#### Scenario A — feature off at startup

- persisted subagent/job metadata exists
- start with `ice.subagents.enabled=false`
- new `delegate` / `delegate_async` admission is denied
- inspection of retained terminal/durable state still works where the product contract permits it
- cancellation of owned live retained work still works if it exists
- no new child launch occurs

#### Scenario B — authority revoked after admission

- accept a queued/durable job under valid authority
- change settings/trust so current contract is narrower or disabled
- before promotion/continuation, runtime revalidates
- job must fail/stop with explicit authority-revoked evidence rather than launching with stale authority

#### Scenario C — disable while retained timeout exists

- create/restore a `needs_time` retained child
- disable new admissions
- existing child remains inspectable
- owner may stop it
- extending/follow-up must obey the documented current-authority rules; no hidden new authority is granted

#### Scenario D — restart with persisted journal/job state

- persist job snapshot and hook journal records
- restart with feature disabled
- do not relaunch ambiguous work
- preserve owner-visible unresolved/terminal metadata

#### Scenario E — stock Ice regression

- start ordinary `ice` path without ICE opt-in
- prove the follow-up changes do not register or activate ICE-only behavior in stock mode

### Manual operator drill

Record one real local drill, not just unit assertions:

1. capture initial settings and dirty state;
2. launch an isolated faux-provider ICE session;
3. create representative retained/durable state;
4. disable subagent admission;
5. restart/reload;
6. inspect retained state;
7. stop/cancel it;
8. verify no duplicate child launch occurred;
9. verify journals remain available;
10. re-enable and prove old ambiguous state is not silently replayed.

No real provider or network is required.

Closure evidence: the isolated drill was executed through a temporary Vitest fixture with an explicit temporary `agentDir`, a faux provider, and `projectTrusted=false`; it passed 1/1. It persisted settings and parent entries, launched a blocked faux child, toggled `subagents.enabled` off, cancelled the owned running job, restarted, rejected new admission with zero provider calls, retained one unresolved intent without replay, re-enabled the setting, and restarted again without replay. Raw output is `.artifacts/ice-subagent-control-hooks/rollback-drill-output.txt`.

### Acceptance gate

Feature-off startup must preserve stock behavior and retained-job observability while preventing new unsafe admissions. This gate is complete; no real user settings or session store was mutated.

Rollback must be a configuration/state transition, not deletion of history or forced tree cleanup.

---

## F06 — Close W53: exact mandatory repository verification

**Priority:** P2 / release evidence  
**Original package:** W53

### Problem

The previous evidence packet ran non-writing equivalents but did not execute the literal required repository `npm run check` acceptance command.

The repository currently declares npm `12.0.2` for this gate.

### Safe execution protocol in a dirty worktree

Because `npm run check` begins with write-enabled Biome, do not run it blindly against a dirty multi-agent tree.

Use this sequence:

1. record `git status` and changed-file ownership;
2. record `node --version`;
3. record `npm --version`;
4. if npm is not `12.0.2`, use `corepack npm@12.0.2` as required by `AGENTS.md`;
5. run **non-writing** `npx biome check .` first;
6. if non-writing Biome fails because formatting changes are needed, fix only follow-up-owned files or stop and report unrelated failures;
7. only once non-writing Biome is green, run the exact:

   `npm run check`

   or, when necessary:

   `corepack npm@12.0.2 run check`

8. capture full output and exit status;
9. compare git status before/after; the exact check should not unexpectedly modify unrelated files;
10. classify any failure as:
    - follow-up regression;
    - pre-existing baseline failure;
    - environment/toolchain failure;
    - unrelated concurrent-tree change.

### Targeted test command requirements

Run the exact affected test files from the coding-agent package using the repository-prescribed Vitest entrypoint. At minimum include:

- `test/ice-subagent-settings.test.ts`
- `test/ice-subagents.test.ts`
- `test/ice-subagent-jobs.test.ts`
- `test/ice-subagent-result-contract.test.ts`
- `test/ice-subagent-timeout-supervisor.test.ts`
- `test/ice-agent-view-integration.test.ts`
- `test/rpc-settings.test.ts`
- `test/ice-safe-verify.test.ts`

Add any new focused test files introduced by this follow-up.

Do not use the full Vitest suite and do not use `npm test`.

### Acceptance gate

W53 is complete only when:

- all affected targeted tests pass in a hermetic fixture;
- the exact required repository check passes under npm 12.0.2;
- full command output and exit status are recorded;
- no required check is merely inferred from an equivalent command.

Closure result: 8 targeted files passed 393/393 with `ICE_CODING_AGENT_DIR` unset; the literal `npm run check` passed with npm 12.0.2 and exit 0 after a clean non-writing Biome precheck. The final status diff is empty.

---

## F07 — Close W54: regenerate a reproducible final evidence packet

**Priority:** P2  
**Original package:** W54

### Goal

Replace the optimistic/stale status ledger with an evidence packet that another fresh session can reproduce.

### Required provenance

Record at least:

- branch/ref and Git status;
- Node version;
- npm version;
- relevant environment variables affecting behavior;
- explicit test agent directory / profile fixture identity;
- source hashes for every behavior-affecting implementation and test file;
- exact settings fixture used by rollout tests;
- exact commands and exit statuses;
- test counts;
- exact repository-check command;
- unresolved risks;
- explicit list of deferred packages.

### Profile-fixture provenance

The packet must no longer say only "203 tests passed" while leaving profile precedence implicit.

Record whether tests use:

- explicit empty agent directory;
- explicit temporary user profiles;
- trusted project profile fixtures.

If a directory fixture affects profile resolution, record a manifest or deterministic description sufficient to reproduce it.

### Work-package ledger rules

Regenerate the ledger from observed acceptance results.

Do not mark a package `implemented` merely because relevant code exists.

Use statuses such as:

```text
full
partial
blocked
explicitly deferred
```

For each package, link its acceptance criterion to:

- source seam;
- test case/file;
- command;
- result/artifact.

### Required final safe-slice status

Track A may claim completion only if the ledger becomes:

```text
49 full
0 partial
5 explicitly deferred
```

The completion statement must say that W20/W21 and W31-W33 remain deferred, not missing accidentally.

Do not claim 54/54 until those authority-expanding packages are separately approved and verified.

---

# Track A dependency order

Use this order to reduce rework:

```text
F01 W14/W06 final dispatch
        ↓
F02 W07 diagnostics
        ↓
F03 hermetic profile fixtures
        ↓
F04 W35 journal durability
        ↓
F05 W52 rollback drill
        ↓
F06 W53 exact tests + npm run check
        ↓
F07 W54 evidence packet
```

F01 and F02 can technically be implemented independently, but do not run the final W52-W54 closure until F03 and F04 are complete.

---

# Track B — Deferred authority expansion

Track B is planning-ready but **implementation-gated**. Creating this follow-up plan is not approval to change W19's exact-parent-model policy or to execute repository command hooks.

Do not begin a Track B implementation until the user explicitly approves the relevant authority expansion.

Track B must never be used to delay or weaken Track A correctness fixes.

---

## B01 — Architecture approval gate for W20/W21 per-child routing

**Original packages:** W20, W21

### Current policy

The current architecture intentionally inherits the exact parent `Model` object. W19 was closed as a decision to keep alternate per-child routing disabled.

Implementing W20 changes that architecture and therefore requires an explicit decision plus an `idea.md` update.

### Approval packet should state

- exact user benefit;
- expected cost/token effect;
- whether routes can change context/output/tool/reasoning capabilities;
- credential requirements;
- durable-job provenance impact;
- behavior when route is missing or stale;
- rollback to inherit-parent.

No runtime implementation should be claimed before this decision is recorded.

---

## B02 — W20 optional Ice-owned route resolution

**Implement only after B01 approval.**

**Likely files:**

- `packages/coding-agent/src/ice-subagents.ts`
- existing Ice `ModelRuntime` / `ModelRegistry` seams only as needed
- `packages/coding-agent/test/ice-subagents.test.ts`
- `idea.md`

### Design constraints

- default remains `inherit-parent`;
- accept only exact configured route references;
- do not add a second provider registry;
- do not perform network model discovery during preflight;
- do not persist credentials;
- validate selected route metadata before launch:
  - tool support;
  - reasoning capability;
  - context window;
  - maximum output;
  - required modality where relevant;
- invalid/missing route fails preflight explicitly;
- no silent fallback to another route.

### Required tests

- exact configured route resolves through Ice-owned runtime;
- nonexistent route fails before child startup;
- missing credentials fails without network discovery;
- unsupported reasoning/tool capability fails admission;
- omitted route uses the exact parent model;
- project settings cannot inject credentials or arbitrary provider config.

---

## B03 — W21 durable route snapshot provenance

**Depends on B02.**

**Likely files:**

- `packages/coding-agent/src/ice-subagent-jobs.ts`
- `packages/coding-agent/src/ice-subagents.ts`
- `packages/coding-agent/test/ice-subagent-jobs.test.ts`
- `packages/coding-agent/test/ice-subagents.test.ts`

### Accepted-job contract

At acceptance, persist only bounded route identity/provenance such as:

- provider identifier;
- model identifier;
- approved route reference;
- runtime/catalog generation or other non-secret fingerprint;
- relevant capability snapshot/hash.

Never persist:

- live `Model` objects;
- API keys;
- auth headers;
- provider session credentials.

### Promotion behavior

When queued work promotes:

- resolve the captured route identity through current Ice runtime;
- verify credentials are presently available;
- verify the route has not become incompatible;
- if unavailable/stale, fail explicitly;
- never substitute the parent's newer model silently.

### Required tests

- parent switches model after job admission => accepted job keeps captured route;
- captured route removed => explicit launch failure;
- credential unavailable => explicit launch failure;
- restart restores route provenance without credentials in session entries;
- no automatic fallback.

---

## B04 — Architecture approval gate for W31-W33 command hooks

**Original packages:** W31, W32, W33

Command hooks introduce host process/filesystem/network authority. Project trust alone must never enable them.

Before implementation, record an explicit policy decision covering:

- which execution modes may run command hooks;
- whether command-hook enablement is global-only;
- executable allowlist shape;
- path/cwd boundary;
- environment policy;
- network policy or lack of sandboxing;
- approval behavior in interactive vs headless mode;
- process-tree cancellation limitations;
- durable intent-before-spawn requirement from F04.

Recommended default: command hooks remain disabled unless a separate host-owned/global executable policy enables them.

A trusted project may reference an allowed hook, but must not be able to grant itself executable authority.

---

## B05 — W31 command execution gate

**Depends on B04 approval and F04 W35 closure.**

### Required design

- shell interpolation forbidden;
- resolve executable + argv as structured data;
- use `shell: false`;
- executable must match explicit host-owned policy;
- project trust alone is insufficient;
- plan/review remain disabled unless an independent safe boundary explicitly supports them;
- missing headless approval fails closed;
- persist acknowledged dispatch intent before process spawn;
- no inherited recursive delegation authority.

### Required tests

- trusted project without executable policy cannot spawn;
- build mode + explicit executable policy follows approval rules;
- plan/review cannot spawn by default;
- headless missing approval cannot spawn;
- shell metacharacters remain argv data;
- denied executable never reaches spawn spy.

---

## B06 — W32 bounded command payload and environment

### Required process contract

Input:

```text
versioned bounded JSON on stdin
```

Not:

```text
shell-expanded prompt text
```

Environment:

- construct an explicit minimal allowlist;
- do not forward the whole parent environment;
- redact/exclude credential-like variables;
- use scoped cwd;
- do not treat `PATH` lookup as executable authorization unless policy explicitly defines that behavior.

Output:

- bound stdout and stderr independently;
- parse exact versioned result JSON where a decision result is required;
- redact before trace/context projection;
- malformed required output fails closed;
- arbitrary text containing `allow` must never authorize anything.

### Required tests

- argv injection/metacharacters remain inert data;
- stdin byte cap;
- stdout/stderr byte caps;
- environment secret sentinel absent;
- malformed output fails closed;
- optional malformed observer cannot forge success;
- cwd escape rejected.

---

## B07 — W33 deadlines, cancellation, and process cleanup

### Required behavior

- per-hook monotonic deadline;
- aggregate hook deadline where multiple hooks run;
- close stdin on cancellation;
- stop reading after output cap;
- propagate AbortSignal;
- use the repository's existing process cleanup primitive after inspecting its contract;
- report platform-specific descendant cleanup honestly;
- never claim perfect host containment.

### Required tests

- hanging required hook stops within bounded interval and blocks action;
- optional hook timeout is classified without blocking unrelated primary facts where semantics permit;
- parent cancellation aborts hook process;
- stdout flood is bounded;
- stderr flood is bounded;
- child/descendant cleanup behavior is tested using local no-network fixtures;
- no automatic retry of interrupted command hook.

---

# 4. Final verification matrix

The final implementation/evidence packet should contain a matrix similar to:

| Package | Required observation | Evidence |
|---|---|---|
| W06 | deny remains monotonic across resource/caller scope | forged/resource-root denial tests |
| W07 | diagnostic scope identifies actual source | RPC settings tests |
| W14 | denied tool underlying execute count = 0 | dispatch spy tests |
| W35 | no handler runs before acknowledged intent | hook crash-window tests |
| W52 | feature off blocks admission but preserves retained state | automated + operator rollback drill |
| W53 | targeted tests + literal npm 12.0.2 repository check pass | full command logs |
| W54 | provenance captures all behavior-affecting inputs | regenerated evidence packet |

For deferred work, the matrix must continue to show:

| Package | Status before explicit approval |
|---|---|
| W20 | explicitly deferred |
| W21 | explicitly deferred |
| W31 | explicitly deferred |
| W32 | explicitly deferred |
| W33 | explicitly deferred |

---

# 5. Test execution strategy

Follow repository rules rather than running the full suite.

After each code change, run the smallest directly affected file first.

Suggested progression:

1. W14/W06:
   - `ice-subagents.test.ts`
2. W07:
   - `rpc-settings.test.ts`
3. W35:
   - `ice-subagent-settings.test.ts`
   - relevant `ice-subagents.test.ts` restore tests
4. durable rollback:
   - `ice-subagent-jobs.test.ts`
   - relevant `ice-subagents.test.ts`
   - `ice-safe-verify.test.ts`
5. final affected target set:
   - all eight previously recorded target files plus newly introduced focused files
6. non-writing Biome check
7. exact `npm run check` under npm 12.0.2

Record every command and exit status.

Do not accept an earlier artifact saying a test passed as a substitute for a current run after the relevant source/test changes.

---

# 6. Stop conditions

Stop implementation and report unresolved instead of widening scope when any of the following occurs:

- fixing resource access appears to require reintroducing a hidden tool-authority bypass;
- a project setting would need to grant itself host executable authority;
- command-hook safety requires a new sandbox architecture not already approved;
- alternate model routing requires bypassing Ice-owned runtime/model APIs;
- a durable route would require serializing credentials or live `Model` objects;
- hook intent cannot be durably acknowledged before side-effect dispatch;
- exact repository checks expose unrelated failures owned by another concurrent session;
- a fix would require deleting or rewriting unrelated dirty work;
- stock `ice` behavior changes unintentionally;
- mandatory targeted tests or `npm run check` remain red.

In these cases, leave the associated work package `partial`, `blocked`, or `deferred`; do not relabel it complete.

---

# 7. Definition of done

## Track A done

All of the following were observed and are now complete:

- [x] resource roots extend only path authority, never hidden tool authority
- [x] forged/stale denied tools cannot execute
- [x] W06 deny-first composition is true at final dispatch, not just resolver level
- [x] global/project ICE diagnostics report the correct source scope
- [x] bundled-profile tests are hermetic and independent of real user profiles
- [x] intent journaling is acknowledged before side-effect-capable hook dispatch
- [x] restart with unresolved intent never auto-replays the hook
- [x] isolated operator-style feature-off/rollback drill is recorded and passes
- [x] affected target tests pass: 8 files, 393/393
- [x] exact npm 12.0.2 `npm run check` passes
- [x] evidence packet is regenerated with full fixture provenance
- [x] final ledger reads **49 full / 0 partial / 5 explicitly deferred**

The current approved safe slice is complete. The detailed implementation checklists above are retained as historical design and defect context; they do not reopen Track A.

## Track B done

Only after explicit approval:

- [ ] W20 approved and implemented through Ice-owned route resolution
- [ ] W21 durable route snapshot/provenance verified
- [ ] W31 explicit command execution policy implemented
- [ ] W32 bounded JSON/env/process contract implemented
- [ ] W33 deadline/cancellation/cleanup verified
- [ ] full affected targeted tests pass
- [ ] exact repository check passes again
- [ ] `idea.md` and final evidence accurately describe the expanded authority
- [ ] final ledger reads **54 full / 0 partial / 0 deferred**

Until those approvals and checks exist, **do not claim 54/54**.

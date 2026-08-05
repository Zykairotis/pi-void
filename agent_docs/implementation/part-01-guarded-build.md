# Part 01 — Guarded Build v0 implementation report

## Outcome

Guarded Build v0 is implemented as a hidden extension factory loaded only by the `piv` launcher. The normal `pi` launcher remains unchanged and does not expose Pi Void flags or commands.

The implementation provides guarded host execution rather than operating-system sandboxing. It narrows the model-visible and runtime-authorized tool surface, protects direct `edit` and `write` paths, records a read-only Git baseline, persists versioned state outside model context, and runs one explicitly supplied trusted verifier after successful mutation generations.

## Frozen behavior

- Modes are exactly `plan` and `build`.
- The default mode is `plan`.
- Plan tools are `read`, `grep`, `find`, `ls`, `draft_plan`, `propose_plan`, and `read_plan`.
- Build tools include `read`, `grep`, `find`, `ls`, `read_plan`, `edit`, and `write`; draft and proposal tools remain plan-only.
- Plan mode stores bounded session-native Markdown drafts, requires explicit interactive approval before build handoff, and keeps headless proposals pending.
- Approved build mode requires `read_plan` before mutation and after build-mode re-entry or compaction.
- Bash is available only when all three conditions are true:
  - mode is `build`;
  - the current process received `--piv-allow-bash`;
  - the project is trusted.
- User-entered Bash through `!` or `!!` follows the same gate.
- Unknown, custom, and MCP tools are denied unless they are in the exact active set.
- Tool hiding and pre-execution runtime denial are both enforced.
- The verifier must be supplied by the current process through `--piv-verify` as a nonempty bounded JSON string array.
- Verifier execution does not use a shell.
- Automatic verification runs once for each new successful authorized `edit` or `write` generation after `agent_settled`.
- Manual `/piv-verify` may rerun the current generation.

## Files

### Production

- `packages/coding-agent/src/piv.ts`
  - validates Pi Void startup arguments before normal CLI processing;
  - injects the hidden `piv-safe-verify` extension factory into `piv` only;
  - marks the bundled guard as an application-owned `before-user` inline extension.
- `packages/coding-agent/src/core/extensions/types.ts`
  - defines the narrow inline-extension priority contract.
- `packages/coding-agent/src/core/resource-loader.ts`
  - places `before-user` inline guards ahead of discovered user extensions while preserving normal inline ordering.
- `packages/coding-agent/src/piv-safe-verify.ts`
  - mode parsing and transitions;
  - active tool selection and runtime denial;
  - canonical direct mutation path protection;
  - read-only Git baseline capture;
  - durable state validation and restoration;
  - verifier parsing, execution, output bounds, timeout, cancellation, and process-tree cleanup;
  - mutation-generation deduplication;
  - status commands and headless exit behavior.

### Tests

- `packages/coding-agent/test/piv-safe-verify.test.ts`
  - focused contract, safety, lifecycle, launcher-isolation, and process-cleanup tests.
- `packages/coding-agent/test/suite/regressions/6260-inline-extension-naming.test.ts`
  - proves application-owned `before-user` handlers precede discovered user handlers without changing normal inline order.

### Documentation and provenance

- `agent_docs/source-provenance/part-01-guarded-build.md`
- `packages/coding-agent/CHANGELOG.md`
- `idea.md`
- `agent_docs/implementation/part-01-guarded-build.md`

## Safety design

### Dual tool enforcement

`setActiveTools()` limits what the model sees. A separate `tool_call` handler blocks every tool that is not in the exact effective set. This prevents stale model context, custom tools, or externally registered tools from bypassing the selected mode.

The bundled guard is loaded with application-owned `before-user` priority. This ensures its first-result `user_bash` handler runs before any discovered user extension, so a user extension cannot intercept `!` or `!!` and bypass the Bash mode, process-flag, and trust gate. Ordinary inline factories retain their prior position after discovered extensions.

### Canonical direct mutation guard

Direct `edit` and `write` calls are resolved against the current working directory and checked against the fixed canonical repository root. Existing targets use real paths. Prospective targets canonicalize the nearest existing ancestor before appending the unresolved suffix.

Containment uses component-aware relative-path checks rather than string prefixes. The guard rejects:

- parent traversal and absolute paths outside the repository;
- sibling-prefix confusion;
- existing and prospective symlink escapes;
- `.git` path segments;
- `.env` and `.env.*` path segments;
- explicit `credentials.json` and `service-account.json` path segments.

This is a pre-execution direct-tool guard. Filesystem time-of-check/time-of-use races remain outside its guarantee.

### Git baseline

At session initialization, Pi Void determines the guard root through `git rev-parse --show-toplevel`, falling back to the current working directory when needed. It captures only read-only evidence:

- canonical root;
- HEAD;
- current branch;
- porcelain status;
- capture time.

No add, stash, reset, checkout, restore, clean, or commit operation is performed.

### Durable state

State is stored in a versioned custom session entry and is not sent to the language model. It records:

- mode and root identity;
- Git baseline;
- bounded plan status, title, Markdown, content hash, and build reread state;
- mutation and checked generations;
- structured verifier status and bounded evidence;
- whether Bash was effectively enabled in the recorded process.

It does not persist raw verifier argv, environment values, tokens, authentication headers, tool inputs, or the process environment. Only the verifier command hash is retained.

A restored `running` verifier is converted to `cancelled` with an interruption reason so a prior process crash cannot leave permanently stale running evidence. A changed current-process verifier command resets evidence to `pending`.

### Verifier lifecycle

The verifier is spawned directly with `shell: false` in the canonical guard root. Output retained in memory is capped across stdout and stderr. Execution has a fixed timeout and explicit cancellation.

On POSIX systems, the verifier runs in a detached process group. Cancellation sends `SIGTERM` to the group and escalates to `SIGKILL` after the grace period. On Windows, process-tree termination uses `taskkill`, with forced tree termination as the escalation path. Detached verifier PIDs are also registered with Pi's existing shutdown tracking.

`session_shutdown` clears pending mutation authorizations, aborts an active verifier, and waits for its completion before extension teardown proceeds. This covers quit, reload, session replacement, resume, and fork teardown paths.

### Mutation generations

A tool call is counted only when:

1. it is an authorized `edit` or `write` call;
2. the matching `tool_result` carries the same tool-call ID;
3. the result is successful.

Failed, denied, missing, read-only, Bash, unknown, and verifier operations do not increment the generation. Every terminal verifier attempt marks its target generation checked, preventing repeated automatic runs for the same mutation generation.

### Reporting and exit behavior

`/piv-status` reports mode, root, trust, Bash state, generations, verifier configuration, terminal state, exit code, duration, and truncation. Print mode writes this report visibly to stderr.

Verifier failure, timeout, spawn error, cancellation, or untrusted blocking sets a nonzero headless process exit status. A passing verifier exits successfully.

## Validation

The focused suite validates:

- ordinary `pi` launcher isolation;
- hidden guard persistence under `piv --no-extensions`;
- strict mode and verifier argument parsing;
- default plan mode;
- exact plan/build tool sets;
- independent runtime denial of unknown tools;
- Bash mode, process flag, and trust gating;
- bundled `user_bash` guard precedence over discovered user handlers while normal inline ordering remains unchanged;
- direct mutation path traversal, sibling-prefix, protected-path, and symlink cases;
- successful-mutation-only generation accounting;
- settled automatic verification and generation deduplication;
- untrusted verifier blocking and headless failure;
- active verifier cancellation and await on session shutdown;
- stale `running` state recovery;
- non-restoration of historical Bash authority;
- pass, failure, timeout, cancellation, spawn error, and bounded-output status mapping;
- real POSIX process-group cleanup with a SIGTERM-resistant descendant.

Validation commands and expected outcomes:

```text
cd packages/coding-agent
pnpm exec vitest run test/piv-safe-verify.test.ts test/suite/regressions/6260-inline-extension-naming.test.ts
# 2 files passed; 22 tests passed

cd ../..
npm run check
# exit 0: Biome, dependency checks, import checks, shrinkwrap, install lock, TypeScript, browser smoke

git diff --check
# exit 0

git status --short -- agent_references
# no output
```

CLI smoke coverage includes:

- malformed `--piv-mode` rejected with exit 1;
- non-JSON shell-string `--piv-verify` rejected with exit 1;
- stock `pi --help` does not expose Pi Void flags;
- `piv --no-extensions --help` still exposes bundled Pi Void flags;
- default `/piv-status` is visible in print mode and reports `Mode: plan`;
- passing manual verifier exits 0;
- failing manual verifier is visible and exits 1.

## Agent-assisted review

A read-only Guardrails agent reviewed the implementation after the initial validation. It identified four commit blockers:

- direct-child-only verifier termination;
- missing session-shutdown cancellation;
- stale restored `running` state;
- missing real launcher/process-cleanup regressions.

All four were corrected and covered by focused tests. A second read-only review then identified one adjacent enforcement bypass: discovered user extensions were ordered before the bundled guard for first-result `user_bash` dispatch. A narrow application-owned inline priority was added, Pi Void's guard was marked `before-user`, and a regression proves the guard handler is first while ordinary inline extensions keep their prior ordering.

Several separate local orchestration-agent profiles could not complete because their configured local model endpoints were unavailable. They made no repository changes. A final read-only re-review was also attempted after the ordering fix, but its local model endpoint stalled and was cancelled after producing no additional finding.

## Boundary and deferred work

This is guarded execution, not a sandbox. The following remain outside Part 01 guarantees and are intentionally deferred:

- containment of opted-in Bash effects;
- filesystem TOCTOU elimination;
- operating-system or container isolation;
- network and credential isolation;
- generic policy DSLs and approval queues;
- repository-selected verifier commands;
- automatic repair or retry loops;
- worktrees, subagents, delegation, and rollback;
- event databases and durable background execution.

## Remaining integration limitation

The real model-driven sequence could not be demonstrated against the configured model endpoint because that endpoint was unavailable. The focused lifecycle test covers the same extension path from successful authorized tool call/result through `agent_settled`, real child verifier execution, terminal state persistence, and generation deduplication. A live model-driven smoke remains useful integration evidence once the model endpoint is operational, but it is not a code or type-check blocker.

## Repository and GitHub state

The Part 01 work remains local on `feat/guarded-build-v0`. No commit, push, remote branch, pull request, issue, review, or GitHub comment is created by this implementation pass.

The unrelated change in `packages/ai/src/auth/oauth/load.ts` is not part of Part 01 and remains untouched. `agent_references/` remains unchanged.

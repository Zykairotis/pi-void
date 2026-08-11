# Pi Void

## Purpose

Pi Void is an upstream-friendly Pi distribution. It retains Pi's small, inspectable, provider-agnostic agent loop while adding repository intelligence, deterministic safety, verification, recovery, long-running execution, and controlled delegation.

Pi Void is not intended to maximize feature count or reproduce OpenHands, Claude Code, Codex, OpenCode, or OhMyPi. New machinery must earn its cost through measured reliability, security, or usability gains.

Core design:

> Pi decides, reasons, routes models, and owns interaction. Pi Void constrains, records, verifies, and recovers execution.

## Current Product Shape

Implemented today:

- `pi` remains upstream-compatible Pi.
- `piv` is Pi Void entry point.
- `piv` refreshes models from an OpenAI-compatible local endpoint on every normal launch. A valid cached catalog starts immediately while refreshing in the background; a cold launch waits once for its initial catalog, and explicit offline or metadata-only commands do not start network work.
- Endpoint model metadata drives model selection and limits.
- Last valid model catalog remains usable if endpoint is unavailable.
- API credentials remain in user configuration and never enter Git.
- Auto-compaction triggers at a configurable percentage of the selected model's context window, defaulting to 85%; compaction summary budgeting remains configured separately.
- An optional deterministic Blackhole compaction extension can own mid-run triggering with resume/pause behavior and percentage or absolute token thresholds; observational memory remains opt-in and is not part of the default profile.
- `piv` loads the hidden `piv-cognee` extension by default. It uses the `pi-void` dataset, bounded transient recall, redacted session capture, compaction-linked remember, and optional idle/shutdown improve with `/cognee` runtime toggles; startup health probing is asynchronous so an unavailable local API does not delay or break the Pi loop.
- Cognee is a bounded derived-memory adapter, not a second session history store: recall is untrusted transient context, captured prompts, answers, and tool traces are redacted before remote storage, and compaction summaries are queued for permanent remember. Improve is an explicit extension capability, not part of Pi's core loop; unsupported server routes fail visibly without blocking Pi.
- `/cognee watch` provides a loopback-only realtime observer over capped, redacted local events. It shows agent/session identity and Cognee lifecycle without adding a second memory or session store; prompt recall also reports immediate animated activity before Pi's model request.
- The interactive theme picker includes all 98 themes from OhMyPi's pinned catalog alongside Pi's native dark and light themes.
- `piv` bundles Guarded Build v0 with OMP-equivalent plan behavior through Pi-native seams: exact plan/build tool modes; repository-grounded planning questions; incremental draft/refine/propose state; scrollable Markdown review; fresh, compact, or preserved-context approval; optional planning/execution model routing; bounded convergence reminders; reopenable durable approval; mandatory approved-plan reread gating; Bash default-off; canonical direct edit/write checks; and one project-trusted settled verifier.
- `piv` loads a hidden `delegate` tool for one foreground native read-only child session. V1 uses bundled `explore`/`review` roles, fresh in-memory history by default, opt-in sanitized fork continuity from `buildSessionContext().messages`, stripped child resources, parent/role read-tool intersection, tool-boundary scope enforcement, bounded JSON results with required evidence paths, parent verification, and deterministic cancellation/timeout; stock `pi` remains unchanged.
- W9 adds explicit `--piv-mode build --piv-allow-bash --sub-yolo` host execution for confirmed foreground, durable async, batch, and review delegation paths. Default delegation remains read-only; the escape hatch gives all resolved roles the full scoped built-in tool set available to the trusted parent (`read`, `grep`, `find`, `ls`, `bash`, `edit`, and `write`), disables recovery retry, requires project trust, active parent Bash, an interactive TUI, and confirmation per launch, and states that cancellation is best-effort. Child extensions, MCP, recursive delegation, and `delegate_write` remain disabled for delegated read/review roles. Normal `delegate_write` remains worktree-isolated and mutation-scoped; explicit YOLO `delegate_write` is the separately labeled direct-parent-workspace exception with no patch artifact or rollback. This is explicitly not a sandbox: host filesystem, process, network, credentials, and descendant cleanup remain outside containment; no `--no-sandbox` mode is advertised.
- W1 adds build-only normal `delegate_write` as a separate primitive: the parent must be a clean Git worktree under `git status --porcelain=v1 -uall`, supply a full local 40-character SHA equal to current `HEAD`, and launch one foreground child in a temporary detached worktree. The child has only scoped `read`, `grep`, `find`, `ls`, `write`, and `edit`; Git metadata, Bash, network, MCP, extensions, delegation, retries, and parent integration are denied. W2 adds a trusted parent-side collector that inventories actual `git status --porcelain=v1 -z -uall` changes, reads raw `HEAD:path` and writer-worktree bytes, hashes those same bytes, and builds isolated `git diff --no-index` patches with external diff and textconv disabled. It accepts only regular UTF-8 text additions/modifications, rejects deletes, ignored paths, symlinks, gitlinks, binary data, scope escapes, and unsupported statuses, and writes immutable patch artifacts capped at 32 files and 512 KiB outside both worktrees without writing Git objects. Only `completed` writers receive a patch reference; W2 is frozen. W3 adds one parent-owned `integrateWriterPatchArtifact()` entry point with immutable artifact expectation snapshots, clean `HEAD`/worktree/index preconditions, exact preimage checks, checked non-fuzzy apply, required parent verification, post-verifier postimage/status validation, and compare-and-swap rollback that restores safe paths while raising explicit integration/rollback conflicts instead of overwriting newer state; W3 is frozen at this narrow optimistic-concurrency boundary, which is not literal atomic filesystem compare-and-swap without OS/repository locking. W4 adds three stateless parent-facing build tools around these frozen APIs: `inspect_writer_patch` validates a genuine W2 production artifact and returns capped metadata/preview; `reject_writer_patch` records only the current non-durable parent decision; and `integrate_writer_patch` requires a trusted build session and configured `--piv-verify` before calling W3. Artifact provenance is canonical `<agentDir>/artifacts/writer/<runId>/proposal.patch` equality, with regular-file, exact-byte/hash, schema, and inventory checks. No merge, rebase, commit, or conflict-resolution workflow is included. W5 adds a provider-free end-to-end adversarial writer gate and an explicit `W5_LIVE=1` manual dogfood harness for `cx/luna` and `cmc/deepseek`. W6 observability and TUI are implemented through the observatory store, bounded progress snapshots, tool render hooks, and switchable `/agents` and `/subagents` full-transcript or parent/child split views that reuse Pi's interactive message/tool components; live provider certification remains separate from default tests/checks.
- W7.1 adds one owner-scoped durable asynchronous read-only job through `delegate_async`, `inspect_subagent_job`, and `cancel_subagent_job`: append-only session snapshots, independent cancellation, bounded verified-result projection, safe-boundary metadata notices, owner-only inspection/cancellation, restart interruption without relaunch, and terminal retention. W7.2 extends the same registry with bounded active concurrency, FIFO durable queue admission, owner aggregate planned-output reservations, deterministic queued cancellation, persistence-before-promotion, and queue/budget inspection metadata. W8.1 adds metadata-only owner-scoped durable job sections to the read-only `/agents` and `/subagents` overlays through a non-authoritative registry subscription and sanitized projection; no job actions, polling loop, result bodies, or scheduler changes are included. W8.2 adds one explicit configurable read-only inspect action for terminal BACKGROUND RECENT rows, calling the existing owner-scoped `inspect(jobId)` API and rendering only an ephemeral bounded result projection; it does not mutate session state or parent context. W8.3 adds a frozen noninteractive COMPLETION INBOX section derived once per overlay open from persisted `piv-subagent-job-completion` metadata intersected with current owner-scoped retained terminal jobs; inbox rows are metadata-only and not selectable. W8.4 adds owner-local live child-session registration and switchable full/split transcript views in the same overlays; attachment never steers, mutates, ingests results, or replaces the foreground Pi loop. The foreground runner remains unchanged. Background batch facades, background writers, auto-resume, steering/priority, TUI cancellation and queue-management authority, result ingestion, and live inbox state remain deferred.
- Phase B1 adds the typed sibling-only `delegate_batch` fanout over the same `runResolved()` executor: at most 8 read-only tasks, default concurrency 2, hard maximum 4, fresh sessions, independent scopes, parent-owned reservations over complete JSON report bytes, observed terminal output accounting, bounded `totalBudgetBytes`, deterministic result ordering, aggregate usage, and cancellation/timeout. Phase B2 adds typed `review_batch` orchestration over that scheduler for correctness, security, tests, and regression dimensions, with independently verified structured findings and contradiction preservation. Every child launch strictly uses the current parent `Model` object; durable async jobs capture it at acceptance time. Request, profile, imported-pack, and reviewer-policy model routing is not supported. Phase B4 adds one parent-owned typed launch preflight for both batch APIs plus a bounded model-visible digest; it composes resolved contracts and existing validation before worker launch. Phase B5 adds one immutable typed context-packet path for legacy text and explicit parent-selected items; packet content is untrusted handoff data and metadata only reaches preflight. Phase B6.1 adds opt-in `fresh | fork` mode: fork sanitizes only `buildSessionContext().messages` into a frozen, redacted, UTF-8-bounded snapshot, keeps the child fresh, and enforces a combined packet/fork handoff budget. Phase B7.1 is frozen: bounded same-model transient recovery across all delegation facades: two total attempts, explicit typed retry classification, immutable request/context reuse, aggregate usage, and attempt provenance; fallback model selection remains deferred. W7.1 and W7.2 are frozen as the one-owner durable asynchronous read-only job slices; background batch facades, recursive delegation, writers, auto-resume, steering, and Hivemind remain outside this slice; W1 writer workspaces, W2 patch artifacts, W3 parent-owned patch verification/integration, and W4 parent-owned inspect/reject/integrate decisions are implemented separately.
- Plan state remains bounded and session-native rather than introducing OMP's `local://` or `xd://` artifact protocols. Fresh execution uses a durable context boundary, compact execution uses Pi's native compaction, and headless proposals remain pending until an approval-capable client acts.
- Guarded Build v0 is guarded execution, not a sandbox: opted-in Bash, custom external effects, and filesystem TOCTOU remain outside its direct-tool boundary.

Current endpoint:

```text
http://127.0.0.1:20128/v1
```

Credential location:

```text
~/.pi/agent/auth.json
```

Generated local catalog:

```text
~/.pi/agent/models.json
```

Both credential and generated catalog are runtime state, not repository source.

Everything below marked as target architecture or roadmap is not necessarily implemented.

## Target Architecture

Use a balanced hybrid, not a replacement loop:

```text
User / CI / RPC
      |
      v
Stock Pi
  provider and model registry
  minimal agent loop and core tools
  prompt, instructions, skills, sessions, compaction
  TUI, print, JSONL, RPC, and SDK surfaces
      |
      v
Pi Void extensions and services
  policy and approvals
  trace and accounting
  repository intelligence
  verification and bounded recovery
  optional workspace isolation
  optional durable tasks and delegated workers
      |
      +-- host workspace
      +-- rootless container or VM
      +-- isolated Git worktree
      +-- optional remote/OpenHands adapter
```

Pi remains the single authoritative reasoning and tool loop. Policy, tracing, verification, task state, workspaces, and recovery wrap Pi through stable hooks, launchers, adapters, and extension-owned session entries.

### Capability profiles

| Profile | Purpose | Capabilities |
|---|---|---|
| `interactive` | Fast daily terminal work | Stock Pi loop, core tools, sessions, instructions, lightweight permissions |
| `safe` | Recommended default | Interactive plus tracing, protected paths, checkpoints, and verification |
| `sandboxed` | Untrusted or unattended work | Safe plus isolated workspace, network policy, and scoped credentials |
| `autonomous` | Long-running issue-to-patch work | Sandboxed plus durable task state, recovery, CI gates, and optional delegation |

`safe` is the target default. Browser automation, MCP aggregation, remote workers, subagents, and full autonomy remain opt-in and lazy-loaded.

### Execution modes

Modes are distinct from profiles:

- `ask`: answer or inspect with no implicit mutation.
- `plan`: read-only planning; no side-effecting commands.
- `build`: approved repository mutation and verification.
- `review`: read-only review of an exact diff, commit, or worktree.
- `autonomous`: durable bounded execution under sandbox, budget, and stop gates.

Profiles define available capabilities and isolation. Modes define current permissions and stop conditions.

## Ownership Boundary

### Keep upstream-owned

Do not fork or shadow these unless an upstream limitation is demonstrated by a failing test:

- central model/tool loop
- provider and model registry
- streaming, cancellation, steering, and reasoning controls
- provider-boundary tool-call normalization
- default coding tools
- system-prompt construction
- hierarchical instructions and lazy skills
- session tree and context compaction
- TUI, print, JSONL, RPC, and SDK modes
- extension lifecycle and custom-provider registration
- model switching

### Pi Void owns

Build outside upstream-owned source paths where stable seams permit:

- capability-profile resolution
- deterministic allow/ask/deny policy
- protected-path and external-directory rules
- structured trace, provenance, usage, cost, and artifacts
- repository maps, language detection, checkpoints, and edit guards
- verifier manifests, regression baselines, and bounded repair
- workspace adapters and sandbox launchers
- durable task state, budgets, recovery, and background-job tracking
- optional flat delegation through a Pi Void-owned tool, with native read-only child sessions first, W1 worktree-isolated writers, W2 bounded patch artifacts, and W3 parent-owned verification/integration
- optional Hivemind coordination above the subagent runner: parent-as-queen scheduling, run-scoped evidence state, bounded fan-out, advisory consensus, and verified learning
- bounded derived-memory adapters such as `piv-cognee`
- headless task orchestration and evidence reports

### Optional external mechanisms

- OpenHands: workspace/runtime adapter, remote agent server, and isolation patterns
- Codex: sandbox, approval, worktree, review, and resumable-headless behavior
- Claude Code: public permission, hook, plan-mode, instruction, skill, and subagent semantics
- OpenCode: client/server sessions, role profiles, and permission patterns
- Aider and Agentless: repository maps, checkpoints, localization, and deterministic validation
- OhMyPi: content-anchored edits, optional LSP/DAP, and isolated child worktrees
- ActiveLoop Hivemind: Pi lifecycle integration plus shared trace, retrieval, summarization, and skill-learning patterns
- Ruflo: explicit hive topology, worker membership, consensus/state, and collective-coordination patterns
- Grok Build: durable goal, budget, pause, and stop-state patterns for autonomous mode
- mini-SWE-agent: minimal transparent fallback and evaluation baseline

Adapt mechanisms only. Do not copy proprietary implementation or make another harness mandatory.

## Design Principles

### 1. Upstream first

Use current upstream implementation before adding fork code. If upstream gains equivalent functionality, remove or shrink Pi Void implementation after migration testing.

### 2. Smallest stable seam

Preferred order:

1. No new feature when existing behavior suffices
2. Configuration
3. Existing extension or hook
4. Separate launcher or adapter
5. Small shared helper
6. Core-loop modification only when no stable seam exists

### 3. Exact model capabilities

Models are selected by provider and exact model ID, not vendor-specific branches. Preserve endpoint metadata when available:

| Endpoint capability | Pi model field |
|---|---|
| `contextWindow` | `contextWindow` |
| `maxOutput` | `maxTokens` |
| `reasoning` | `reasoning` |
| `vision` | `input: ["text", "image"]` |

Also retain tool-calling and structured-output support where exposed. Unsupported numeric limits remain unknown; never invent them. Provider-specific reasoning controls remain provider-specific rather than being forced into a false universal API.

Tool support is required for normal coding models. Models without reliable native tool calls may use an optional constrained shell-only profile.

Primary work, planning, compaction, and review may use their existing Pi-owned model routing. Pi Void delegated children do not add per-role routing: every child uses the exact current parent `Model` object, captured at tool launch or durable async acceptance.

### 4. Context safety

Compaction should happen before a model loses space required for its answer. The automatic trigger defaults to 85% of the selected model's context window and is user-configurable. `reserveTokens` controls the compaction summary response budget; advertised maximum output must not automatically become summary size.

Structured compaction must preserve goal, constraints, decisions, changed files, verifier failures, unresolved risks, and next steps. Compaction changes active context, not durable session history.

Repository context should be selected by relevance. Use concise file/symbol maps and lexical indexes before adding embeddings. Large outputs belong in an artifact store and enter context through capped summaries and stable paths or IDs.

### 5. Secure failure

- Never print, trace, or commit secrets.
- Write generated catalog atomically with mode `0600`.
- Bound startup refresh with timeout.
- Use last valid catalog when refresh fails.
- Establish project trust before loading repository-local executable configuration or extensions.
- Resolve gated actions to `allow`, `ask`, or `deny` with deny-first precedence and recorded provenance.
- Protect `.git`, shell profiles, agent configuration, credentials, secrets, and external directories.
- Fail closed in headless mode when approval is missing.
- Keep autonomous network access disabled or explicitly allowlisted.
- Inject only short-lived, scoped credentials required by the task.
- Require explicit policy or user approval for push, merge, release, deploy, or other external side effects.

Prompt-based permission is not a sandbox. Untrusted and unattended work requires an independent filesystem, process, network, and credential boundary.

### 6. Repository integrity

- Snapshot commit, branch, dirty state, and pre-existing changes before mutation.
- Never mix agent changes with pre-existing human changes silently.
- Validate full patches before applying any hunk.
- Reject stale edits when a file changed after it was read.
- Prefer stable contextual or content anchors over raw line numbers when evidence supports them.
- Support dry-run, task/file/hunk undo, and isolated worktrees for concurrent writers.
- Treat repository scripts and dependencies as untrusted executable content.

### 7. Verification is authoritative

A model cannot declare its own work complete.

- Projects declare versioned lint, type-check, build, unit, integration, security, and artifact checks.
- Command discovery may suggest checks but must not persist or execute untrusted scripts without policy approval.
- Run targeted checks after bounded changes and required full checks before completion.
- Compare baseline failures with final failures.
- Invalidate verification when relevant files change.
- Permit only a bounded repair loop.
- Final reports list changed files, commands, exit statuses, artifacts, known failures, and unverified assumptions.

Deterministic exit codes and observed artifacts override generated confidence.

### 8. Durable, bounded autonomy

Task objective, acceptance criteria, plan steps, attempts, budgets, verification runs, changed files, and unresolved risks live in structured state rather than prose alone.

Long-running work must support pause, resume, cancel, crash recovery, and explicit failure classes. Retry only transient, retry-safe operations. Never blindly replay interrupted non-idempotent tools.

Detect repeated actions, repeated errors, alternating loops, no changed state, and unproductive monologues. Repeated strategy failure causes replanning or escalation, not another identical call.

### 9. Controlled delegation

Delegation is optional, flat, and read-heavy first. Pi remains the authoritative parent loop; Pi Void adds delegation through a `piv`-only hidden `delegate` extension/tool rather than another planner/controller.

Target V1:

```text
Parent Pi AgentSession
  -> `delegate`
      -> Pi Void subagent manager
          -> fresh native child AgentSession
              -> SessionManager.inMemory()
              -> bundled `explore` or `review` role
              -> no extensions/skills/templates/themes/context-file discovery
              -> effective tools = parent active tools ∩ {read, grep, find, ls}
          -> typed bounded result/evidence
  -> parent verifies and synthesizes
```

Rules:

- `delegate` is loaded by `piv`, not stock `pi`.
- Existing parent mode/tool policy remains authoritative; delegation observes `pi.getActiveTools()` rather than creating separate plan/build permissions.
- V1 roles are bundled reviewed TypeScript definitions only. Phase A adds user/project role discovery only through explicit provenance, project trust, and execution-time hash revalidation.
- Child gets separate context/history and only an explicit handoff packet; the parent transcript is not cloned.
- Child resource discovery is off by default: no ambient extensions, skills, prompt templates, themes, or context files. Phase A can pass only explicitly selected, validated skills/prompts/context files.
- User context selection is rooted at `$PI_AGENT_DIR/context/`; the agent directory itself is never a context root, so `auth.json`, `oauth.json`, `models.json`, settings, and sessions cannot enter through context selection.
- Selected skill directories receive a separate exact read capability; repository scope is not widened. Selected prompt bodies are bounded and included in the explicit handoff instead of relying on disabled slash-template expansion. Selected resources are capped at 64 KiB per file and 256 KiB in aggregate.
- The parent resolves one immutable launch contract. The exact current parent `Model` object, child startup, hash revalidation, execution, verification, and returned provenance all use that contract; durable async jobs capture the model at acceptance time.
- V1 explorers/reviewers are read-only and receive no Bash, edit/write, network/MCP, Cognee/Blackhole/guard extension, credential expansion, or recursive `delegate` capability by default. Explicit `--sub-yolo` is the separately gated unsafe host-execution exception; it adds the full scoped built-in tool set available to the trusted parent, including Bash, edit, and write, but not child extensions, MCP, or recursive delegation.
- Child result is typed, bounded evidence rather than trusted authority or an injected transcript.
- Parent owns integration and verification.
- Cancellation and timeout propagate to the child and terminate the run deterministically.
- Explicit trusted configurable roles/resources are implemented as Phase A capabilities; trust grants eligibility, selection grants inclusion, and policy remains authoritative.
- Parallel read fan-out comes after single-child lifecycle and accounting are stable; use conservative bounded concurrency.
- Writers require isolated worktrees/workspaces and return observed patches/branches for parent verification, except the explicit trusted YOLO direct-parent-workspace path, which reports no isolation and requires no patch integration.
- Background workers require durable owner-scoped job state, recovery, cancellation, retention, and completion delivery; do not model them as a boolean on the foreground runner.
- No recursive delegation by default; hierarchical swarms are not a target architecture.

#### Hivemind coordination layer

After bounded parallel read workers are proven, Pi Void may add an optional Hivemind layer above the same subagent executor. The parent Pi session is the logical queen; Hivemind is deterministic scheduling, run-scoped state, evidence aggregation, and advisory consensus rather than another autonomous planner.

Target shape:

```text
Parent Pi AgentSession
  -> `hivemind` with explicit tasks/budget
      -> HivemindCoordinator
          -> sibling SubagentRuns through the same executor as `delegate`
          -> typed run-scoped EvidenceBoard
          -> contradiction/evidence-quorum analysis
      -> bounded HiveResult
  -> parent verifier remains authoritative
```

Rules:

- use a star topology first; workers do not directly spawn or message peers;
- Hivemind cannot widen worker tools, mode, scope, network, credentials, or memory access;
- consensus is advisory and never overrides deterministic verification;
- do not claim Byzantine fault tolerance merely because several LLM workers vote; correlated model failures do not satisfy a distributed BFT fault model;
- durable learning is separate from coordination: raw worker output is redacted/distilled and becomes only a candidate until verification/promotion policy accepts it;
- parent-selected recall may later feed bounded verified knowledge into worker handoffs; child direct Cognee/durable-memory access remains off initially;
- writer hives wait for isolated worktrees/workspaces and parent-owned patch verification;
- durable/background/federated hives wait for persistent owner-scoped run state and secure worker identity.

Detailed target architecture lives under `docs/hivemind/`.

Use delegation only when estimated benefit exceeds coordination, token, merge, and review cost. Primary intended uses are repository exploration, independent investigation, adversarial review, and spending a separate context window on evidence gathering without bloating the parent session. Use Hivemind only when multiple independent evidence paths or an explicit panel provide additional value over one `delegate` run.

### 10. Evidence over feature count

Evaluate stock Pi, isolated capabilities, complete Pi Void profiles, and relevant external harnesses with identical models, task inputs, repositories, runtimes, budgets, and repeated runs.

Record:

- verified task success and regressions
- wall and active time
- input, output, reasoning, and cache tokens
- reported and estimated cost separately
- turns, tool calls, and tool errors
- permission decisions and unsafe-action attempts
- recovery and failure classes
- human interventions and review burden
- exact model, provider, reasoning setting, Pi/Pi Void versions, prompt hash, tool schema versions, runtime image, and task hash

Keep native model-harness system results separate from controlled same-model harness comparisons. Preserve benchmark and scoring versions. Do not claim provider generation is deterministic.

## Required Safety Gate for Autonomous Mode

Do not describe unattended autonomy as safe until all conditions pass:

- sandbox blocks reads and writes outside approved roots
- network is disabled or explicitly allowlisted
- broad host credentials are absent
- durable task state resumes after process termination
- concurrent writers use separate worktrees
- missing approval fails closed
- interrupted side effects are not blindly retried
- stuck loops terminate, replan, or escalate
- cost, time, token, and worker limits are enforced
- mandatory verifier commands are known before execution
- baseline failures are distinguished from regressions
- completion is blocked while mandatory criteria fail
- every action and approval is reconstructable
- cancellation stops or safely detaches child work
- containers, worktrees, ports, and processes are reclaimed
- push, merge, release, and deploy require explicit approval or policy

## Target Package Boundaries

Exact package count should stay minimal. Split only when dependency or runtime boundaries justify it.

```text
packages/
  pi-void-core/        profiles, config, capability resolution
  pi-void-policy/      permissions, paths, network, redaction
  pi-void-trace/       events, accounting, artifacts, replay
  pi-void-verify/      discovery, manifests, baselines, review
  pi-void-repo/        maps, language detection, Git, edit guards
  pi-void-workspace/   local and optional isolated adapters
  pi-void-task/        state, budgets, recovery
  pi-void-delegation/  optional roles, worktrees, result contracts
  pi-void-headless/    runner, JSONL, CI, notifications
```

A narrow Pi integration extension registers hooks, tools, commands, and adapters. This layout is a target boundary map, not a requirement to create empty packages early.

## Implementation Order

### Stage 0: Measurement baseline

Add no-behavior-change instrumentation and a reproducible same-model runner. Measure prompt/tool-schema tokens, context growth, turns, tool failures, latency, usage, cost, and verifier outcomes.

### Stage 1: Safe baseline

Build first:

1. Structured event trace and provenance
2. Token, cost, and wall-time accounting
3. Deterministic allow/ask/deny policy
4. Project trust and protected paths
5. Git snapshot/checkpoint handling
6. Repository verifier manifest
7. Baseline and final verification
8. At most one bounded repair turn initially
9. Evidence-backed final report

First code-ready slice: `@pi-void/safe-verify`, implemented through Pi hooks with zero core-loop edits.

### Stage 2: Repository-scale reliability

Add repository map, language/build detection, atomic stale-safe edits, structured task state, acceptance criteria, improved compaction state, regression baselines, and read-only diff review.

### Stage 3: Isolated execution

Add workspace interface, rootless container adapter, network policy, scoped credentials, cleanup, crash recovery, and optional OpenHands adapter.

### Stage 4: Long-running execution

Add goal tracker, durable checkpoints, pause/resume/cancel, failure taxonomy, stuck detection, retry-safe recovery, background-process registry, and headless runner.

### Stage 5: Delegation

Start with the stripped foreground delegation slice defined above rather than a full multi-agent framework:

1. `piv`-only hidden `delegate` tool integrated with existing guarded-build active-tool policy.
2. Bundled TypeScript `explore` and `review` roles.
3. Fresh native child `AgentSession` + `SessionManager.inMemory()`.
4. Child resource discovery disabled (`noExtensions`, `noSkills`, `noPromptTemplates`, `noThemes`, `noContextFiles`).
5. Child effective tools derived from parent active tools and capped to `read`/`grep`/`find`/`ls`.
6. Typed handoff/result, lineage, timeout, cancellation, bounded progress, and parent verification.
7. Controlled benchmark against Pi's subprocess example before deciding whether to maintain a second runner backend.
8. Trusted configurable roles/resources are implemented as Phase A, including dedicated user context isolation, selected skill read access, explicit prompt handoff, and single-resolution launch contracts. Phase B1 bounded sibling read fanout, Phase B2 typed reviewer orchestration, Phase B3.1 deterministic cross-model reviewer routing, Phase B4 launch preflight/digest, Phase B5 selective typed context packets, Phase B6.1 sanitized fork snapshots, and Phase B7.1 bounded typed transient recovery are implemented; evaluate fallback model policy, chains, worktree-isolated writers, durable background jobs, and optional scoped child memory only with evidence.

Do not wait for full autonomous-mode infrastructure merely to prove a read-only child, but do not let the read-only slice smuggle in writer/background/autonomous assumptions either.

## Branch and Sync Model

- `upstream/main`: canonical Pi source
- `main`: clean mirror of `upstream/main`
- `void`: current upstream plus Pi Void commits
- `archive/*`: preserved historical implementations

Current historical archive:

```text
archive/pre-upstream-0.55.4-20260722
```

Sync procedure:

1. Fetch `upstream/main`.
2. Inspect upstream changes touching Pi Void seams.
3. Fast-forward mirror branch `main` to upstream.
4. Rebase or rebuild `void` from current upstream using small thematic commits.
5. Do not replay old features already implemented upstream.
6. Run focused tests, `npm run check`, build, and CLI smoke tests as required by release rules.
7. Preserve old state on an archive branch before any history-changing remote operation.

Zero conflicts cannot be guaranteed. Small commits, public extension seams, pinned compatibility assumptions, and separate packages reduce conflict frequency and rebuild cost.

## Current Pi Void Delta

Primary implementation files:

```text
packages/coding-agent/src/piv.ts
packages/coding-agent/src/piv-provider.ts
packages/coding-agent/src/piv-safe-verify.ts
packages/coding-agent/src/piv-cognee.ts
packages/coding-agent/src/piv-cognee-client.ts
packages/coding-agent/test/piv-provider.test.ts
packages/coding-agent/test/piv-cognee.test.ts
packages/coding-agent/test/piv-safe-verify.test.ts
packages/coding-agent/src/piv-subagents.ts
packages/coding-agent/test/piv-subagents.test.ts
packages/coding-agent/src/modes/interactive/theme/*.json
packages/coding-agent/docs/theme-sources.md
```

Small shared changes currently support:

- `piv` executable registration
- model-aware compaction reserve
- detection of explicit user compaction reserve
- discovery and packaging of curated built-in themes
- extension-requested graceful stop after the current tool turn

Keep this list current when fork-specific files change.

## Near-Term Roadmap

1. Finish reliable upstream synchronization and GitHub workflow authorization.
2. Add endpoint refresh observability without exposing secrets.
3. Add compatibility probes for chat completions, tools, streaming, images, reasoning, and structured output.
4. Build Stage 0 same-model instrumentation and regression runner.
5. Continue field-testing Guarded Build v0 and session-native plan approval before extracting a broader `safe` profile/package boundary.
6. Implemented and continue field-testing the narrow V1 delegation slice: `piv`-only `delegate`, bundled read-only roles, stripped native child resources, foreground execution, cancellation/timeout, typed bounded evidence, and parent verification.
7. Implemented and frozen through Phase B7.1: Phase A explicit trusted configurability, Phase B1 low-concurrency sibling read fanout, Phase B2 typed reviewer orchestration, Phase B3.1 deterministic cross-model reviewer routing, Phase B4 parent-owned launch preflight/digest, Phase B5 selective typed context packets, Phase B6.1 sanitized fork snapshots, and Phase B7.1 bounded typed transient recovery: user/project roles, deterministic precedence, source hashes, selected skills/prompts/context, no extensions, bounded `delegate_batch`/`review_batch`, parent-owned budget accounting, deterministic cancellation/results, independently verified findings, contradiction preservation, typed model provenance, resolved effective tools/scopes, bounded model-visible launch summaries, immutable explicit packet handoffs, opt-in redacted fork continuity from `buildSessionContext().messages`, same-model retry only for explicit transient classifications, aggregate attempt accounting, and immutable attempt provenance. Do not enable shared-tree writers, reviewer voting, quorum, consensus, fallback models, or automatic retry beyond the bounded B7.1 policy.
8. The B8 implementation release gate for Read-Only Subagents v1 is closed: B8.1 deterministic adversarial regressions, B8.2 pinned four-target harness correctness, and B8.3 finding-based hardening evidence are complete. The exhaustive 48 deterministic / 112 model-quality comparative matrix remains optional external certification evidence and is not required for the V1 implementation freeze. Keep parent-as-queen, explicit tasks, star topology, run-scoped evidence board, bounded aggregate budgets, and advisory evidence quorum deferred beyond the frozen V1 implementation.
9. Add verified Hivemind learning only after redaction, provenance, promotion, invalidation, and scope policy are tested. Reuse `piv-cognee` through an adapter only if it fits the contract; child direct durable-memory access remains off initially.
10. W5A writer adversarial and dogfood validation is implemented and frozen across provenance, stale/dirty parents, tampering, verifier mutation/failure, rollback conflicts, limits, cleanup, and capability denial. Treat W5B live writer certification for both corrected `cx` routes as an external production-certification gate; it does not block the V1 implementation freeze.
11. W6 Subagent Observatory/TUI is implemented and FROZEN through existing `onUpdate`, `tool_execution_update`, `renderCall`/`renderResult`, and `ctx.ui.custom()` seams. Runtime `SubagentEvent` facts remain separate from bounded sanitized presentation snapshots; JSON/RPC updates stay typed, ordinary print stays unchanged, observatory actions remain read-only, and W1-W5 semantics stay frozen. W5B remains pending as external production certification, not an implementation-freeze blocker.
12. W7.1/W7.2 durable owner-scoped read-only jobs, W8.1 metadata-only `/agents`/`/subagents` visibility, W8.2 explicit terminal-result inspection, and W8.3 frozen persisted completion-inbox metadata are implemented and frozen as bounded V2 slices. Keep job-management cancellation/retry/queue-control actions, polling, live inbox state, result ingestion, background batch facades, background writers, auto-resume, steering/priority, and Hivemind deferred. Do not add `background: true` to the foreground runner.
13. Evaluate recovery before durable autonomy. Automatic repair, generic policy rules, multi-verifier pipelines, broad sandboxing, rollback, and trace services remain separate measured capabilities rather than prerequisites hidden inside delegation.

## Explicit Non-Goals

- Rewriting Pi's core loop
- Creating a second provider SDK or model registry
- Making OpenHands, MCP, browser automation, remote services, or subagents mandatory
- Always-on planner or critic models
- Hierarchical agent swarms, recursive delegation by default, or manager/worker trees as a core architecture
- Unbounded reflection, retry, or repair loops
- Shared-write multi-agent workspaces
- Unrestricted host shell in autonomous mode
- Automatic push, merge, release, or production deployment
- Cloud-only state or telemetry
- Vector storage before retrieval benchmarks justify it
- Unbounded or unredacted permanent memory generated from arbitrary model output; the shipped adapter only queues bounded, redacted saved-compaction summaries when enabled
- Self-modifying tools, policies, prompts, or harness code without review and held-out regression gates
- Dozens of always-visible tools
- Heavy task databases while append-only session and filesystem journals suffice
- Feature parity with every competing harness
- Hardcoded model lists, guessed limits, committed credentials, or generated user configuration
- Naming a harness improvement from stars, anecdotes, one benchmark version, or one model-harness pair

## Decision Rule

Every proposed feature must answer:

1. What measured failure does it fix?
2. Can current upstream Pi already do it?
3. Can configuration, extension, launcher, or adapter implement it?
4. Which profile needs it, and can it remain lazy?
5. What trust or security boundary changes?
6. What deterministic test or controlled evaluation proves benefit?
7. What token, latency, cost, and review burden does it add?
8. What makes future upstream sync harder?
9. How is it disabled or rolled back without session migration?

If answers are weak, do not build it.

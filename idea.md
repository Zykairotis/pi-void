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
- `piv` refreshes models from an OpenAI-compatible local endpoint on every launch.
- Endpoint model metadata drives model selection and limits.
- Last valid model catalog remains usable if endpoint is unavailable.
- API credentials remain in user configuration and never enter Git.
- Auto-compaction reserves space using selected model's advertised maximum output, capped at half its context window.
- The interactive theme picker includes all 98 themes from OhMyPi's pinned catalog alongside Pi's native dark and light themes.
- `piv` bundles Guarded Build v0: exact plan/build tool modes, OMP-style draft/refine/propose workflow, session-native bounded Markdown plan state, explicit interactive approval, approved-plan execution handoff and reread gating before mutation, Bash default-off, canonical direct edit/write checks, durable session state, and one project-trusted settled verifier.
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
- optional worktree-isolated delegation
- headless task orchestration and evidence reports

### Optional external mechanisms

- OpenHands: workspace/runtime adapter, remote agent server, and isolation patterns
- Codex: sandbox, approval, worktree, review, and resumable-headless behavior
- Claude Code: public permission, hook, plan-mode, instruction, skill, and subagent semantics
- OpenCode: client/server sessions, role profiles, and permission patterns
- Aider and Agentless: repository maps, checkpoints, localization, and deterministic validation
- OhMyPi: content-anchored edits, optional LSP/DAP, and isolated child worktrees
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

Per-role routing may select different models for primary work, planning, compaction, review, and optional workers, but must reuse Pi's model registry.

### 4. Context safety

Compaction should happen before a model loses space required for its answer. Default reserve derives from model metadata:

```text
reserve = min(maxOutput, floor(contextWindow / 2))
```

Explicit user configuration overrides derived reserve. Summary generation keeps its own smaller budget; advertised maximum output must not automatically become summary size.

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

Delegation is optional and read-heavy first.

- Parent supplies task, scope, constraints, output schema, budget, and stop condition.
- Child gets separate context, transcript, permissions, and model route.
- Explorers and reviewers are read-only by default.
- Writers use isolated worktrees or workspaces.
- Parent owns integration and verification.
- Concurrency, tokens, cost, wall time, and recursion are bounded.
- Cancellation propagates and successful partial results remain available.
- No recursive delegation by default.

Use delegation only when estimated benefit exceeds coordination, token, merge, and review cost.

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

Only after single-agent evaluation, add read-only explorers/reviewers, per-role routing, typed handoffs, isolated writers, concurrency budgets, and parent-side integration.

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
packages/coding-agent/test/piv-provider.test.ts
packages/coding-agent/test/piv-safe-verify.test.ts
packages/coding-agent/src/modes/interactive/theme/*.json
packages/coding-agent/docs/theme-sources.md
```

Small shared changes currently support:

- `piv` executable registration
- model-aware compaction reserve
- detection of explicit user compaction reserve
- discovery and packaging of curated built-in themes

Keep this list current when fork-specific files change.

## Near-Term Roadmap

1. Finish reliable upstream synchronization and GitHub workflow authorization.
2. Add endpoint refresh observability without exposing secrets.
3. Add compatibility probes for chat completions, tools, streaming, images, reasoning, and structured output.
4. Build Stage 0 same-model instrumentation and regression runner.
5. Field-test Guarded Build v0 and session-native plan approval before extracting a `safe` profile or package boundary; automatic repair, generic policy rules, multi-verifier pipelines, sandboxing, subagents, rollback, and trace services remain deferred.
6. Add isolated workspace only after host-mode policy and verification are measurable.
7. Evaluate recovery before durable autonomy; evaluate single-agent baseline before delegation.

## Explicit Non-Goals

- Rewriting Pi's core loop
- Creating a second provider SDK or model registry
- Making OpenHands, MCP, browser automation, remote services, or subagents mandatory
- Always-on planner or critic models
- Unbounded reflection, retry, or repair loops
- Shared-write multi-agent workspaces
- Unrestricted host shell in autonomous mode
- Automatic push, merge, release, or production deployment
- Cloud-only state or telemetry
- Vector storage before retrieval benchmarks justify it
- Silent permanent memory generated from model summaries
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

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
- optional flat delegation through a Pi Void-owned tool, with native read-only child sessions first and worktree-isolated writers later
- bounded derived-memory adapters such as `piv-cognee`
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
- V1 roles are bundled reviewed TypeScript definitions only. User/project role discovery is later and trust-gated.
- Child gets separate context/history and only an explicit handoff packet; the parent transcript is not cloned.
- V1 child resource discovery is off: no extensions, skills, prompt templates, themes, or context files. Relevant repository instructions must be passed deliberately when needed.
- V1 explorers/reviewers are read-only and receive no Bash, edit/write, network/MCP, Cognee/Blackhole/guard extension, credential expansion, or recursive `delegate` capability.
- Child result is typed, bounded evidence rather than trusted authority or an injected transcript.
- Parent owns integration and verification.
- Cancellation and timeout propagate to the child and terminate the run deterministically.
- Custom profiles/resource inheritance come after the stripped runner is proven.
- Parallel read fan-out comes after single-child lifecycle and accounting are stable; use conservative bounded concurrency.
- Writers require isolated worktrees/workspaces and return observed patches/branches for parent verification.
- Background workers require durable owner-scoped job state, recovery, cancellation, retention, and completion delivery; do not model them as a boolean on the foreground runner.
- No recursive delegation by default; hierarchical swarms are not a target architecture.

Use delegation only when estimated benefit exceeds coordination, token, merge, and review cost. Primary intended uses are repository exploration, independent investigation, adversarial review, and spending a separate context window on evidence gathering without bloating the parent session.

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
8. Then, only with evidence: trusted configurable roles/resources, bounded parallel read workers, chain composition, worktree-isolated writers, durable background jobs, and optional scoped child memory.

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
6. Prototype the narrow V1 delegation slice independently: `piv`-only `delegate`, bundled read-only roles, stripped native child resources, foreground execution, cancellation/timeout, typed bounded evidence, and parent verification. Keep it optional until controlled evaluation shows a benefit over single-agent Pi Void.
7. After the single-child slice is stable, evaluate trusted configurable roles and low-concurrency parallel read workers. Do not enable shared-tree writers.
8. Add isolated workspace/worktree support before any writer subagent; parent must verify observed patches before integration.
9. Add durable/background subagent semantics only after owner-scoped task state, recovery, cancellation, retention, and completion delivery exist.
10. Evaluate recovery before durable autonomy. Automatic repair, generic policy rules, multi-verifier pipelines, broad sandboxing, rollback, and trace services remain separate measured capabilities rather than prerequisites hidden inside delegation.

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

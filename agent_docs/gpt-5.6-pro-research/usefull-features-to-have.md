# `ice` feature specification

**Research cutoff: July 22, 2026.**

Your stated objective is not to produce the harness with the largest feature count. It is to retain Ice’s lightweight, provider-agnostic and inspectable core while adding repository intelligence, security boundaries, verification, recovery, long-running execution and controlled delegation.

The correct design is therefore:

> **A minimal Ice-controlled core with progressively enabled capability profiles—not one permanently feature-rich agent loop.**

## Recommended capability profiles

| Profile       | Purpose                       | Enabled capabilities                                                                 |
| ------------- | ----------------------------- | ------------------------------------------------------------------------------------ |
| `interactive` | Fast daily terminal coding    | Ice loop, core tools, sessions, instructions, lightweight permissions                 |
| `safe`        | Normal recommended default    | Interactive profile plus tracing, checkpoints, protected paths and verification      |
| `sandboxed`   | Untrusted or unattended work  | Safe profile plus isolated workspace, network policy and credential scoping          |
| `autonomous`  | Long-running issue-to-PR work | Sandboxed profile plus durable task state, recovery, optional subagents and CI gates |

The **safe profile** should be your default. Multi-agent execution, browser automation, MCP aggregation and full autonomous execution should remain opt-in.

---

# 1. What each reference harness contributes

| Harness            | Strongest mechanisms to adopt                                                                                                                                     | Reuse posture                                                        |
| ------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------- |
| **Ice**             | Minimal agent loop, broad model/provider support, extension events, session tree, compaction, TUI/JSON/RPC/SDK modes                                              | Preserve as the core. Ice is MIT-licensed.                            |
| **OpenHands**      | Workspace abstraction, Docker execution, agent-server separation, append-only event history, stuck detection, hooks, security policies, remote/headless execution | Adapt as external services and adapters. MIT-licensed.               |
| **Claude Code**    | Deny-first permissions, protected paths, plan mode, rich lifecycle hooks, isolated subagent contexts, scoped tools and skills                                     | Behaviorally recreate. Do not depend on proprietary internals.       |
| **Codex**          | OS-level sandboxing, approval profiles, worktrees, read-only review mode, non-interactive JSONL, parallel subagents, resumable automation                         | Adapt documented behavior; open CLI code is Apache-2.0.              |
| **OpenCode**       | Provider abstraction, fine-grained permissions, primary/subagent roles, hidden compaction agents, child sessions and client/server separation                     | Adapt selectively. MIT-licensed.                                     |
| **Aider**          | Repository maps, git-first checkpoints, automatic lint/test repair, architect/editor separation, cache-aware prompt organization                                  | Adapt repository and verification mechanisms.                        |
| **OhMyPi**         | More reliable edit surfaces, LSP and debugger integration, isolated subagent worktrees, advisor model, curated project memory and ACP                             | Optional advanced packages, not default Ice behavior. MIT-licensed.   |
| **Grok Build**     | Goal state, long-running task phases, planner/worker/verifier separation, budget accounting, stop classification and durable progress                             | Adapt only for autonomous profile. Apache-2.0 public code.           |
| **mini-SWE-agent** | Extremely transparent fallback loop, linear history, bash-only compatibility and easily replaceable environments                                                  | Keep as a conceptual fallback and evaluation baseline. MIT-licensed. |
| **Agentless**      | Explicit localization → candidate repair → validation/reranking pipeline                                                                                          | Adapt for difficult bug fixing, not as the universal loop.           |
| **Goose**          | Declarative workflow recipes, ACP/MCP interoperability, subagents and explicit security layers                                                                    | Recipes and protocol adapters should be optional packages.           |

Ice already provides a small coding loop, multiple interaction modes, provider flexibility, extensions, skills, session branching and automatic compaction. Its lack of a built-in sandbox is intentional; isolation is expected to come from a container, VM or extension.

OpenHands demonstrates the value of separating the agent from the workspace/runtime, using isolated Docker execution, lifecycle hooks and explicit stuck-pattern detection. Its SDK also supports local and remote execution without requiring the UI product. ([OpenHands Docs][1])

Claude Code’s most useful patterns are deny-first permissions, plan-only operation, protected paths, scoped hooks and subagents that carry their own prompt, context and permissions. ([Claude][2])

Codex provides strong reference designs for native sandboxing, approval profiles, machine-readable headless execution, isolated worktrees, review-only agents and bounded parallel delegation. ([ChatGPT Learn][3])

OpenCode adds useful patterns for pattern-based permissions, plan/build separation, specialized subagents, hidden context-maintenance agents and remote client/server operation. ([OpenCode][4])

Aider provides the clearest implementations of repository maps, git checkpointing and deterministic lint/test feedback. ([Aider][5])

OhMyPi adds an extensive IDE-like tool layer—including LSP, debugger integration, content-anchored editing, isolated subagent worktrees, advisor review and project memory—but its larger surface should be decomposed into optional Ice packages.

Grok Build’s public code shows a distinct long-running goal subsystem with planning, workers, verification, progress events, token budgets, persistence and stop classification. That architecture is relevant to autonomous execution but excessive for every interactive turn.

mini-SWE-agent supports the contrary lesson: a transparent linear history and minimal shell interface remain valuable for portability, debugging and model evaluation. Agentless demonstrates that explicit candidate generation and deterministic patch validation can outperform uncontrolled reactive editing for certain bug-fixing workflows.

---

# 2. Non-negotiable features

These are the features that the harness **must have**. They should not all add prompt or runtime overhead on every turn.

## A. Core loop and model layer

| Feature                                 | Required behavior                                                                                                                 |           Priority |
| --------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------- | -----------------: |
| **Single authoritative agent loop**     | Ice remains the only normal reasoning/tool loop. Policy, verification and runtime services wrap it rather than competing with it.  |                 P0 |
| **Provider-independent model registry** | Models are selected by provider and exact model ID, not by hard-coded vendor branches.                                            |                 P0 |
| **Local/open-weight model support**     | OpenAI-compatible, Anthropic-compatible, llama.cpp and other local endpoints must work without cloud services.                    |                 P0 |
| **Model capability descriptors**        | Record context size, vision, tool-calling support, reasoning controls, structured output support and provider limits.             |                 P0 |
| **Per-role model routing**              | Permit separate models for primary coding, planning, compaction, review and subagents.                                            |                 P0 |
| **Reasoning-level control**             | Support model-specific levels such as off, low, medium, high, xhigh or equivalent without pretending all providers share one API. |                 P0 |
| **Streaming and cancellation**          | Preserve token streaming, abort, steering messages and queued follow-ups.                                                         |                 P0 |
| **Tool-call compatibility layer**       | Normalize provider differences and reject malformed or truncated calls before execution.                                          |                 P0 |
| **Shell-only fallback mode**            | Models that cannot reliably produce native tool calls should still operate through a constrained textual shell protocol.          |                 P1 |
| **No duplicate LLM SDK**                | Reuse Ice’s provider/model abstraction rather than creating another parallel provider layer.                                       | Architectural rule |

Ice’s current low-level loop already supports context transformation, provider-boundary conversion, steering, follow-ups, stop hooks and sequential or parallel tool execution. Truncated tool calls are explicitly prevented from executing. Those behaviors should remain upstream-owned.

### Required routing object

Every run should resolve a model profile resembling:

```yaml
model_profile:
  provider: openai
  model: gpt-5.6-sol
  reasoning: high
  capabilities:
    tools: native
    vision: true
    structured_output: true
    context_window: discovered
  role: primary
  max_cost_usd: 8
  max_input_tokens: null
  max_output_tokens: null
```

Unsupported numeric limits must remain `null`; do not guess them.

---

## B. Instructions, skills and context

| Feature                          | Required behavior                                                                                                                 |           Priority |
| -------------------------------- | --------------------------------------------------------------------------------------------------------------------------------- | -----------------: |
| **Hierarchical instructions**    | Load global, parent-directory, repository and path-scoped instructions with explicit precedence and provenance.                   |                 P0 |
| **Instruction budget**           | Prevent instruction files from consuming unlimited context; show omitted or deferred items.                                       |                 P0 |
| **On-demand skills**             | Load skill names/descriptions cheaply and full content only when invoked or selected.                                             |                 P0 |
| **Prompt provenance**            | Record which instruction files, skills and extensions contributed to the effective prompt.                                        |                 P0 |
| **Context selector**             | Include files, symbols and outputs based on task relevance rather than continuously dumping the repository.                       |                 P0 |
| **Repository map**               | Maintain a concise file/symbol/dependency map for repository-scale navigation.                                                    |                 P0 |
| **Structured compaction**        | Summaries must preserve goal, constraints, decisions, changed files, tests, failures and next steps.                              |                 P0 |
| **Full transcript retention**    | Compaction changes active model context, not the durable event history.                                                           |                 P0 |
| **Session tree**                 | Support resume, branch, fork and navigation without destroying old histories.                                                     |                 P0 |
| **Task state outside prose**     | Plans, acceptance criteria, progress and retry counters must be structured state, not only free-form chat.                        |                 P0 |
| **Prompt-cache-aware layout**    | Put stable instructions, repo map and read-only context in cache-friendly positions where supported.                              |                 P1 |
| **Project memory**               | Store explicit, curated project facts with source and freshness metadata. Never silently treat an LLM summary as permanent truth. |                 P1 |
| **No mandatory vector database** | Begin with files, symbol indexes and structured session state. Add embeddings only after measured retrieval gains.                | Architectural rule |

Ice’s existing sessions are append-only JSONL trees with model changes, compaction entries, branch summaries and extension-defined custom entries. Its compaction format already tracks goals, decisions, progress and file activity.

Aider’s repository map is a useful reference: it represents files and important symbols rather than feeding every file into the conversation. ([Aider][6])

### Required task-state shape

```typescript
interface TaskState {
  id: string;
  objective: string;
  mode: "ask" | "plan" | "build" | "review" | "autonomous";
  status:
    | "queued"
    | "planning"
    | "executing"
    | "verifying"
    | "blocked"
    | "paused"
    | "completed"
    | "failed";
  acceptanceCriteria: AcceptanceCriterion[];
  plan: PlanStep[];
  currentStepId: string | null;
  attempts: number;
  verificationRuns: VerificationRun[];
  changedFiles: string[];
  unresolvedRisks: string[];
  budget: TaskBudget;
}
```

---

## C. Repository intelligence and editing

| Feature                           | Required behavior                                                                                      | Priority |
| --------------------------------- | ------------------------------------------------------------------------------------------------------ | -------: |
| **Typed core tools**              | Read, search, list, write, edit, patch and shell tools must have validated schemas.                    |       P0 |
| **Dynamic tool activation**       | Only expose tools needed for the current mode and model.                                               |       P0 |
| **Atomic patch application**      | Validate the whole patch before committing any portion of it.                                          |       P0 |
| **Stale-file detection**          | Refuse edits when the underlying file changed after the model read it.                                 |       P0 |
| **Content-anchored edits**        | Prefer hashes or stable contextual anchors over fragile raw line numbers.                              |       P1 |
| **Dry-run patch mode**            | Show intended changes and validation failures without modifying files.                                 |       P0 |
| **Git checkpoints**               | Snapshot or commit before agent modifications so every change is reviewable and reversible.            |       P0 |
| **Dirty-tree protection**         | Separate pre-existing human changes from agent changes.                                                |       P0 |
| **Undo and selective revert**     | Revert by task, file or hunk rather than only resetting the whole workspace.                           |       P0 |
| **Git worktrees**                 | Assign isolated worktrees to autonomous jobs and write-capable subagents.                              |       P1 |
| **LSP-backed intelligence**       | References, definitions, diagnostics and rename operations should be available as an optional package. |       P1 |
| **Debugger adapter**              | DAP integration can be offered for complex runtime debugging, but must remain optional.                |       P2 |
| **Large-output artifact store**   | Long logs and generated assets should be stored out-of-context and referenced by stable IDs or paths.  |       P0 |
| **Binary and image handling**     | Detect unsupported binary edits; expose images to vision-capable models without corrupting them.       |       P1 |
| **Repository-language detection** | Detect languages, build systems, package managers and likely verification commands.                    |       P0 |

Aider’s git integration separates existing user work from agent edits and provides immediate undo. Its lint/test cycle feeds deterministic failures back to the model. ([Aider][5])

OhMyPi’s content-hash editing, LSP operations, debugger tools and worktree-isolated subagents are useful advanced references, but should be separate packages rather than mandatory prompt surface.

---

## D. Permissions, sandboxing and trust

| Feature                            | Required behavior                                                                                                     | Priority |
| ---------------------------------- | --------------------------------------------------------------------------------------------------------------------- | -------: |
| **Project trust gate**             | Repository-local extensions, packages and executable configuration do not load before trust is established.           |       P0 |
| **Three-way permission result**    | Every gated action resolves to `allow`, `ask` or `deny`.                                                              |       P0 |
| **Hierarchical permission scopes** | Managed/global → user → project → agent → task rules with documented precedence.                                      |       P0 |
| **Deny-first semantics**           | A deny rule cannot be bypassed by a weaker allow rule or convenience mode.                                            |       P0 |
| **Pattern-based command policies** | Match command, arguments, path, host and tool—not only tool name.                                                     |       P0 |
| **Protected paths**                | Guard `.git`, shell profiles, agent configuration, secrets, credentials and IDE metadata.                             |       P0 |
| **External-directory boundary**    | Reading or writing outside the assigned workspace must be separately controlled.                                      |       P0 |
| **Workspace abstraction**          | Core code calls a workspace API instead of assuming host filesystem and shell access.                                 |       P0 |
| **Read-only profile**              | Repository exploration without writes or side-effecting commands.                                                     |       P0 |
| **Workspace-write profile**        | Writes and routine commands only inside approved workspace roots.                                                     |       P0 |
| **Container profile**              | Entire Ice worker runs in a rootless container, VM or remote isolated workspace.                                       |       P1 |
| **Network egress policy**          | Network disabled by default in unattended mode; allow domains or endpoints explicitly.                                |       P1 |
| **Credential broker**              | Prefer short-lived, scoped credentials injected only when required.                                                   |       P1 |
| **Secret redaction**               | Redact secret values from prompts, logs, traces and final reports.                                                    |       P0 |
| **Plugin and package trust**       | Packages require source, version or commit pin, checksum and declared capabilities.                                   |       P0 |
| **MCP trust boundary**             | MCP tools require independent permissions; server descriptions are not trusted policy.                                |       P1 |
| **Headless fail-closed behavior**  | An action that would require user approval must fail—not auto-approve—unless a policy explicitly authorizes it.       |       P0 |
| **Approval provenance**            | Record the matching rule, scope, reviewer and decision for every gated operation.                                     |       P0 |
| **No automatic push/merge/deploy** | These actions always require explicit policy or user approval, even after tests pass.                                 |       P0 |
| **Optional automatic reviewer**    | A model may review approval requests, but critical actions should still fail closed or require explicit human policy. |       P2 |

Claude Code and Codex both separate the permission decision from the sandbox boundary. Claude Code evaluates hooks, deny rules, permission modes and allow rules in a defined order. Codex provides read-only, workspace-write and unrestricted profiles plus interactive or automatic approval review. ([Claude][7])

OpenCode’s current permission syntax demonstrates useful command-pattern rules, per-agent overrides and explicit external-directory restrictions. ([OpenCode][4])

### Required permission decision

```typescript
interface PermissionDecision {
  decision: "allow" | "ask" | "deny";
  risk: "low" | "medium" | "high" | "critical" | "unknown";
  reason: string;
  matchedRuleId: string | null;
  scope: "managed" | "global" | "project" | "agent" | "task" | "default";
  expiresAt: string | null;
}
```

---

## E. Planning, autonomy and recovery

| Feature                      | Required behavior                                                                                                    | Priority |
| ---------------------------- | -------------------------------------------------------------------------------------------------------------------- | -------: |
| **Explicit execution modes** | `ask`, `plan`, `build`, `review` and `autonomous` have distinct permissions and stop conditions.                     |       P0 |
| **Read-only plan mode**      | Planning cannot silently edit files or execute side-effecting commands.                                              |       P0 |
| **Structured plans**         | Plans contain steps, dependencies, expected outputs and verification commands.                                       |       P0 |
| **Acceptance criteria**      | Completion is measured against explicit conditions rather than the model declaring success.                          |       P0 |
| **Goal tracker**             | Long tasks expose current phase, active step, elapsed time, budget and blockers.                                     |       P1 |
| **Step checkpoints**         | Persist state after every meaningful boundary: plan accepted, patch applied, tests run, review completed.            |       P1 |
| **Time/token/cost budgets**  | Enforce task, turn and subagent limits.                                                                              |       P0 |
| **Stuck detection**          | Detect repeated actions, repeated errors, no changed state, alternating loops and unproductive monologues.           |       P0 |
| **Failure taxonomy**         | Separate model, provider, tool, environment, permission, verification and infrastructure failures.                   |       P0 |
| **Retry policy**             | Retry only transient and retry-safe failures; use exponential backoff and maximum attempts.                          |       P0 |
| **Idempotency metadata**     | Tools declare whether retrying after interruption is safe.                                                           |       P1 |
| **Bounded repair loop**      | Verification failures may trigger a limited number of repair turns.                                                  |       P0 |
| **Strategy reset**           | Repeated failure should produce a new plan or escalate, not repeat the same call.                                    |       P1 |
| **Pause/resume/cancel**      | Long-running work can be paused, resumed and cancelled without discarding durable state.                             |       P1 |
| **Crash recovery**           | Resume from durable boundaries; never assume an interrupted provider stream or non-idempotent tool completed safely. |       P1 |
| **Background job registry**  | Track test servers, watchers and other long processes with owner, PID, ports and cleanup action.                     |       P1 |
| **Notifications**            | Notify on approval required, task blocked, verification failure or completion.                                       |       P1 |
| **Stop gate**                | Before stopping, check acceptance criteria, outstanding tasks and verification state.                                |       P0 |
| **Human escalation**         | State precisely what is blocked and what decision or credential is required.                                         |       P0 |

OpenHands implements repeated-action and repeated-error detection, monologue detection and alternating-pattern detection. ([OpenHands Docs][8])

Grok Build’s goal subsystem is a useful reference for explicit planning, execution, verification, budget and pause states.

Ice’s own durable-harness design notes correctly recognize that provider streams cannot be resumed and non-idempotent tool calls must not be blindly rerun after crashes.

### Required recovery policy

```yaml
recovery:
  provider_timeout:
    retry: true
    max_attempts: 2
  rate_limit:
    retry: true
    max_attempts: 4
    backoff: exponential
  permission_denied:
    retry: false
  verification_failed:
    retry: repair_turn
    max_attempts: 2
  interrupted_non_idempotent_tool:
    retry: false
    status: requires_review
  repeated_strategy_failure:
    action: replan_or_escalate
```

---

## F. Verification and review

| Feature                          | Required behavior                                                                             | Priority |
| -------------------------------- | --------------------------------------------------------------------------------------------- | -------: |
| **Repository verifier manifest** | Projects can declare lint, type-check, build, unit, integration and security commands.        |       P0 |
| **Automatic command discovery**  | Infer candidate commands from package files, but require confirmation before persisting them. |       P0 |
| **Fast verification tier**       | Run targeted checks after each bounded change.                                                |       P0 |
| **Full verification tier**       | Run broader checks before declaring completion.                                               |       P0 |
| **Changed-file linting**         | Lint or compile only affected files where appropriate.                                        |       P0 |
| **Test selection**               | Select relevant tests first, then escalate when changes are broad or risk is high.            |       P1 |
| **Regression baseline**          | Identify failures that existed before the agent’s changes.                                    |       P0 |
| **Exit-code authority**          | Deterministic process outcomes override a model’s verbal assessment.                          |       P0 |
| **Artifact verification**        | Confirm expected files, endpoints, screenshots, schemas or outputs actually exist.            |       P0 |
| **Diff review mode**             | Run a read-only review over the exact changed diff.                                           |       P0 |
| **Prioritized findings**         | Findings include severity, confidence, file, line or symbol and evidence.                     |       P0 |
| **Separate reviewer model**      | Optionally route review to another model or context to reduce self-confirmation.              |       P1 |
| **Repair from verifier output**  | Feed concise, structured failures into the next repair turn.                                  |       P0 |
| **Verification freshness**       | Invalidate previous passes whenever relevant files change.                                    |       P0 |
| **Final quality gate**           | Do not mark complete while mandatory checks fail or remain unrun.                             |       P0 |
| **Evidence-backed final report** | Report changed files, commands, results, known failures and unverified assumptions.           |       P0 |
| **Review burden metric**         | Record how much human correction or inspection the task required.                             |       P1 |

Aider automatically feeds lint and test failures back into its repair loop. Codex provides a dedicated read-only review workflow that operates over branch, commit or working-tree diffs. ([Aider][5])

Agentless’s patch-validation and reranking stage supports the broader principle that candidate patches should be judged by reproducible evidence rather than generated confidence.

---

## G. Multi-agent and delegation

Multi-agent functionality is **required for the target architecture**, but it should not be enabled on every task.

| Feature                                | Required behavior                                                                   |       Priority |
| -------------------------------------- | ----------------------------------------------------------------------------------- | -------------: |
| **Agent-role registry**                | Define roles such as explore, test, review, frontend, security and implementation.  |             P1 |
| **Independent contexts**               | Each subagent gets a separate context window and transcript.                        |             P1 |
| **Explicit delegation contract**       | The parent specifies task, scope, constraints, expected output and stop conditions. |             P1 |
| **Per-agent models**                   | Use cheaper or local models for scans and stronger models for difficult synthesis.  |             P1 |
| **Per-agent permissions**              | Tool and path access are scoped independently.                                      |             P1 |
| **Read-only by default**               | Explorers, researchers and reviewers should not modify files.                       |             P1 |
| **Isolated writer worktrees**          | Write-capable subagents never concurrently modify the same working tree.            |             P1 |
| **Typed result schema**                | Subagents return findings, patches, test results or artifacts in structured form.   |             P1 |
| **Parent ownership**                   | The parent integrates, verifies and decides whether to accept the result.           |             P1 |
| **Concurrency limits**                 | Enforce maximum workers, model calls, tokens, cost and wall time.                   |             P1 |
| **Cancellation propagation**           | Cancelling the parent stops or safely detaches children.                            |             P1 |
| **Partial-result handling**            | Preserve successful child outputs when another child fails.                         |             P1 |
| **No recursive delegation by default** | Subagents cannot spawn unlimited descendants.                                       | P0 safety rule |
| **Read-heavy parallelism first**       | Prefer parallel exploration, tests and review before parallel code editing.         |             P1 |
| **Delegation benefit gate**            | Use subagents only when estimated benefit exceeds coordination and token costs.     |             P1 |

Both Claude Code and Codex isolate subagent contexts to keep exploration noise out of the parent context. Codex’s documentation explicitly cautions that write-heavy parallelism creates conflicts and coordination overhead. ([Claude][9])

OpenCode adds parent/child session navigation and permissions controlling which subagents may be invoked. ([OpenCode][10])

---

## H. Interfaces and extensibility

| Feature                          | Required behavior                                                                          | Priority |
| -------------------------------- | ------------------------------------------------------------------------------------------ | -------: |
| **Interactive TUI**              | Preserve Ice’s low-latency terminal workflow.                                               |       P0 |
| **Print mode**                   | One-shot command execution and clean textual output.                                       |       P0 |
| **JSONL event mode**             | Machine-readable event stream for CI and integrations.                                     |       P0 |
| **RPC mode**                     | Long-lived stdin/stdout control for embedding.                                             |       P0 |
| **TypeScript SDK**               | Native in-process control for custom applications.                                         |       P0 |
| **Headless task runner**         | Stable exit codes, artifacts and non-interactive approval behavior.                        |       P0 |
| **Lifecycle hooks**              | Before/after prompt, provider, tool, turn, compaction, task and shutdown.                  |       P0 |
| **Blocking hooks**               | Pre-execution hooks may deny or modify actions.                                            |       P0 |
| **Observational hooks**          | Post-execution hooks cannot silently roll back committed state.                            |       P0 |
| **Custom tools**                 | Typed schema, permission metadata, idempotency metadata and rendering.                     |       P0 |
| **Custom commands/UI**           | Extensions may add commands, status, dialogs and widgets without core patches.             |       P1 |
| **Skills and templates**         | Reusable workflows and prompts, loadable globally or per project.                          |       P0 |
| **Package manifests**            | Declare extension, skill, prompt, theme and dependency entry points.                       |       P0 |
| **Configuration hierarchy**      | Global, project and command-line settings with schema validation.                          |       P0 |
| **Configuration migrations**     | Versioned settings and session formats with explicit migration paths.                      |       P0 |
| **Feature profiles**             | Enable groups of functionality rather than dozens of unrelated flags.                      |       P0 |
| **Workspace adapter API**        | Local, Docker, VM, SSH and OpenHands backends implement one interface.                     |       P1 |
| **Optional client/server split** | Support remote workers without making a server mandatory for local use.                    |       P1 |
| **Optional ACP server/client**   | Allow editor integration and delegated external agents.                                    |       P1 |
| **Optional MCP client**          | Lazy-load only approved servers and tools.                                                 |       P1 |
| **Declarative workflow recipes** | Reusable task definitions for CI and recurring repository work.                            |       P1 |
| **`doctor` command**             | Diagnose providers, credentials, sandbox, tools, project trust and verifier configuration. |       P0 |

Ice already exposes lifecycle events for provider requests, prompts, turns, tools, compaction, sessions and agent settlement, along with custom tools, providers, commands, messages and persistent extension entries.

Codex’s JSONL mode and OpenCode’s attachable client/server design are useful references for headless and remote integrations. ([ChatGPT Learn][11])

Goose’s declarative recipes and optional ACP/MCP support demonstrate how portable workflows can sit above the core agent without being permanently embedded in it. ([Block][12])

---

## I. Observability, replay and performance

| Feature                                 | Required behavior                                                                                                   | Priority |
| --------------------------------------- | ------------------------------------------------------------------------------------------------------------------- | -------: |
| **Structured event trace**              | Every user message, provider turn, tool call, approval, patch and verifier result is ordered and timestamped.       |       P0 |
| **Model provenance**                    | Exact provider, model ID, reasoning level and relevant parameters.                                                  |       P0 |
| **Harness provenance**                  | Ice version, `ice` version, plugin versions and source commits.                                                  |       P0 |
| **Prompt provenance**                   | Hash effective system prompt and record contributing resources.                                                     |       P0 |
| **Tool provenance**                     | Record tool implementation, schema version and permission metadata.                                                 |       P0 |
| **Token accounting**                    | Input, output, cache read/write and tool-generated model usage when available.                                      |       P0 |
| **Cost accounting**                     | Report provider-reported cost separately from estimated cost.                                                       |       P0 |
| **Wall-time accounting**                | Per provider turn, tool, verifier, subagent and task.                                                               |       P0 |
| **Tool error metrics**                  | Validation, execution, timeout, permission and environment errors.                                                  |       P0 |
| **Diff and artifact capture**           | Persist final patch, intermediate checkpoints and verifier outputs.                                                 |       P0 |
| **Deterministic replay**                | Replay deterministic tools and recorded fixtures where possible; do not claim provider generation is deterministic. |       P1 |
| **Crash bundle**                        | Produce sanitized trace, configuration, environment and last durable state.                                         |       P0 |
| **Telemetry opt-in**                    | Local traces by default; external telemetry disabled unless explicitly enabled.                                     |       P0 |
| **Prompt and tool-schema budgets**      | Measure and cap fixed tokens added before task content.                                                             |       P0 |
| **Lazy initialization**                 | Do not start containers, MCP servers, language servers or subagents until required.                                 |       P0 |
| **Startup latency budget**              | Continuously test interactive startup and first-token latency.                                                      |       P0 |
| **Output truncation policy**            | Summarize or artifact large outputs while preserving raw logs on disk.                                              |       P0 |
| **Prompt caching metrics**              | Track cache hit and miss behavior when providers expose it.                                                         |       P1 |
| **Sequential/parallel tool annotation** | Tools declare whether concurrent execution is safe.                                                                 |       P0 |
| **Evaluation runner**                   | Compare stock Ice and `ice` under identical models, tasks, budgets and repeated runs.                            |       P0 |

Ice already tracks context, usage and cost in the interactive footer and stores sessions as durable JSONL. Aider’s prompt-caching organization shows how stable prompt sections can be arranged for cache reuse.  ([Aider][13])

---

# 3. Features required before autonomous mode can be called safe

Do not advertise unattended autonomy until all of these are present:

| Requirement                  | Minimum acceptance condition                                        |
| ---------------------------- | ------------------------------------------------------------------- |
| Sandbox boundary             | Worker cannot read or write outside approved roots                  |
| Network control              | Network disabled or explicitly allowlisted                          |
| Credential isolation         | No broad host credentials mounted into the worker                   |
| Durable task state           | Task can resume after process termination                           |
| Worktree isolation           | Concurrent writers cannot touch the same worktree                   |
| Permission fail-closed       | Missing approval causes denial, not implicit allowance              |
| Idempotent recovery          | Interrupted side-effecting tools are not blindly rerun              |
| Stuck detection              | Repeated no-progress loops terminate or replan                      |
| Cost/time/token limits       | Hard enforcement, not advisory warnings                             |
| Verification manifest        | Mandatory checks are known before execution                         |
| Regression baseline          | Existing failures distinguished from new failures                   |
| Final stop gate              | Completion blocked while mandatory criteria fail                    |
| Audit trace                  | Every action and approval can be reconstructed                      |
| Cancellation                 | Parent and workers can be stopped without orphaning processes       |
| Cleanup                      | Containers, worktrees, ports and background processes are reclaimed |
| Push/merge/deploy protection | External side effects need explicit policy or human approval        |

---

# 4. Advanced features that should remain optional

These are valuable, but they are **not default must-haves** for normal interactive coding:

| Optional capability                 | Enable when                                                       |
| ----------------------------------- | ----------------------------------------------------------------- |
| LSP symbol operations               | Repository navigation and refactoring benefit materially          |
| Debug Adapter Protocol              | Runtime debugging is frequent                                     |
| Browser automation                  | Frontend or web workflow tasks require it                         |
| Screenshot comparison               | Visual acceptance tests exist                                     |
| Device automation                   | Mobile or cross-platform UI validation is required                |
| MCP aggregation                     | External data sources cannot be exposed cleanly through CLI tools |
| ACP external-agent delegation       | Editor or agent interoperability is required                      |
| Automatic approval reviewer         | Human approval load is excessive and policy has been evaluated    |
| Persistent project memory           | Facts can be explicitly curated and invalidated                   |
| Vector retrieval                    | Repository-map and lexical retrieval have measured recall gaps    |
| Parallel write agents               | Work can be partitioned into non-overlapping modules or worktrees |
| Advisor model                       | Independent review shows measurable regression reduction          |
| Remote agent server                 | Jobs need to outlive the local client                             |
| Kubernetes worker pool              | Throughput requires distributed execution                         |
| Collaborative sessions              | Multiple humans need simultaneous control                         |
| Deterministic browser/device replay | End-to-end flows must run in CI without an LLM                    |

---

# 5. Features not to build

These should be explicitly rejected unless later evidence overturns the decision:

1. **A rewritten Ice core loop.** It creates upstream conflict and duplicates a functioning abstraction.
2. **A second provider SDK.** Add adapters to Ice’s registry instead.
3. **Mandatory OpenHands.** OpenHands should be one workspace backend, not a dependency of every Ice invocation.
4. **Mandatory MCP.** CLI tools and skills are simpler for many workflows.
5. **Mandatory subagents.** Most small tasks do not justify extra contexts and cost.
6. **An always-on planner model.** Plan only when task complexity warrants it.
7. **An always-on critic model.** Deterministic tests should remain the first verifier.
8. **Unbounded self-reflection or repair loops.**
9. **Shared-write multi-agent workspaces.**
10. **Automatic git push, merge, release or production deployment.**
11. **Host-level unrestricted shell in autonomous mode.**
12. **Cloud-only state or telemetry.**
13. **A vector database before retrieval benchmarks justify it.**
14. **Silent permanent memory generated from model summaries.**
15. **Self-modifying tools, policies or prompts without review.**
16. **Dozens of tools always present in the model prompt.**
17. **Browser and GUI automation in the default coding profile.**
18. **A separate heavyweight task database when append-only session state is sufficient.**
19. **Automatic retries of unknown or non-idempotent side effects.**
20. **Feature parity with every competitor as a product objective.**

---

# 6. Recommended package architecture

Keep nearly all additions outside upstream Ice-owned files:

```text
packages/
├── ice-void-core/
│   ├── profiles/
│   ├── config/
│   └── capability-resolution/
├── ice-void-policy/
│   ├── permissions/
│   ├── protected-paths/
│   ├── network-policy/
│   └── secret-redaction/
├── ice-void-trace/
│   ├── event-schema/
│   ├── usage-accounting/
│   ├── artifacts/
│   └── replay/
├── ice-void-verify/
│   ├── command-discovery/
│   ├── verifier-manifest/
│   ├── regression-baseline/
│   └── review/
├── ice-void-repo/
│   ├── repository-map/
│   ├── language-detection/
│   ├── git-checkpoints/
│   └── edit-guards/
├── ice-void-workspace/
│   ├── local/
│   ├── docker/
│   ├── ssh/
│   └── openhands/
├── ice-void-task/
│   ├── state/
│   ├── planner/
│   ├── budgets/
│   └── recovery/
├── ice-void-delegation/
│   ├── agent-registry/
│   ├── worktrees/
│   ├── result-contracts/
│   └── scheduler/
└── ice-void-headless/
    ├── runner/
    ├── jsonl/
    ├── ci/
    └── notifications/
```

Ice integration should be one narrow extension package:

```text
.ice/extensions/ice/
├── index.ts
├── register-tools.ts
├── register-hooks.ts
├── register-commands.ts
└── adapters.ts
```

---

# 7. Recommended implementation order

## Stage 1 — Safe baseline

Build first:

1. Structured event trace
2. Token, cost and wall-time accounting
3. Allow/ask/deny policy
4. Project trust and protected paths
5. Git checkpoints
6. Repository verifier manifest
7. Automatic lint/test/build execution
8. One bounded repair turn
9. Final evidence report

This stage creates measurable value without changing Ice’s reasoning loop.

## Stage 2 — Repository-scale reliability

Add:

1. Repository map
2. Language/build-system detection
3. Atomic and stale-safe edits
4. Structured task state
5. Acceptance criteria
6. Improved compaction
7. Regression baseline
8. Read-only review mode

## Stage 3 — Isolated execution

Add:

1. Workspace interface
2. Rootless Docker adapter
3. Network policy
4. Scoped credentials
5. Cleanup and crash recovery
6. Optional OpenHands workspace adapter

## Stage 4 — Long-running autonomy

Add:

1. Goal tracker
2. Durable checkpoints
3. Pause/resume/cancel
4. Failure taxonomy
5. Stuck detection
6. Retry-safe recovery
7. Background-process registry
8. Headless CI runner

## Stage 5 — Delegation

Add only after single-agent evaluation:

1. Read-only explore and reviewer agents
2. Per-role model routing
3. Typed handoff results
4. Worktree-isolated writer agents
5. Concurrency and budget limits
6. Parent-side integration and verification

---

# Final checklist

A serious `ice` release should not be considered complete unless it has:

* [x] Ice-controlled minimal loop
* [x] Multi-provider and local-model support
* [x] Model capability profiles
* [x] Hierarchical instructions and lazy skills
* [x] Repository map
* [x] Atomic, stale-safe editing
* [x] Git checkpoints and undo
* [x] Durable session tree
* [x] Structured compaction
* [x] Separate structured task state
* [x] Ask/plan/build/review modes
* [x] Deny-first permission engine
* [x] Project trust and protected paths
* [x] Workspace/sandbox abstraction
* [x] Network and credential controls
* [x] Lifecycle hooks
* [x] Structured trace and provenance
* [x] Token, cost and time budgets
* [x] Deterministic verification
* [x] Regression detection
* [x] Bounded repair
* [x] Stuck detection
* [x] Crash-safe recovery
* [x] Machine-readable headless mode
* [x] Final evidence-backed report
* [x] Explicit protection against push, merge and deployment
* [x] Optional isolated subagents
* [x] Upstream Ice compatibility through extensions and composition

The core differentiator should be:

> **Ice’s inspectable model/tool loop, combined with deterministic safety, state and verification outside that loop.**

That is a stronger design than reproducing either OpenHands’ full platform weight or OhMyPi’s entire tool surface inside every invocation.

[1]: https://docs.openhands.dev/sdk?utm_source=chatgpt.com "Software Agent SDK - OpenHands Docs"
[2]: https://code.claude.com/docs/en/hooks?utm_source=chatgpt.com "Hooks reference - Claude Code Docs"
[3]: https://learn.chatgpt.com/codex/agent-configuration/subagents "
  Subagents | ChatGPT Learn
"
[4]: https://opencode.ai/docs/agents/?utm_source=chatgpt.com "Agents | OpenCode"
[5]: https://aider.chat/docs/usage/lint-test.html?utm_source=chatgpt.com "Linting and testing | aider"
[6]: https://aider.chat/docs/repomap.html?utm_source=chatgpt.com "Repository map | aider"
[7]: https://code.claude.com/docs/en/agent-sdk/permissions?utm_source=chatgpt.com "Configure permissions - Claude Code Docs"
[8]: https://docs.openhands.dev/sdk/guides/agent-stuck-detector?utm_source=chatgpt.com "Stuck Detector - OpenHands Docs"
[9]: https://code.claude.com/docs/en/subagents?utm_source=chatgpt.com "Create custom subagents - Claude Code Docs"
[10]: https://dev.opencode.ai/docs/agents/?utm_source=chatgpt.com "Agents | OpenCode"
[11]: https://learn.chatgpt.com/codex/non-interactive-mode "
  Non-interactive mode | ChatGPT Learn
"
[12]: https://block.github.io/goose/?utm_source=chatgpt.com "goose | Your open source AI agent"
[13]: https://aider.chat/docs/usage/caching.html?utm_source=chatgpt.com "Prompt caching | aider"

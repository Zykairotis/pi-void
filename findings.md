# Pi Void Subagent Research Findings

_Last updated: 2026-08-08_

## Executive conclusion

Pi Void can add subagents without adding a second agent framework or replacing Pi's authoritative loop.

The strongest design is:

- expose delegation through one Pi Void-owned `delegate` tool loaded only by `piv`;
- keep the parent `AgentSession` authoritative for decomposition, mode/policy, integration, verification, and user-facing completion;
- create each child as a fresh native `AgentSession` with an in-memory history and explicit model/tool scope;
- start with only bundled foreground read-only `explore` and `review` roles;
- disable child extensions, skills, prompt templates, themes, and context-file discovery in V1 so the worker runtime is intentionally small and predictable;
- derive child tools from the parent's currently active tools intersected with the role/runtime allowlist;
- return a compact typed result instead of copying the child transcript into the parent;
- propagate cancellation and hard budgets;
- make custom profiles, parallel fan-out, writers/worktrees, recursion, and background jobs later capability layers rather than MVP defaults.

The local references agree on the important invariants even though their implementations differ: **isolate context, narrow permissions, track lineage, bound execution, treat child output as evidence, and keep mutation integration parent-owned**.

The current Pi Void tree already contains enough native primitives for a strong foreground MVP. In particular, `createAgentSession({ tools })` supplies an actual tool allowlist, `SessionManager.inMemory()` can provide a clean child history, `AgentSession.subscribe()` exposes lifecycle events, and `AgentSession.abort()/waitForIdle()` provide a deterministic cancellation boundary. The existing subprocess subagent example remains useful as a compatibility and process-isolation reference, but it is not the only viable execution path.

---

## Current repository state relevant to this work

- Active branch inspected: `void`.
- Subagent implementation has **not** been started in this planning pass.
- Existing unrelated/concurrent changes in PIV provider, model-store, Cognee, tests, and planning files must be preserved.
- Local reference roots:
  - `agent_references/oh-my-pi`
  - `agent_references/opencode`
  - `agent_references/ii-agent`
  - `agent_references/claw-code`
  - `agent_references/openhands`
- Pi's own compatible example:
  - `packages/coding-agent/examples/extensions/subagent/index.ts`
  - `packages/coding-agent/examples/extensions/subagent/agents.ts`
  - `packages/coding-agent/examples/extensions/subagent/README.md`

No reference implementation should be copied wholesale. The useful target is a Pi Void-native contract built from the common safety/lifecycle patterns.

---

# 1. What Pi Void already has

## 1.1 Native child-session construction

`packages/coding-agent/src/core/sdk.ts` exposes `createAgentSession()` and supports the controls needed for a child runtime:

- explicit `cwd`;
- explicit model and thinking level;
- `SessionManager` injection;
- a `tools` allowlist;
- an `excludeTools` denylist;
- `noTools` modes;
- custom tools;
- a custom `ResourceLoader`;
- shared or separately constructed `ModelRuntime` and settings.

Important detail: when `tools` is supplied, it is not merely an initial UI selection. The SDK passes it to `AgentSession` as `allowedToolNames`; `AgentSession` filters built-in, extension, and custom tools against that allowlist when rebuilding the registry. This is the right primitive for child capability narrowing.

## 1.2 Clean child history

The SDK example in `core/sdk.ts` already demonstrates `SessionManager.inMemory()`. For a foreground worker this gives the child an independent history without creating a durable user session by default.

This directly supports the desired rule:

> inherit selected resources and task context, not the parent's full conversation transcript.

## 1.3 Lifecycle and cancellation

`AgentSession` already provides:

- `subscribe(listener)` for session events;
- `prompt()` for execution;
- `abort()` for current work;
- `waitForIdle()`;
- `isIdle`;
- model switching through `setModel()`;
- tool control through `setActiveToolsByName()`.

Internally, Pi already propagates abort signals through agent requests, compaction, retries, bash, and extension tool execution. A subagent layer should compose with this machinery rather than inventing a parallel cancellation system.

## 1.4 Tool registration seam

Pi extensions can `registerTool()`, and tool execution receives an `AbortSignal` plus progress callback. That means Pi Void can expose a parent-side delegation tool while keeping child execution in a separate module.

Recommended ownership boundary:

```text
Pi parent AgentSession
    -> hidden Pi Void `delegate` extension/tool
        -> SubagentManager / SubagentRunner
            -> fresh native child AgentSession
                -> in-memory child history
                -> strict read-only tool allowlist
                -> no extension/skill/template/theme/context-file discovery
                -> child result envelope
        -> parent verification/integration
```

The `delegate` extension should be loaded from `piv.ts`, not added to stock `pi`. Pi Void's existing guarded-build mode remains the parent policy authority: `pi.getActiveTools()` supplies the current parent tool set, and the child receives only the intersection of that set with the role/runtime allowlist. This preserves Pi's loop/session authority and avoids a second permission universe.

## 1.5 Model routing

Pi Void already has a canonical model runtime/catalog and PIV provider work. A subagent profile should select a model through this existing model layer. The subagent subsystem should not implement another provider registry and should not depend specifically on the PIV provider.

---

# 2. Pi's existing subagent extension example

## Sources

- `packages/coding-agent/examples/extensions/subagent/index.ts`
- `packages/coding-agent/examples/extensions/subagent/agents.ts`
- `packages/coding-agent/examples/extensions/subagent/README.md`

## Useful patterns

The example is the best compatibility baseline for the tool UX:

- a `subagent` tool;
- named agent definitions;
- isolated child context;
- `single`, `parallel`, and `chain` modes;
- model/tool/system-prompt overrides;
- project-vs-user agent discovery;
- explicit trust confirmation for project-controlled agents;
- bounded parallelism;
- progress streaming;
- cancellation via `SIGTERM` with `SIGKILL` escalation;
- capped parent-visible output;
- usage/model/exit metadata.

## Limitations

The example launches a separate `pi` subprocess with JSONL output. That gives a useful process boundary, but it is still an example-level orchestration layer:

- context isolation is **not** filesystem isolation;
- a shared `cwd` means workers can still collide on files;
- subprocess JSONL becomes an extra protocol boundary;
- project-agent trust is explicit, but workspace mutation isolation is not provided;
- result semantics are mostly presentation-oriented rather than a durable run contract;
- background lifecycle, resume, and ownership are outside its scope.

## Pi Void decision

Preserve its simple tool semantics and trust model, but do not make subprocess orchestration the only architecture.

For the first native Pi Void implementation, prefer an **in-process child `AgentSession` backend** when the child can be built with:

1. an in-memory session;
2. a strict tool allowlist;
3. a controlled resource loader that cannot silently activate untrusted project extensions;
4. no recursive delegation tool;
5. parent-owned cancellation and timeout.

Retain a subprocess runner as a possible backend/fallback when process isolation, CLI parity, or crash containment is more important. The result contract should be backend-independent.

---

# 3. Reference implementation findings

## 3.1 Oh My Pi — strongest production task/executor reference

### Sources

- `agent_references/oh-my-pi/packages/coding-agent/src/task/index.ts`
- `agent_references/oh-my-pi/packages/coding-agent/src/task/types.ts`
- `agent_references/oh-my-pi/packages/coding-agent/src/task/executor.ts`
- `agent_references/oh-my-pi/packages/coding-agent/src/task/discovery.ts`
- `agent_references/oh-my-pi/packages/coding-agent/src/task/parallel.ts`
- `agent_references/oh-my-pi/packages/coding-agent/src/task/worktree.ts`
- async/job and registry modules under the same package for later phases.

### What is worth borrowing

- delegation is modeled as an explicit task/run contract, not an arbitrary nested prompt;
- child contexts are independent;
- discovery precedence is deterministic;
- output can be schema-validated;
- request/runtime/output budgets are explicit;
- concurrency is bounded and abort-aware;
- recursion is gated;
- partial/failure states are represented explicitly;
- isolated writer workers can produce patches/branches from worktrees;
- parent integration remains a separate concern.

### What not to copy into MVP

Oh My Pi contains machinery for durable artifacts, worktree backends, async jobs, agent registries, revival, and richer fork-specific APIs. Pi Void should borrow the contracts and failure semantics without importing the whole subsystem.

### Pi Void decision

Use Oh My Pi as the primary reference for:

- `SubagentRequest`/`SubagentResult` shape;
- budget semantics;
- bounded parallelism;
- later writer worktree isolation;
- partial result handling.

---

## 3.2 OpenCode — strongest lineage and permission reference

### Sources

- `agent_references/opencode/packages/opencode/src/tool/task.ts`
- `agent_references/opencode/packages/opencode/src/agent/subagent-permissions.ts`
- `agent_references/opencode/packages/opencode/src/background/job.ts`
- `agent_references/opencode/packages/opencode/test/tool/task.test.ts`
- `agent_references/opencode/packages/opencode/test/permission-task.test.ts`

### What is worth borrowing

- explicit parent-child session lineage;
- foreground-by-default execution;
- named subagent type;
- model inheritance/override;
- parent-abort propagation;
- resumable task identity in later phases;
- child permissions derived from parent policy rather than inherited unrestricted;
- nested task/delegation denied by default;
- background work separated into a real job lifecycle instead of a boolean fire-and-forget mode.

### Critical negative finding

A parent-linked child session does not itself create a workspace sandbox. Session lineage and filesystem isolation must remain separate capabilities.

### Pi Void decision

Adopt:

```text
child effective capabilities = parent allowed capabilities INTERSECT profile allowed capabilities
```

A child must never gain a tool, directory, network capability, MCP, credential scope, or delegation permission that the parent did not possess.

---

## 3.3 II-Agent — strongest run/event state reference

### Sources

- `agent_references/ii-agent/src/ii_agent/agents/agent.py`
- `agent_references/ii-agent/src/ii_agent/agents/tools/task.py`
- `agent_references/ii-agent/src/ii_agent/agents/runs/events.py`
- `agent_references/ii-agent/src/ii_agent/agents/runs/models.py`
- `agent_references/ii-agent/src/ii_agent/tasks/types.py`

### What is worth borrowing

- delegation produces a run with identity and state;
- events include parent linkage and delegated origin;
- cancellation is associated with the parent/run;
- stateless/read-oriented worker patterns are explicit;
- terminal statuses are typed rather than inferred from prose;
- persistence and sandbox lifecycle are separate layers.

### Pi Void decision

Even if MVP run state is in memory, define the lifecycle as if it could later be persisted. Do not make status depend on parsing child text.

---

## 3.4 Claw Code — strongest task packet, worker health, and evidence model

### Useful sources

- `agent_references/claw-code/rust/crates/runtime/src/task_packet.rs`
- `agent_references/claw-code/rust/crates/runtime/src/task_registry.rs`
- `agent_references/claw-code/rust/crates/runtime/src/worker_boot.rs`
- `agent_references/claw-code/rust/crates/runtime/src/session_control.rs`
- `agent_references/claw-code/rust/crates/runtime/src/permissions.rs`
- `agent_references/claw-code/rust/crates/runtime/src/report_schema.rs`

### What is worth borrowing

- validate a task packet before execution;
- make objective, scope, acceptance criteria, report requirements, and escalation behavior explicit;
- distinguish ready/running/stalled/transport-dead states;
- prefer typed startup/handshake state to terminal scraping;
- evaluate hard denials before weaker permission rules;
- distinguish claims from evidence;
- attach confidence/sensitivity/provenance to reports where useful.

### Pi Void decision

Do not add Claw Code's control plane. Borrow the validation/evidence discipline for parent verification and future long-running workers.

---

## 3.5 OpenHands — secondary architecture reference

The vendored checkout is primarily Agent Canvas and points the actual current Agent/Agent Server implementation to a separate SDK repository. It contains integration-level delegation references, but the full current subagent runtime is not available locally enough to justify source-level claims.

Useful conceptual distinction only:

- agent loop;
- conversation/event state;
- workspace/sandbox provider.

Pi Void should preserve those boundaries. Do not infer a concrete OpenHands subagent API from this checkout.

---

# 4. Cross-reference synthesis

| Concern | Best local evidence | Pi Void decision |
|---|---|---|
| Simple tool UX | Pi subagent example | Keep one explicit delegation tool |
| Fresh child context | Pi example, Oh My Pi | New child session; no parent transcript cloning |
| Native session execution | Pi `createAgentSession()` | Preferred foreground backend if resource isolation is controlled |
| Process isolation | Pi subagent example | Optional backend/fallback, not the semantic contract |
| Tool restriction | Pi SDK + OpenCode | Hard allowlist; derive by intersection |
| Parent-child identity | OpenCode, II-Agent | Stable run + parent + child IDs |
| Run lifecycle | II-Agent, Claw Code | Typed state machine |
| Output/result schema | Oh My Pi, Claw Code | Compact typed envelope + artifact handle |
| Cancellation | Pi core, Pi example, OpenCode | Parent abort always propagates |
| Time/request/output budgets | Oh My Pi | Hard caps, partial result on interruption |
| Parallelism | Pi example, Oh My Pi | Bounded; later than single-child MVP |
| Recursive delegation | OpenCode, Oh My Pi | Off in MVP; depth-limited later |
| Mutation isolation | Oh My Pi | Worktree/container provider before parallel writers |
| Background jobs | OpenCode, Oh My Pi | Later only with durable lifecycle |
| Verification | Claw Code + Pi Void guarded build | Parent-owned evidence gate |
| Project-agent trust | Pi example | Explicit trust before repo-controlled profiles |

---

# 5. Recommended Pi Void architecture

## 5.1 Feature ownership

Subagents should be a **Pi Void first-class feature implemented through Pi's extension/tool seam**, not a replacement core loop.

Proposed internal layering:

```text
piv.ts
  -> loads hidden Pi Void subagent extension/factory
      -> registers `delegate`
          -> SubagentManager
              -> bundled role resolver (V1)
              -> policy/capability resolver using parent active tools
              -> NativeAgentSessionRunner
                   -> stripped child ResourceLoader
                   -> SessionManager.inMemory()
              -> result normalizer
              -> parent verification adapter

V2+ may add trusted profile discovery and an optional subprocess runner only if benchmarks justify them.
```

Candidate module layout, subject to implementation review:

```text
packages/coding-agent/src/subagents/
  types.ts
  profiles.ts
  discovery.ts
  policy.ts
  runner.ts
  native-runner.ts
  subprocess-runner.ts        # optional/later if needed
  result.ts
  events.ts
  extension.ts
```

Do not create all files merely to match this diagram. Start with the smallest separable set and split only when responsibilities become real.

## 5.2 Execution backend decision

### Preferred MVP backend: native child `AgentSession`

Benefits:

- no JSONL subprocess protocol to maintain;
- direct typed events;
- native `abort()/waitForIdle()`;
- reuse the same model runtime/catalog;
- in-memory session is straightforward;
- SDK tool allowlisting is already enforced by the child registry;
- easier deterministic unit tests.

V1 should deliberately use a stripped child resource environment rather than attempting selective inheritance:

```text
noExtensions: true
noSkills: true
noPromptTemplates: true
noThemes: true
noContextFiles: true
systemPrompt: <Pi Void bundled role prompt>
```

Consequences:

- no user extension hooks execute in the child;
- no project extension hooks execute in the child;
- `piv-cognee`, `piv-safe-verify`, Blackhole extensions, and `delegate` are not loaded into the child;
- no repository `AGENTS.md`/context file is implicitly injected into the child; relevant repository instructions must be deliberately included in the handoff if required;
- no skill or prompt-template discovery can silently widen behavior;
- child tools are an explicit `read`/`grep`/`find`/`ls` allowlist further intersected with the parent's active tools;
- no shell/Bash in V1.

This makes resource discovery a V2 feature rather than a V1 safety dependency. Tests must still verify that the loader flags and tool registry produce exactly this effective runtime.

### Optional backend: `pi` subprocess

Use when Pi Void explicitly wants:

- process crash containment;
- CLI-level parity;
- a harder process boundary;
- compatibility with external Pi agent definitions.

The public request/result/lifecycle contract should not care which backend ran the child.

---

# 6. Core contracts

The exact TypeScript names may change, but the semantics should be fixed before implementation.

## 6.1 `SubagentProfile`

```ts
interface SubagentProfile {
  name: string;
  description: string;
  systemPrompt: string;
  model?: string;
  thinkingLevel?: string;
  tools: string[];
  maxTurns?: number;
  timeoutMs?: number;
  maxOutputBytes?: number;
  allowDelegation?: boolean;
  mutationMode: "read-only" | "isolated-write";
}
```

Rules:

- role definitions describe desired capability; parent policy still caps it;
- `allowDelegation` is `false` for MVP;
- no free-form caller permission escalation field;
- a model cannot request tools for itself.

## 6.2 `SubagentRequest`

```ts
interface SubagentRequest {
  profile: string;
  task: string;
  scope?: {
    roots?: string[];
    exclude?: string[];
  };
  context?: SubagentContextRef[];
  model?: string;
  timeoutMs?: number;
  maxOutputBytes?: number;
}
```

The task must be self-contained. The parent should pass only selected context, file references, summaries, or artifacts. Never clone the entire parent transcript by default.

## 6.3 `SubagentRun`

```ts
type SubagentStatus =
  | "created"
  | "running"
  | "completed"
  | "failed"
  | "cancelled"
  | "timed_out"
  | "verification_failed";

interface SubagentRun {
  runId: string;
  parentSessionId: string;
  childSessionId: string;
  profile: string;
  status: SubagentStatus;
  startedAt?: string;
  endedAt?: string;
}
```

Terminal transitions are idempotent. A late child event after cancellation cannot turn a run back into success.

## 6.4 `SubagentResult`

```ts
interface SubagentResult {
  runId: string;
  parentSessionId: string;
  childSessionId: string;
  profile: string;
  status: SubagentStatus;
  summary: string;
  partial: boolean;
  artifacts?: SubagentArtifact[];
  evidence?: SubagentEvidence[];
  changedPaths?: string[];
  usage?: unknown;
  diagnostics?: {
    failureCode?: string;
    message?: string;
    stderrTail?: string;
  };
  verification?: SubagentVerification;
}
```

The parent-visible `summary` is bounded. If full output is retained, store it separately and return an artifact handle. Never inject an unbounded child transcript into parent context.

---

# 7. Context and memory boundary

## Parent -> child

Default transfer:

- task;
- role/system prompt;
- approved cwd/scope;
- explicitly selected file/context references;
- optional compact parent-generated handoff summary.

Do **not** transfer by default:

- full parent message history;
- parent hidden scratch state;
- unrelated retrieved memory;
- all parent tools;
- all parent extensions;
- arbitrary environment secrets.

## Child -> parent

Transfer:

- compact result summary;
- structured evidence;
- artifact handles;
- measured usage/status;
- actual changed paths only when observed by the workspace layer;
- verification outcomes.

Do not transfer:

- raw child transcript as normal parent history;
- raw internal tool logs without truncation/redaction;
- child instructions as trusted control text.

## Blackhole compaction

Each child owns its own history/compaction state. Parent and child compaction histories must never merge.

The `SubagentResult` envelope is the memory/context boundary. If a long child run compacts, only its compact final evidence/result crosses back to the parent.

Lineage metadata and terminal status should live outside compaction-sensitive natural-language content wherever practical.

## Cognee

Cognee memory should not make parent and child memory implicitly global.

MVP recommendation:

- automatic Cognee recall/write **off for children** unless explicitly enabled by a profile/policy;
- if enabled later, include `runId`/profile/session scoping;
- retrieved memory remains untrusted reference data;
- child memory access must obey the same parent capability intersection;
- never let memory results alter permissions, task mode, or delegation depth.

---

# 8. Permission model

## Invariant

A child can only lose capabilities relative to its parent.

```text
parentAllowed = pi.getActiveTools()
childEffective = parentAllowed ∩ profileAllowed ∩ runtimePolicyAllowed
```

For Pi Void V1, `piv-safe-verify` remains the source of parent mode/tool policy. The subagent extension observes the current active tool set and narrows it; it does not reinterpret plan/build state itself. This means adding `delegate` to the appropriate guarded-build tool lists is the only mode integration needed for V1.

Explicit denial wins.

Capabilities should eventually be modeled independently:

- read files;
- search/list files;
- execute shell;
- write/edit/apply patch;
- network;
- MCP/connectors;
- credentials/secrets;
- external directories;
- memory/Cognee;
- spawn subagent;
- background execution.

MVP profiles:

### `explore`

- read/search/list only;
- no Bash unless a safe read-only command layer exists;
- no edit/write;
- no network by default;
- no MCP by default;
- no delegation;
- no persistent memory write.

### `review`

- same capability floor as `explore`;
- prompt optimized for correctness, regression, security, and evidence;
- may receive explicit diff/file context;
- no mutation.

A future `build`/`writer` profile must not merely add `edit` and `write` to the shared working tree. It should require a `WorkspaceProvider` that gives an isolated worktree/container/remote workspace and returns a patch/branch/evidence bundle.

---

# 9. Role/profile strategy

## V1: bundled roles only

Do not make profile discovery part of the first release. Ship `explore` and `review` as Pi Void-owned TypeScript definitions with fixed prompts, fixed read-only tool sets, and explicit default budgets.

Reasons:

- avoids project/user profile trust and shadowing during the runner's first safety-critical iteration;
- keeps tool schemas stable;
- makes tests deterministic;
- makes the child runtime independent of repository-controlled executable/configuration resources;
- reduces the number of failure surfaces while cancellation, lineage, and result semantics are being proven.

The model may choose among allowed bundled roles, but it may not submit arbitrary system prompts or raw permission lists.

## V2: trusted configurable profiles

After the V1 runner is stable, add deterministic user/project profile discovery if measured use cases justify it.

Recommended source order:

1. Pi Void bundled profiles;
2. trusted user profiles;
3. trusted project profiles only after project trust is established.

Every non-bundled resolved profile must carry provenance:

```text
name, source, sourcePath, sourceHash, trusted
```

A project file must never silently shadow a trusted user/bundled profile. Revalidate the selected profile immediately before execution because files may change after discovery. Unknown, disabled, untrusted, or disallowed profiles fail before child creation.

---

# 10. Lifecycle, cancellation, and budgets

## State machine

```text
created -> running -> completed
                  -> failed
                  -> cancelled
                  -> timed_out
                  -> verification_failed
```

`completed` means the child finished successfully. It does **not** mean the parent accepted its claims.

## Cancellation

Parent/user abort must:

1. mark the run cancellation-requested;
2. abort the child runner;
3. wait for child idle/exit;
4. retain bounded partial output/evidence;
5. transition exactly once to `cancelled` unless a stronger terminal failure was already recorded.

For a subprocess backend, retain graceful termination followed by forced kill. For native `AgentSession`, call `abort()` and await `waitForIdle()`.

## Budgets

MVP should have hard caps for at least:

- wall-clock timeout;
- parent-visible output bytes;
- maximum active children = 1.

Add request/turn/token budgets where the native accounting surface is reliable. Budget exhaustion should produce a typed terminal/partial result, not generic text.

Do not auto-retry an interrupted child unless the failure is explicitly classified as transient and retry-safe.

---

# 11. Events and observability

The parent/TUI should not need to render the full child transcript.

Recommended bounded events:

```text
subagent_created
subagent_started
subagent_progress
subagent_tool_start
subagent_tool_end
subagent_completed
subagent_failed
subagent_cancelled
subagent_timed_out
```

Every event carries `runId`, `parentSessionId`, and `childSessionId` where available.

Progress payload should be intentionally small:

- profile;
- phase/latest operation label;
- elapsed time;
- request/token counters if known;
- capped output tail;
- no unbounded tool result body.

Later, the TUI can render a collapsible task tree. The event contract should be usable equally by interactive, JSON, and RPC modes.

---

# 12. Parent-side verification

A child is a worker, not an authority.

Before integrating a child result, the parent verifies applicable claims against actual state.

Minimum gate:

1. run ID and parent linkage match the active record;
2. terminal status is acceptable;
3. result is within schema/size limits;
4. referenced paths normalize inside allowed scope;
5. claimed files/evidence exist where applicable;
6. repository checks run against real state when required;
7. unresolved risks are retained rather than rewritten away.

For read-only workers, verification mostly means checking evidence and cited paths.

For future writers, parent verification must inspect the actual patch/branch and run required tests. Model prose must never be accepted as proof of mutation or test success.

---

# 13. MVP boundary

## Include

- one foreground child at a time;
- one Pi Void-only `delegate` tool;
- bundled TypeScript `explore` and `review` roles only;
- fresh native child `AgentSession` with `SessionManager.inMemory()`;
- `noExtensions`, `noSkills`, `noPromptTemplates`, `noThemes`, and `noContextFiles` enabled for the child;
- bundled role system prompt injected explicitly;
- strict child `read`/`grep`/`find`/`ls` allowlist intersected with `pi.getActiveTools()` and runtime policy;
- no child delegation tool;
- explicit model override through existing model catalog;
- parent-child/run IDs;
- bounded progress;
- cancellation propagation;
- wall-clock timeout;
- bounded structured result;
- parent verification step;
- unit/integration tests.

## Explicitly exclude

- autonomous swarm/planner;
- recursive agent trees;
- parallel children;
- chain mode;
- shared-tree writer agents;
- worktree merging;
- background/detached jobs;
- remote workers;
- durable database registry;
- implicit project-agent trust;
- implicit Cognee sharing;
- unrestricted Bash/network/MCP inheritance;
- full child transcript injection.

This narrow first slice is intentional. It proves the contract before adding fan-out and mutation complexity.

---

# 14. Expansion path after MVP

## Phase 2 — configurable roles, context, observability

- explicit context attachments/artifact refs;
- trusted user/project role overrides with provenance, precedence, and revalidation;
- selectively re-enable safe child resources only when a concrete use case and tests justify them;
- richer progress/event rendering;
- usage accounting;
- optional child compaction policies;
- optional scoped Cognee read access;
- continuation/resume only after run IDs are stable.

## Phase 3 — parallel and chain execution

- bounded worker semaphore;
- submitted-task cap;
- deterministic result ordering;
- partial batch results;
- abort stops new scheduling;
- chain receives only bounded previous result, never raw transcript;
- cost/usage aggregation.

Read-heavy independent tasks are the first valid fan-out use case.

## Phase 4 — isolated writer workers

Introduce a `WorkspaceProvider` abstraction:

```text
create(run) -> isolated workspace
capture(run) -> patch/branch + changed paths
cleanup(run)
```

Potential backends:

- Git worktree;
- container;
- remote workspace.

Parent owns patch inspection, tests, conflict resolution, and merge/apply.

## Phase 5 — background/durable jobs

Only after the run contract is stable:

- durable registry;
- owner-scoped cancel;
- completion notification;
- status/list APIs;
- restart recovery;
- retention policy;
- resume semantics;
- task tree UI.

Background is a lifecycle feature, not `background: true` on the MVP runner.

---

# 15. Failure modes to design against

## Context contamination

Failure: child receives too much parent transcript or dumps its transcript back.

Control: explicit handoff + compact result envelope.

## Capability escalation

Failure: child role enables Bash/network/write/delegation because those tools exist in the parent process.

Control: hard allowlist intersection and explicit deny.

## Project prompt/extension trust escalation

Failure: child `cwd` causes user/project agents, extensions, skills, templates, themes, or context files to influence execution unexpectedly.

Control in V1: disable all of those resource classes in the child loader and inject only the bundled role prompt. Project trust/profile discovery is therefore not on the V1 execution path. V2 may selectively re-enable trusted resources with provenance and tests.

## Recursive explosion

Failure: worker can call the delegation tool and fan out recursively.

Control: delegation tool absent from MVP child allowlists. Later add explicit `maxDepth`.

## Shared-tree write races

Failure: parallel agents edit the same checkout.

Control: no writers before isolated workspace provider; no parallel mutation in shared tree.

## Orphan work

Failure: parent stops while child continues.

Control: owner-scoped abort, await terminal state, shutdown cleanup.

## Output/context explosion

Failure: child returns enormous logs/transcript.

Control: bounded summary + artifact storage + truncation metadata.

## False success

Failure: child says tests passed or files changed when they did not.

Control: structured evidence + parent verification against actual state.

## Hidden cost amplification

Failure: fan-out multiplies tokens/API requests unexpectedly.

Control: single-child MVP, explicit budgets, later aggregate usage and concurrency caps.

---

# 16. Required test matrix

## MVP tests

- child session starts with empty/fresh conversation history;
- selected handoff context is present and unrelated parent history is absent;
- child loader has `noExtensions`, `noSkills`, `noPromptTemplates`, `noThemes`, and `noContextFiles` enabled;
- user/project extension hooks do not run in the child;
- `piv-cognee`, `piv-safe-verify`, Blackhole extensions, and `delegate` are absent from the child runtime;
- `tools` allowlist prevents non-role tools from entering the child registry;
- parent active-tool removal removes the same capability from the child;
- child cannot call `delegate` in MVP;
- only bundled `explore`/`review` roles resolve in V1;
- model override resolves exactly or fails clearly;
- parent cancellation reaches child and settles deterministically;
- timeout produces `timed_out`, not generic `failed`;
- partial output is marked on cancellation/timeout/truncation;
- result summary obeys byte cap;
- full child transcript is not appended to parent history;
- child failure cannot be presented as parent success;
- event ordering includes stable lineage IDs;
- child compaction/history does not mutate parent history;
- concurrent unrelated parent worktree changes remain untouched.

## Later parallel tests

- active worker cap is enforced;
- one worker failure does not erase settled sibling results;
- abort stops new scheduling;
- output ordering is deterministic;
- aggregate usage is correct.

## Later writer tests

- each writer receives a separate workspace;
- changed paths come from filesystem/Git observation, not model claims;
- patch capture works for success and partial failure;
- cleanup is idempotent;
- parent refuses unverified patch integration;
- conflicts are surfaced, never silently resolved by last writer wins.

## Later background tests

- jobs survive parent turn completion according to policy;
- owner cancellation works after reconnect;
- duplicate completion delivery is idempotent;
- restart recovery produces a valid terminal/running state;
- retention cleanup never deletes an active job.

---

# 17. Recommended first implementation sequence

1. Define `SubagentProfile`, `SubagentRequest`, `SubagentRun`, `SubagentResult`, and status/error codes.
2. Implement bundled TypeScript `explore` and `review` roles only.
3. Register a hidden Pi Void `delegate` extension through `piv.ts` and add `delegate` to the appropriate `piv-safe-verify` active-tool lists.
4. Implement capability derivation from `pi.getActiveTools()` intersected with the role/runtime allowlist.
5. Construct the V1 child loader with `noExtensions`, `noSkills`, `noPromptTemplates`, `noThemes`, and `noContextFiles`, plus an explicit bundled role system prompt.
6. Build the native `AgentSession` runner with `SessionManager.inMemory()` and the existing `ModelRuntime`.
7. Add timeout + parent abort propagation.
8. Normalize child events into bounded subagent events.
9. Produce the structured result envelope with output cap and partial-state semantics.
10. Add parent-side verification helpers.
11. Add offline unit tests and a faux-provider integration fixture, including negative tests proving disabled child resources do not execute.
12. Only after those pass, benchmark native-session versus subprocess execution and decide whether a second backend has enough value to maintain.
13. Treat custom profile discovery, selective resource inheritance, and profile trust as V2 work rather than MVP prerequisites.

---

# 18. Adjacent Pi Void systems

## Guarded build

Subagents should strengthen, not bypass, Pi Void's guarded build model.

- planning/review workers can gather evidence;
- the parent remains the approval/verification authority;
- future writer workers return isolated patches for parent review;
- no child should implicitly transition the parent from plan to build mode.

## Model catalog / PIV provider

- role model selection should use the existing model runtime/catalog;
- provider-specific implementation details stay below the subagent layer;
- a profile may request an exact model, but policy can reject or replace it;
- missing auth must fail predictably before expensive child startup.

## Blackhole

- child compaction is child-local;
- parent never consumes a raw child compaction transcript;
- only the bounded final result/evidence crosses the boundary;
- Blackhole remains compatible because it operates inside a session rather than becoming the orchestration layer.

## Cognee

Existing Pi Void Cognee work remains orthogonal. Child memory sharing must be explicit and least-privilege; the subagent runtime should work correctly with Cognee disabled.

---

# 19. Decisions now considered strong enough to lock

1. **Parent remains authoritative.**
2. **The model-facing tool name is `delegate`, and it is Pi Void-only.**
3. **Fresh native child `AgentSession` context is the default.**
4. **One foreground read-only child is the MVP.**
5. **`explore` and `review` are bundled TypeScript roles; custom profile discovery is V2.**
6. **V1 child resource discovery is off: no extensions, skills, templates, themes, or context files.**
7. **`piv-safe-verify` remains parent mode authority; child tools are derived from `pi.getActiveTools()` and narrowed by role/runtime policy.**
8. **The V1 child tool floor is only `read`, `grep`, `find`, and `ls`; no Bash, network, MCP, mutation, memory adapter, or delegation.**
9. **Tool/capability intersection is deny-first and non-escalating.**
10. **Recursive delegation is disabled in MVP.**
11. **Result is typed, bounded, and treated as evidence.**
12. **Cancellation and timeout are first-class terminal states.**
13. **Parallel fan-out waits until the single-child contract is proven.**
14. **Writer agents wait for workspace isolation.**
15. **Background work waits for durable job semantics.**
16. **Model routing reuses Pi Void's existing model runtime.**
17. **Parent/child memory and compaction remain isolated unless policy explicitly bridges them later.**
18. **The implementation preserves Pi's loop and uses extension/tool seams rather than creating a competing orchestrator.**
19. **Native `AgentSession` execution is the preferred MVP backend; subprocess execution is retained only as a reference/fallback until a benchmark proves it deserves ongoing maintenance.**

---

# 20. Open design questions for implementation, not blockers for planning

The broad V1 architecture is now locked. Remaining questions should be answered by tests/prototypes:

- Which stable session identifier should be exposed as `parentSessionId`/`childSessionId` for in-memory children?
- Should the handoff packet be rendered as one structured user message or split between explicit role system prompt plus bounded task/evidence instructions?
- Where should full-but-bounded child artifacts live if parent-visible output is truncated?
- Which usage counters are reliable enough for an MVP hard request/token budget versus observability-only accounting?
- Should child core auto-compaction inherit normal Pi settings or use a tighter worker-specific setting for long read tasks?
- After the native runner is proven, is a subprocess backend valuable enough to maintain for process isolation/CLI compatibility?
- In V2, which resource classes should be selectively re-enabled first, if any, and under what trust/provenance rules?

These questions do not change the core architecture above.

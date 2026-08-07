# Pi Void Subagent Progress

_Last updated: 2026-08-08_

## Current status

**Phase:** V1 architecture locked; implementation not started.

The reference pass and Pi Void fit analysis are complete. V1 is now intentionally smaller than the earlier draft: one Pi Void-only `delegate` tool, bundled `explore`/`review` roles, a native in-process child `AgentSession`, no child resource discovery, four read-only tools at most, foreground execution, typed bounded results, and parent verification. Remaining unknowns are implementation-level details for tests/prototypes, not architectural blockers.

## Completed

### Repository and compatibility analysis

- Confirmed the active Pi Void branch is `void`.
- Preserved existing concurrent work in PIV provider/model-store/Cognee/tests and related planning files.
- Confirmed no subagent implementation files currently exist in the active source tree.
- Identified Pi's own compatible subagent example under `packages/coding-agent/examples/extensions/subagent/`.

### Local reference inventory

Completed source-level inspection of:

- Pi subagent extension example;
- Oh My Pi task/executor/discovery/parallel/worktree and async lifecycle patterns;
- OpenCode task, subagent permissions, background job, and regression tests;
- II-Agent delegation, run/event, persistence, and sandbox boundaries;
- Claw Code task packet, task registry, worker boot, permissions, session identity, and evidence/report model;
- OpenHands local checkout, recorded as a limited architecture reference because the current agent runtime lives outside the vendored tree.

### Pi Void native runtime seams validated

Confirmed that Pi Void already exposes the primitives needed for a native child-session MVP:

- `createAgentSession()` supports explicit `cwd`, model, thinking level, tools, custom tools, resource loader, settings, and session manager;
- `tools` becomes a real `allowedToolNames` filter inside `AgentSession`, affecting built-in, extension, and custom tools;
- `SessionManager.inMemory()` can give a child a fresh non-durable history;
- `AgentSession.subscribe()` exposes typed events;
- `AgentSession.prompt()` drives a child run;
- `AgentSession.abort()` + `waitForIdle()` provide deterministic cancellation;
- Pi's agent/tool/compaction paths already use abort signals;
- the extension API exposes `pi.getActiveTools()`, so child capability derivation can reuse the parent's live Pi Void mode/tool state;
- `DefaultResourceLoaderOptions` exposes `noExtensions`, `noSkills`, `noPromptTemplates`, `noThemes`, `noContextFiles`, and explicit `systemPrompt`, which is sufficient to define a deliberately stripped V1 worker runtime;
- model selection can reuse the canonical Pi Void model runtime/catalog instead of creating a subagent-specific provider layer.

This changed the architecture recommendation from “subprocess extension is the first slice” to:

> Use a stripped native child `AgentSession` for the foreground MVP. Keep Pi's subprocess example as a benchmark/process-isolation reference, not as the default architecture.

### Architecture decisions completed

Locked the following design constraints in `findings.md`:

- parent remains authoritative;
- model-facing tool name is `delegate` and it is loaded only by `piv`;
- fresh native child `AgentSession` context by default;
- one foreground child in V1;
- bundled TypeScript roles are only `explore` and `review`;
- custom user/project role discovery is deferred to V2;
- child resource discovery is entirely disabled in V1: no extensions, skills, templates, themes, or context files;
- child capabilities are derived from `pi.getActiveTools()` intersected with role/runtime policy;
- V1 children have at most `read`, `grep`, `find`, and `ls`;
- `piv-cognee`, `piv-safe-verify`, Blackhole extensions, Bash, mutation, MCP/network, and recursive `delegate` are absent from the child runtime;
- typed run lifecycle and result envelope;
- cancellation and timeout are distinct terminal states;
- bounded output and progress;
- parent verifies child evidence;
- parallel fan-out is later;
- writer agents require isolated workspaces;
- background jobs require durable lifecycle semantics;
- parent/child memory and compaction state stay isolated.

### Documentation completed

- Reworked `findings.md` into a design document rather than a raw research log.
- Added a reference comparison table and explicit Pi Void decisions.
- Added native-vs-subprocess runner analysis.
- Added proposed contracts for profile/request/run/result.
- Added context, permission, trust, cancellation, observability, verification, memory, failure-mode, and test sections.
- Added a staged expansion path for parallelism, isolated writers, and background jobs.

## Not started

No production subagent code has been added yet.

Specifically not implemented:

- `SubagentProfile` / request / result types;
- bundled V1 role definitions;
- custom profile discovery (deferred V2);
- child policy resolution;
- native child runner;
- delegation tool;
- subagent event adapter;
- result artifact storage;
- parent verification helper;
- tests;
- parallel mode;
- writer worktrees;
- background jobs.

## Immediate next milestone

Implement and prove a **single foreground read-only child** using a stripped native `AgentSession`.

The milestone is complete only when tests demonstrate all of the following:

1. `piv` exposes `delegate` while stock `pi` does not;
2. `piv-safe-verify` controls whether `delegate` is active in the current parent mode;
3. child history is fresh and parent history is not cloned;
4. child loader disables extensions, skills, prompt templates, themes, and context files;
5. only bundled `explore`/`review` roles are accepted;
6. only `read`, `grep`, `find`, and `ls` can survive the parent/role/runtime capability intersection;
7. child cannot recursively delegate and cannot load Cognee/Blackhole/guard hooks;
8. model selection uses the existing model runtime;
9. parent cancellation stops the child and reaches a terminal state;
10. timeout is reported distinctly;
11. result output is bounded and structured;
12. full child transcript is not appended to the parent session;
13. child failure cannot be normalized into successful parent evidence.

## Implementation questions to resolve during the milestone

These are intentionally deferred from research to implementation because they require concrete tests:

- exact parent/child session ID source for in-memory children;
- exact handoff encoding between bundled role system prompt and task/evidence packet;
- location/format for full child artifacts when parent output is truncated;
- reliable usage counters for hard request/token budgets;
- whether child core auto-compaction should inherit normal Pi settings or use worker-specific bounds;
- whether the subprocess backend remains worth maintaining after the native runner is benchmarked.

Resolved and no longer open for V1:

- public tool name: `delegate`;
- role representation: bundled TypeScript definitions;
- child resource policy: disable extensions, skills, prompt templates, themes, and context files;
- custom user/project profile discovery: V2.

## Deferred milestones

### Parallel read workers

Blocked until single-child lifecycle, cancellation, and result semantics are stable.

### Writer workers

Blocked until a `WorkspaceProvider`/worktree isolation layer exists and parent-side patch verification is tested.

### Background/durable workers

Blocked until run IDs, persistence, owner-scoped cancellation, completion delivery, recovery, and retention semantics exist.

## Reference quality / provenance status

- Pi source and Pi example: directly compatible evidence.
- Oh My Pi: close fork/reference; borrow semantics, not APIs blindly.
- OpenCode: strong permission/lineage/background reference, not a workspace-isolation implementation.
- II-Agent: strong typed run/persistence model, Python-specific implementation.
- Claw Code: strong runtime control/evidence concepts, Rust-specific implementation.
- OpenHands: limited local source coverage; architecture-only reference for this pass.

No reference code has been copied into production files during this work.

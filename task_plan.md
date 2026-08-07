# Pi Void Subagent Implementation Plan

_Last updated: 2026-08-08_

## Goal

Add native subagents to Pi Void while preserving Pi's existing agent/session ownership and Pi Void's guarded-build safety model.

The first release is deliberately narrow:

> one Pi Void-only `delegate` tool that runs one foreground, read-only, non-recursive native child `AgentSession` with fresh in-memory history, no discovered child resources, at most `read`/`grep`/`find`/`ls`, deterministic cancellation, bounded typed output, and parent-side verification.

Custom profiles, selective resource inheritance, parallelism, writer agents, worktrees, background jobs, remote execution, and recursive agent trees are later milestones.

---

## Non-negotiable invariants

- Parent `AgentSession` remains authoritative for task decomposition, policy, integration, verification, and final user response.
- `delegate` is a Pi Void-owned hidden extension/tool loaded through `piv`; stock `pi` behavior stays unchanged.
- `piv-safe-verify` remains the parent mode/tool authority. The subagent layer reads the current parent tools through `pi.getActiveTools()` and only narrows them.
- Child receives a fresh `SessionManager.inMemory()` history; parent transcript is not cloned by default.
- V1 accepts only bundled TypeScript `explore` and `review` roles.
- V1 child loader disables extensions, skills, prompt templates, themes, and context files and injects only the bundled role system prompt.
- V1 child effective tools are a subset of `read`, `grep`, `find`, and `ls` and never broader than the parent's active tools.
- No Bash, mutation, network/MCP, Cognee/Blackhole/guard extension, or recursive delegation in V1 children.
- Explicit denial wins over role configuration.
- Child result is evidence, not trusted control text.
- Cancellation/timeout must settle the child; no orphan work.
- Full child output/transcript must not flood parent context.
- Writer workers must not operate concurrently in the shared checkout.
- Background execution is not introduced without a durable job contract.
- Existing PIV provider, Cognee, Blackhole, and guarded-build behavior must continue to work independently of subagents.

---

# Milestone 0 — protect the current tree

Status: **required before implementation**

- [ ] Re-read `AGENTS.md` before source edits.
- [ ] Capture current `git status` and current hashes of files to be touched.
- [ ] Confirm unrelated modified files remain out of scope.
- [ ] Do not modify vendored `agent_references/*`.
- [ ] Avoid dependency additions unless a concrete missing primitive is proven.

Acceptance:

- existing unrelated worktree changes are unchanged;
- implementation is confined to subagent-related source/tests plus minimal PIV loading/docs if required.

---

# Milestone 1 — freeze the public/internal contracts

## 1.1 Define core types

Add the smallest appropriate source module(s) for:

- `SubagentProfile`;
- `SubagentRequest`;
- `SubagentStatus`;
- `SubagentRun`;
- `SubagentResult`;
- artifact/evidence/diagnostic types;
- stable failure codes.

Required statuses:

```text
created
running
completed
failed
cancelled
timed_out
verification_failed
```

Required result properties:

- stable `runId`;
- parent/child lineage IDs;
- profile/source;
- bounded summary;
- `partial` flag;
- diagnostics;
- usage when reliable;
- evidence/artifact handles;
- verification metadata.

## 1.2 Define error taxonomy

At minimum distinguish:

- unknown profile;
- untrusted profile;
- invalid scope;
- model unavailable/auth missing;
- capability denied;
- child startup failure;
- child protocol/runtime failure;
- timeout;
- cancellation;
- output truncation;
- malformed/invalid result;
- verification failure.

Acceptance:

- no lifecycle state is inferred from free-form child text;
- terminal transitions can be implemented idempotently;
- contracts do not depend on native vs subprocess runner.

Tests:

- type/schema validation;
- invalid request rejection;
- terminal state transition unit tests.

---

# Milestone 2 — bundled V1 roles

V1 intentionally has no role/profile discovery.

## 2.1 Add bundled TypeScript roles

### `explore`

Purpose: repository discovery, architecture tracing, fact gathering, implementation localization.

Capability target:

```text
read
grep
find
ls
```

Explicitly absent:

```text
bash
edit
write
network/MCP
memory adapters
delegate
```

### `review`

Purpose: adversarial correctness/regression/security review using supplied code/diff/repository evidence.

Same capability floor as `explore`; the distinction is prompt/report contract, not higher privilege.

## 2.2 Role definition rules

Each bundled role is a static Pi Void-owned TypeScript object containing only reviewed fields such as:

```text
name
description
systemPrompt
defaultModel?
thinkingLevel?
tools
timeoutMs
maxOutputBytes
```

Do not allow the parent model to supply arbitrary child system prompts or permission lists.

Acceptance:

- exactly the intended bundled V1 roles resolve;
- unknown role fails before child creation;
- roles cannot grant tools outside policy;
- role definitions are deterministic and require no project trust or filesystem discovery.

Tests:

- bundled `explore` resolution;
- bundled `review` resolution;
- unknown role rejection;
- role tool list cannot widen runtime policy.

Deferred to V2:

- user profiles;
- project profiles;
- precedence/shadowing;
- provenance/source hashes;
- project trust and revalidation for profile files.

---

# Milestone 3 — capability/policy resolver

Implement child capability derivation as a small explicit policy function using the parent extension runtime as the source of truth:

```text
parentAllowed = pi.getActiveTools()
childEffective = parentAllowed ∩ roleAllowed ∩ runtimePolicyAllowed
```

For V1:

```text
runtimePolicyAllowed = { read, grep, find, ls }
```

## V1 rules

- `piv-safe-verify` decides the parent's current active tools; the subagent layer does not parse or duplicate plan/build policy;
- add `delegate` to the guarded-build mode tool lists where delegation should be available;
- hard child tool allowlist uses Pi's existing `createAgentSession({ tools })` / `allowedToolNames` mechanism;
- `delegate` is never in the child list;
- no write/edit/apply;
- no Bash;
- no implicit network/MCP/credential inheritance;
- scope roots normalize inside allowed repository roots;
- child cannot request a higher-privilege role dynamically.

Acceptance:

- built-in/custom tools outside the allowlist are genuinely absent from the child registry;
- if the parent does not currently have a read-only capability active, the child does not gain it;
- a role definition cannot widen capabilities;
- the subagent layer has no independent plan/build permission state.

Tests:

- parent active-tool intersection;
- tool allowlist integration test;
- child `delegate` absent;
- edit/write/Bash absent;
- invalid/outside scope rejected;
- deny precedence tests.

---

# Milestone 4 — stripped V1 child resources

This is the native-runner safety gate, and the V1 target is now explicit rather than exploratory.

Construct the child `DefaultResourceLoader` with:

```text
noExtensions: true
noSkills: true
noPromptTemplates: true
noThemes: true
noContextFiles: true
systemPrompt: <bundled role system prompt>
```

Do not pass child `extensionFactories`. Do not inherit `piv-cognee`, `piv-safe-verify`, Blackhole extensions, user extensions, project extensions, skills, templates, themes, or repository context files.

Relevant repository instructions needed by a specific task must be included deliberately in the bounded handoff packet rather than discovered implicitly.

The hard `tools` allowlist remains an independent final capability boundary even though extension/resource discovery is disabled.

Acceptance:

- child `getExtensions()` contains no loaded user/project/Pi Void extension hooks;
- child skills/prompts/themes/context-file collections are empty as intended;
- bundled role system prompt is the intended worker prompt;
- a fixture project containing extensions, skills, prompts, themes, `AGENTS.md`, and other local resources cannot alter V1 child behavior;
- tool registry still matches the explicit child allowlist.

Fallback only if these existing loader controls do not behave as documented/tested:

- reassess the native runner and benchmark the subprocess boundary while preserving the same request/result contracts.

---

# Milestone 5 — native foreground runner

Implement a `NativeAgentSessionRunner` or equivalent minimal module.

## Child construction

Use existing Pi infrastructure:

- `createAgentSession()` or `createAgentSessionFromServices()`;
- `SessionManager.inMemory()`;
- existing model runtime;
- explicit model/thinking choice;
- hard `tools` allowlist;
- constrained resource loader;
- child-specific session start metadata if useful.

## Context handoff

Construct a self-contained child prompt containing only:

- role objective/system instructions;
- task;
- approved scope;
- explicitly selected context/artifacts;
- output/report requirements.

Do not copy parent messages wholesale.

## Execution

- create `runId` before startup;
- transition `created -> running` only after valid child construction;
- subscribe to child events;
- call child `prompt()`;
- capture bounded final assistant result/evidence;
- dispose/settle the child on every path.

Acceptance:

- native child completes a faux-provider fixture task;
- parent session history is unchanged except for the parent-side delegation tool call/result;
- child session has independent history.

Tests:

- fresh history;
- prompt handoff contents;
- normal completion;
- model failure;
- child runtime failure;
- cleanup after failure.

---

# Milestone 6 — cancellation and timeout

## Parent abort

Connect the delegation tool's `AbortSignal` to the child runner.

Native behavior:

1. abort controller fires;
2. call/propagate `child.abort()`;
3. await `child.waitForIdle()`;
4. retain bounded partial output;
5. transition to `cancelled` exactly once.

## Timeout

Use a child-run timeout controller composed with the parent signal.

Timeout must produce `timed_out`, not generic `failed`.

Acceptance:

- child does not continue after parent cancellation;
- timeout settles even if the model/tool is still active;
- partial result state is preserved;
- late events cannot flip terminal state.

Tests:

- cancellation before prompt;
- cancellation during model streaming;
- cancellation during child tool execution;
- timeout;
- cancel/timeout race;
- idempotent cleanup.

---

# Milestone 7 — bounded event/progress bridge

Define Pi Void subagent events without streaming the full child transcript.

Minimum events:

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

Every event carries lineage IDs.

Progress may include:

- profile;
- latest operation label;
- elapsed time;
- request/token usage when available;
- capped output tail.

Do not include unbounded raw tool results.

Acceptance:

- interactive, JSON, and RPC consumers can eventually use the same normalized event data;
- event ordering is deterministic enough for tests;
- all payloads are bounded/redacted.

Tests:

- stable IDs across events;
- terminal event exactly once;
- output-tail cap;
- sensitive/oversized diagnostic handling.

---

# Milestone 8 — result normalization and artifact boundary

Create the final `SubagentResult` from observed child state.

## Parent-visible result

- concise bounded summary;
- status;
- partial flag;
- profile/source;
- usage;
- evidence refs;
- diagnostics.

## Full output

If useful full output exceeds the parent-visible budget:

- persist it under a Pi Void-owned artifact location;
- return an artifact ID/path;
- record truncation;
- never inject the full transcript into parent context automatically.

Acceptance:

- output cap is enforced in bytes;
- truncation is explicit;
- child result cannot spoof observed usage/status/changed paths.

Tests:

- small output;
- very large output;
- unicode byte accounting;
- cancellation with partial output;
- artifact write failure soft/hard behavior defined.

---

# Milestone 9 — wire the Pi Void `delegate` tool

Add a hidden Pi Void-owned extension/factory and load it through `packages/coding-agent/src/piv.ts`. Do not add it to stock `pi` built-ins.

Use the model-facing name `delegate`.

Wire `delegate` into the appropriate `piv-safe-verify` active-tool lists so existing mode/tool policy decides when the parent can delegate. The subagent extension itself should not maintain a second plan/build mode state.

Public V1 parameters should stay small. Example shape:

```json
{
  "role": "explore",
  "task": "Trace how project trust controls extension loading and report exact files/functions.",
  "scope": {
    "roots": ["packages/coding-agent/src"]
  },
  "model": "optional/exact-model"
}
```

Avoid exposing raw permission lists or arbitrary system prompts to the model.

Tool description must clearly state:

- child is isolated in conversation/context, not a filesystem sandbox;
- V1 is read-only;
- child has no discovered extensions/skills/templates/themes/context files;
- child output is evidence and is verified/synthesized by the parent.

Acceptance:

- `piv` parent model can invoke one child when `delegate` is active;
- stock `pi` does not gain the Pi Void delegation tool;
- guarded-build active-tool policy can remove `delegate`;
- child cannot invoke delegation recursively;
- errors return structured, actionable tool results.

Tests:

- `piv` extension registration;
- stock `pi` unchanged;
- happy path tool call;
- malformed parameters;
- unknown role;
- mode/tool gating;
- cancellation;
- model override unavailable.

---

# Milestone 10 — parent-side verification gate

Implement a lightweight verifier for child results.

For MVP read-only results:

- validate lineage;
- validate terminal status;
- validate result schema/size;
- normalize/canonicalize referenced paths;
- reject paths outside scope;
- optionally check cited files/lines/evidence exist;
- record unresolved claims.

Do not treat child confidence or prose as proof.

Integrate with guarded-build semantics so a worker cannot implicitly authorize mutation or transition modes.

Acceptance:

- failed/timed-out/cancelled result cannot be represented as verified success;
- invalid paths/evidence are surfaced;
- parent remains responsible for final synthesis.

---

# Milestone 11 — MVP integration test suite

Create a deterministic faux-provider/fixture suite covering the complete path.

Required scenarios:

- [ ] `piv` exposes `delegate` and stock `pi` does not;
- [ ] guarded-build active tools can enable/disable parent delegation;
- [ ] child receives fresh context;
- [ ] selected task/context reaches child;
- [ ] unrelated parent history does not;
- [ ] child extensions are disabled;
- [ ] child skills are disabled;
- [ ] child prompt templates are disabled;
- [ ] child themes are disabled;
- [ ] child context-file/`AGENTS.md` discovery is disabled;
- [ ] Pi Void Cognee/Blackhole/safe-verify extensions do not load in the child;
- [ ] read-only tool allowlist is real and parent-active-tool intersection is enforced;
- [ ] recursive `delegate` unavailable;
- [ ] only bundled V1 roles resolve;
- [ ] exact model selection works/fails predictably;
- [ ] normal completion;
- [ ] malformed/empty child result;
- [ ] child failure;
- [ ] parent cancellation;
- [ ] timeout;
- [ ] partial output;
- [ ] output truncation/artifact path;
- [ ] stable lineage IDs/events;
- [ ] parent transcript does not receive child transcript;
- [ ] child compaction/history does not alter parent history;
- [ ] existing Pi Void core tests continue passing.

MVP exit criteria:

- all new tests pass;
- targeted coding-agent tests pass;
- typecheck/lint/build required by repo instructions pass;
- no unrelated diff churn;
- minimality review finds no unnecessary architecture.

---

# Milestone 12 — native vs subprocess benchmark/decision

Only after the native MVP works, compare against Pi's subprocess implementation.

Evaluate:

- startup latency;
- memory;
- cancellation reliability;
- crash containment;
- event/result complexity;
- resource-loader safety;
- CLI compatibility;
- maintenance burden.

Decision options:

1. native only;
2. native default + subprocess isolation backend;
3. subprocess only if native resource isolation proves unsafe.

Do not maintain two backends without a concrete reason.

---

# Post-MVP Phase A — configurable roles and selective resources

Only after the bundled V1 roles and stripped runtime are stable:

- add trusted user role definitions with deterministic provenance;
- add project role definitions only behind existing project trust;
- define explicit precedence and forbid silent shadowing of bundled roles;
- revalidate role source/hash immediately before execution;
- selectively re-enable individual resource classes only when a measured use case and negative tests justify them;
- keep `delegate`, mutation tools, credential expansion, and executable project hooks independently policy-gated;
- retain a stripped-resource mode as the safe fallback/default for read-only workers.

Do not re-enable all normal parent resources merely for convenience.

---

# Post-MVP Phase B — parallel read workers

Prerequisites:

- stable run/result/events;
- correct cancellation;
- usage accounting;
- deterministic single-child behavior.

Add:

- bounded semaphore with conservative default concurrency `2` and an initially small configurable ceiling;
- submitted-task cap;
- aggregate timeout/cost policy;
- deterministic result ordering;
- partial batch results;
- stop scheduling on parent abort;
- no recursive fan-out by default.

Initial use cases:

- independent codebase searches;
- separate review dimensions;
- test/doc/research investigation.

Do not use parallel fan-out for tightly sequential tasks by default.

---

# Post-MVP Phase C — chain mode

Add only when result boundaries are proven.

Rules:

- next child receives a bounded previous result/artifact summary;
- never inject previous raw transcript;
- each step has its own run ID and terminal state;
- chain stops or explicitly continues according to typed failure policy;
- aggregate usage/result remains bounded.

---

# Post-MVP Phase D — isolated writer workers

Introduce a `WorkspaceProvider` abstraction before enabling edit/write.

Required contract:

```text
create(run) -> isolated workspace
capture(run) -> observed changed paths + patch/branch
cleanup(run) -> idempotent
```

Candidate providers:

- Git worktree first;
- container later;
- remote workspace later.

Writer rules:

- no shared-tree parallel mutation;
- changed paths derived from Git/filesystem, never model prose;
- parent inspects patch;
- parent runs tests;
- parent chooses apply/merge/reject;
- conflicts are explicit.

Acceptance before any writer profile becomes default:

- isolation proven by tests;
- patch capture on success/failure/cancel;
- cleanup idempotent;
- parent verification gate mandatory.

---

# Post-MVP Phase E — background jobs

Do not add `background: true` to the foreground runner.

First create a durable job model with:

- stable job/run IDs;
- owner/parent identity;
- persistent status;
- completion notification;
- owner-scoped cancel;
- restart/reconnect recovery;
- retention/cleanup;
- resume semantics;
- bounded logs/artifacts;
- task tree/status UI.

References:

- OpenCode background job model;
- Oh My Pi async job/registry lifecycle;
- II-Agent persistent run state;
- Claw Code worker health registry.

---

# Post-MVP Phase F — optional memory integration

Cognee remains off for child automatic memory by default.

If enabled later:

- scope recall/write by child run/profile/session;
- inherit only allowed memory capability;
- retrieved memory remains untrusted;
- never share credentials through handoff;
- no automatic hot-path trace ingestion;
- keep parent and child session memory logically separable.

---

# Files likely to be touched during MVP

This is a planning estimate, not a mandate.

Likely new area:

```text
packages/coding-agent/src/subagents/*
```

Likely integration points:

```text
packages/coding-agent/src/piv.ts
packages/coding-agent/src/piv-safe-verify.ts  # expose/gate `delegate` through existing mode tool policy
packages/coding-agent/src/index.ts            # only if public exports are required
packages/coding-agent/test/*                  # dedicated subagent tests
```

Potentially relevant existing internals to reuse, not rewrite:

```text
packages/coding-agent/src/core/sdk.ts
packages/coding-agent/src/core/agent-session.ts
packages/coding-agent/src/core/agent-session-services.ts
packages/coding-agent/src/core/session-manager.ts
packages/coding-agent/src/core/resource-loader.ts / resource loading modules
packages/coding-agent/src/core/model-runtime.ts
packages/coding-agent/src/core/extensions/*
```

Do not alter Pi core abstractions unless a test proves the subagent layer cannot be implemented cleanly through existing APIs.

---

# Reference map during implementation

Use references for ideas/contracts, not direct code copying.

## Pi

- `packages/coding-agent/examples/extensions/subagent/index.ts`
- `packages/coding-agent/examples/extensions/subagent/agents.ts`
- `packages/coding-agent/examples/extensions/subagent/README.md`

## Oh My Pi

- task types/executor/discovery/parallel/worktree;
- async job manager and agent registry for later background phase.

## OpenCode

- task parent/child linkage;
- permission derivation;
- nested delegation denial;
- background lifecycle.

## II-Agent

- typed run/event state;
- cancellation/parent linkage;
- persistent status model.

## Claw Code

- task validation;
- worker lifecycle/health;
- deny-first permissions;
- evidence/report schema.

---

# Stop conditions

Pause implementation and reassess architecture if any of these become true:

- native child `ResourceLoader` cannot be constrained without invasive Pi core changes;
- Pi's `tools` allowlist can be bypassed by an extension/custom tool path;
- child cancellation cannot guarantee settlement;
- parent and child histories cannot be separated cleanly;
- required session identity cannot be represented without breaking existing session semantics;
- MVP requires worktree/background infrastructure merely to support a read-only worker;
- implementation begins duplicating Pi's model/session/tool runtime instead of composing with it.

In those cases, prefer the subprocess backend or a smaller seam rather than expanding the core architecture prematurely.

---

# Definition of done for the first release

A `piv` session can call `delegate` to run one bundled `explore` or `review` worker. The worker is a fresh native in-memory `AgentSession` whose extensions, skills, prompt templates, themes, and context-file discovery are disabled; whose effective tools are only the intersection of the parent's active tools with `read`/`grep`/`find`/`ls`; and which cannot recursively delegate, mutate, use Bash, or inherit Cognee/Blackhole/guard hooks. It respects parent cancellation and timeout, returns a typed bounded result with stable lineage/evidence, and the parent verifies and integrates that result without importing the child's transcript or authority. Stock `pi` remains unchanged.

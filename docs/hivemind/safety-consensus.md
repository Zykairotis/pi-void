# Hivemind Safety and Consensus

**Status:** Target policy.

## Core safety rule

More agents do not automatically mean more truth.

Hivemind improves coverage by spending independent context and compute on separate evidence paths. It must not convert agreement between models into an authority stronger than observed repository state, deterministic checks, or explicit user policy.

## Consensus is advisory

Ruflo exposes majority/weighted/Byzantine-style consensus concepts. Pi Void should adopt explicit decision records and disagreement tracking, but not assume distributed-systems guarantees apply directly to correlated LLM workers.

Reasons:

- workers may use the same model family;
- workers may share the same flawed source/context;
- prompts may induce correlated reasoning failures;
- a malicious repository can influence several workers identically;
- three agreeing hallucinations are still hallucinations.

Therefore:

```text
consensus recommendation < deterministic verifier result
```

## Supported decision policies

### `majority`

Use for low-consequence preference decisions where each worker chooses among explicit options.

Do not use as a correctness gate.

### `weighted`

Weights may reflect role independence, evidence quality, or model diversity.

Do not give the parent/queen an arbitrary numerical weight merely to force a result. The parent already owns the final decision.

### `unanimous`

Useful when disagreement itself should stop automatic recommendation.

Still not proof of correctness.

### `evidence_quorum`

Preferred Pi Void policy.

A recommendation needs:

- a minimum number of independent worker results;
- distinct supporting evidence references where possible;
- no unresolved high-severity contradiction;
- optional deterministic verifier pass for consequential claims.

Example:

```text
2 independent reviewers agree
+ each cites concrete code/test evidence
+ security reviewer has no blocking contradiction
+ targeted verification passes
= recommendation may be marked corroborated/verified
```

## Do not misuse "Byzantine fault tolerance"

A BFT algorithm has assumptions about node independence, identities, message delivery, and bounded faulty participants. Multiple LLM calls inside one process do not automatically satisfy those assumptions.

Pi Void may later implement quorum mathematics or tamper-resistant remote worker identity, but it should use precise names such as `evidence_quorum` unless the complete fault model is actually implemented and tested.

## Permission safety

Hivemind never creates new authority.

For every worker:

```text
workerEffective
  = parentAllowed
    ∩ roleAllowed
    ∩ subagentRuntimePolicy
    ∩ hiveTaskPolicy
```

Explicit denial wins.

Consensus cannot:

- enable a disabled tool;
- move the parent from plan to build mode;
- authorize Bash;
- authorize a protected-path write;
- expand network or credentials;
- approve push/merge/release/deploy;
- enable recursive delegation.

## Context poisoning controls

Treat as untrusted:

- repository text;
- sibling claims;
- retrieved durable memory;
- external MCP/tool descriptions;
- generated summaries;
- generated skills.

Controls:

- preserve source/provenance for every board claim;
- distinguish claim from evidence;
- pass only selected bounded board state to workers;
- never interpret sibling text as policy;
- sanitize/redact durable storage;
- verify critical claims against original state.

## Worker independence

For important panels, improve independence where practical:

- different focus prompts;
- separate fresh contexts;
- different evidence routes;
- optionally different configured model families when cost/routing policy permits;
- prevent reviewers from seeing another worker's conclusion until after their initial analysis when independence matters.

Model diversity is a risk-reduction technique, not a correctness guarantee.

## Budgets

Hivemind must enforce both per-worker and aggregate caps.

At minimum:

- `maxWorkers`;
- `maxTasks`;
- maximum active concurrency;
- hive wall-clock timeout;
- per-worker timeout;
- parent-visible aggregate output cap;
- request/token/cost caps where accounting is reliable.

When aggregate budget is exhausted:

- stop scheduling new tasks;
- allow policy-defined already-running workers to settle or cancel them;
- return `partial` with explicit diagnostics;
- do not silently exceed the cap to chase consensus.

## Cancellation

Parent/user cancellation is authoritative.

Required behavior:

- stop scheduling immediately;
- abort active children through the existing subagent cancellation path;
- wait for bounded settlement;
- preserve completed sibling results;
- emit exactly one terminal hive event;
- do not let late child events change terminal hive status.

## Failure policy

Independent tasks should use settled-result semantics:

```text
A completed
B failed
C timed out
```

The hive should preserve A rather than collapsing the entire run into a generic failure.

Possible aggregate states:

- `completed`: all required tasks satisfied;
- `partial`: useful independent results exist but some tasks failed;
- `failed`: required objective cannot be satisfied;
- `cancelled` / `timed_out`: owner/runtime termination.

## Writer safety later

Writer workers require isolated workspaces.

Never allow:

```text
writer A + writer B + parent
```

to mutate the same checkout concurrently.

Each writer returns observed patch/branch metadata. The parent verifies and integrates.

A consensus vote about patches cannot replace:

- actual diff inspection;
- merge/conflict checks;
- mandatory tests;
- protected-path policy;
- user approval where required.

## Durable-learning safety

Persistent Hivemind knowledge is a poisoning surface.

Promotion requires:

- redaction;
- provenance;
- bounded content;
- verifier or repeated-success evidence;
- repository/user scope by default;
- explicit policy for organization-wide propagation;
- invalidation/deletion support.

Skills require an even higher bar because they influence future behavior and tool use.

## Required test matrix

### Coordination

- maximum concurrency enforced;
- maximum submitted tasks enforced;
- parent cancellation stops scheduling and active workers;
- settled sibling results survive another worker failure;
- aggregate output remains bounded;
- aggregate usage is deterministic enough for policy.

### Permission

- no hive task can widen parent tools;
- no child receives `delegate` or `hivemind`;
- no child receives memory/network/mutation capability in read-only phase;
- consensus cannot alter mode or permission state.

### Evidence/consensus

- agreement without evidence does not become `verified`;
- contradictory evidence remains visible;
- verifier failure overrides consensus;
- quorum calculation handles missing/failed workers;
- duplicate worker result cannot count twice.

### Learning

- secrets are redacted before durable promotion;
- unverified result stays candidate-only;
- invalidated knowledge is excluded from normal recall;
- skill candidate cannot install itself;
- repository-scoped knowledge does not leak across scope without policy.

# Hivemind Architecture

**Status:** Target architecture; post-subagent-V1.

## Design objective

Hivemind should make several bounded subagents behave like one evidence-producing system without creating a second autonomous agent framework.

The architecture therefore separates three responsibilities:

```text
reasoning/authority       Parent Pi AgentSession
worker execution          existing SubagentManager / native AgentSession runner
coordination/learning     Hivemind services
```

The parent remains responsible for decomposition, permissions, user-facing decisions, mutation approval, and final verification.

## Parent-as-queen

Ruflo uses queen-led terminology. Pi Void adopts the useful coordination concept but maps the queen role to the existing parent Pi session.

There is no mandatory `QueenAgent` model.

The parent:

- decides whether a hive is justified;
- creates the explicit task set;
- selects allowed roles/models within policy;
- supplies scope and budgets;
- receives the aggregate result;
- verifies important claims;
- decides what, if anything, becomes durable knowledge.

The Hivemind coordinator is deterministic infrastructure. It schedules and records work; it does not acquire independent authority.

## Core components

### `HivemindCoordinator`

Owns one hive run.

Responsibilities:

- validate the hive request;
- enforce aggregate worker/task/budget limits;
- create worker runs through the existing subagent execution interface;
- stop scheduling after cancellation or hard failure policy;
- collect bounded results;
- update run-scoped state;
- invoke advisory consensus where requested;
- produce one bounded `HiveResult` for the parent.

It must not:

- interpret Guarded Build mode independently;
- widen child tools;
- manufacture new model/provider routes;
- inject parent transcript into children;
- directly mutate repository files.

### `HiveScheduler`

Runs explicit tasks with bounded concurrency.

Initial target:

```text
default concurrency: 2
small configurable ceiling
no recursive scheduling
no dynamic worker auto-scaling
```

Dynamic auto-scaling can be evaluated later, but it should not be part of the first coordination release.

### `HiveRunStore`

Stores structured state for one hive:

- hive ID and parent session ID;
- objective and explicit task graph;
- worker/subagent run IDs;
- statuses and timestamps;
- budgets and measured usage;
- claims/evidence/artifact references;
- advisory decisions;
- cancellation/failure state.

Initial implementation can be in memory. Durable persistence is required before background/reconnect semantics.

### `EvidenceBoard`

The board is the safe shared-context mechanism.

It contains typed objects rather than free-form cross-agent chat:

```text
claim
observation
evidence reference
artifact reference
contradiction
decision proposal
verification result
```

Workers do not need direct peer-to-peer messaging. The coordinator can include selected board entries in later handoffs when a task explicitly depends on earlier results.

### `ConsensusEngine`

Produces an advisory `HiveDecision` from independent worker opinions and evidence.

Its output is never equivalent to verification. A unanimous panel can still be wrong.

The preferred default is evidence-based quorum rather than plain vote counting. See [Safety and consensus](./safety-consensus.md).

### `HiveLearningPipeline`

Runs after verification, not in the hot worker path.

Pipeline:

```text
observed run data
  -> redact
  -> distill candidate
  -> attach provenance/evidence
  -> verify/promote policy
  -> durable knowledge or skill candidate
```

This borrows the useful capture/summarize/skillify pattern from ActiveLoop Hivemind while preserving Pi Void's rule that unverified model output is not authoritative memory.

## Coordination plane and learning plane

Hivemind has two separate planes.

### Coordination plane

Short-lived and task-scoped:

- scheduling;
- worker membership;
- task dependencies;
- evidence board;
- advisory consensus;
- aggregate budget/cancellation;
- final aggregate result.

### Learning plane

Optional and durable:

- verified patterns;
- reusable decisions;
- successful workflow summaries;
- skill candidates;
- invalidation/decay metadata;
- provenance to source hive runs.

A coordination run must work correctly with durable learning completely disabled.

## Topology

### Initial topology: star

```text
             parent
          /    |    \
         /     |     \
      worker worker worker
```

All authority and result flow passes through the parent/coordinator.

Benefits:

- aligns with no-recursive-delegation policy;
- simple cancellation and ownership;
- deterministic accounting;
- no direct child-to-child permissions;
- easier context bounding.

### Later topology: shared-board mesh

Workers may consume selected typed board state produced by siblings, but communication remains mediated by the coordinator.

```text
worker A --\
worker B ----> EvidenceBoard ----> selected handoff to worker C
worker C --/
```

This gives most of the useful information-sharing behavior of a mesh without permitting arbitrary direct calls or nested agent trees.

### Not a target: recursive hierarchy

Nested queens, managers that spawn managers, and unrestricted recursive delegation are not the default Pi Void architecture. If a future use case justifies hierarchy, it requires a separate depth, budget, ownership, and isolation design.

## Hive lifecycle

```text
created
  -> running
      -> aggregating
          -> completed
          -> partial
          -> failed
      -> cancelled
      -> timed_out
```

Worker lifecycle remains the existing `SubagentRun` lifecycle.

A hive may finish `partial` when some independent tasks settle successfully and others fail/cancel/time out, provided the request policy permits partial aggregation.

Terminal transitions are idempotent. Late worker events cannot resurrect a cancelled or timed-out hive.

## Task graph

The parent supplies explicit tasks. Hivemind initially does not run a separate planning model to invent them.

Task relationships:

- `independent`: eligible for parallel scheduling;
- `dependsOn`: waits for specific predecessor results;
- `reviewOf`: receives bounded evidence/artifact references from another task;
- `consensusGroup`: contributes an opinion to one advisory decision.

Example:

```text
objective: assess subagent implementation

A explore architecture        independent
B inspect tests               independent
C inspect security boundary   independent
D adversarial review          dependsOn A,B,C
```

## When the parent should use Hivemind

Use a single `delegate` when:

- there is one clear bounded question;
- tasks are highly sequential;
- coordination cost exceeds likely context benefit.

Use Hivemind when:

- two or more independent investigations can run concurrently;
- an adversarial panel meaningfully reduces blind spots;
- separate model/context routes are useful;
- the result benefits from structured corroboration or contradiction tracking.

The coordinator should not create fan-out merely because multiple workers are available.

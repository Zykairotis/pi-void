# Pi Void Hivemind

**Status:** Target architecture; not implemented.

Pi Void Hivemind is an optional coordination and learning layer built **on top of** the Pi Void subagent system. It does not replace Pi's agent loop, the `delegate` worker primitive, Guarded Build, or parent-side verification.

The core rule is:

> The parent Pi session is the logical queen. Hivemind is deterministic orchestration around sibling subagent runs, not another model-driven controller.

## Why Hivemind exists

A single `delegate` call is the right primitive for one bounded investigation or review. Hivemind becomes useful only when the parent can benefit from several independent context windows, shared structured evidence, or an explicit multi-worker decision process.

Use Hivemind for:

- independent repository investigations;
- parallel review dimensions;
- research where several evidence paths reduce blind spots;
- bounded specialist panels;
- later, isolated writer proposals in separate worktrees;
- verified learning that should improve future runs.

Do not use Hivemind for:

- a task that one subagent can handle cleanly;
- sequential work that does not parallelize;
- bypassing parent permissions or verification;
- recursive manager/worker trees;
- majority voting as a substitute for deterministic checks.

## Architecture in one diagram

```text
User
  |
  v
Parent Pi AgentSession                         authoritative reasoner
  |
  +-- delegate(task) -----------------------> one SubagentRun
  |
  +-- hivemind(explicit tasks)  [post-V1]
          |
          v
     HivemindCoordinator                      deterministic scheduler/state
       |       |       |
       v       v       v
    worker A worker B worker C                sibling SubagentRuns
       |       |       |
       +-------+-------+
               |
               v
        Evidence Board                         typed claims/artifacts
               |
        Advisory Consensus                     never overrides verification
               |
               v
        Parent Verification                    authoritative acceptance gate
               |
               v
        Verified Learning                      optional durable promotion
```

## Non-negotiable boundaries

1. **`delegate` remains the atomic worker primitive.** Hivemind reuses the same runner, role, permission, cancellation, result, and evidence contracts.
2. **Parent is queen.** No second model decides permissions, mutates parent state, or recursively spawns workers by default.
3. **Flat topology first.** Workers are siblings. They do not call `delegate` and do not directly spawn peers.
4. **Shared state is typed.** Workers exchange bounded claims, evidence, artifacts, and decisions through Hivemind-owned state, not transcript injection.
5. **Consensus is advisory.** Agreement between models can raise confidence or identify disagreement, but deterministic verification and observed repository state remain authoritative.
6. **Memory is split by purpose.** Session history, run-scoped hive state, and durable learned knowledge are separate stores with separate trust rules.
7. **Learning is verified.** Raw child output is not automatically promoted into permanent memory or executable skills.
8. **Mutation waits for isolation.** Writer hives require one isolated workspace/worktree per writer and parent-owned patch integration.
9. **Budgets are aggregate.** Hivemind has hard worker, task, token/request, output, and wall-clock limits in addition to per-worker limits.
10. **Cancellation is owner-scoped.** Parent cancellation stops scheduling, aborts active children, and preserves already-settled bounded results.

## Document map

- [Architecture](./architecture.md) — components, topology, lifecycle, and parent-as-queen model.
- [Contracts](./contracts.md) — proposed request/run/task/claim/decision/result interfaces.
- [Subagent integration](./subagent-integration.md) — how Hivemind composes with `delegate` and Pi Void policy.
- [Memory and learning](./memory-learning.md) — run-scoped shared state, durable promotion, Cognee compatibility, and skill learning.
- [Safety and consensus](./safety-consensus.md) — evidence quorum, permission rules, correlated-failure limits, and failure handling.
- [Roadmap](./roadmap.md) — staged implementation and acceptance gates.
- [References](./references.md) — ActiveLoop Hivemind, Ruflo, and existing Pi Void subagent references.

## External inspiration

Two references contribute different layers:

- **ActiveLoop Hivemind** is most useful for the shared-learning plane: structured trace capture, retrieval, session summaries, reusable skill extraction, and Pi lifecycle integration.
- **Ruflo Hive Mind** is most useful for the coordination plane: explicit topology, worker membership, shared state, consensus proposals, session lifecycle, and the distinction between one native task and collective multi-worker orchestration.

Pi Void intentionally does not copy either system wholesale. The objective is a smaller architecture that preserves Pi's authoritative loop and Pi Void's verification and capability boundaries.

# Hivemind Roadmap

**Status:** Proposed sequence.

Hivemind should be built only after the atomic subagent contract is stable. The stages below deliberately separate coordination from learning and mutation.

## H0 — specification and benchmark design

Current stage.

Deliverables:

- architecture and contracts in `docs/hivemind/`;
- explicit integration point with `SubagentExecutor`;
- reference/provenance map;
- benchmark tasks where multi-worker execution has a plausible advantage;
- failure and safety test matrix.

Exit criteria:

- no contradiction with subagent V1 invariants;
- parent-as-queen rule documented;
- consensus cannot override verification;
- durable learning is optional and separate.

## H1 — prove subagent V1 first

Dependency: `task_plan.md` first release complete.

Required evidence:

- `delegate` works with a fresh native child;
- stripped resource loader is proven;
- capability intersection is real;
- cancellation/timeout are deterministic;
- typed bounded evidence works;
- parent verification works.

No Hivemind production code is needed for H1.

## H2 — bounded parallel read coordination

Dependency: post-MVP parallel subagent worker support.

Implement the smallest Hivemind coordinator:

- explicit task list supplied by parent;
- star topology;
- default active concurrency `2`;
- small hard ceiling;
- aggregate timeout/output/request/token/cost budgets;
- settled partial results;
- owner-scoped cancellation;
- one bounded `HiveResult`.

No shared mid-run memory and no consensus are required yet.

Exit criteria:

- deterministic scheduling tests;
- no recursive delegation;
- cancellation aborts all active workers;
- one worker failure preserves independent results;
- same task with one worker remains no better than using `delegate`, so Hivemind is not selected unnecessarily.

## H3 — evidence board and advisory consensus

Add:

- run-scoped `EvidenceBoard`;
- normalized `HiveClaim` objects;
- contradiction tracking;
- `HiveDecision` records;
- `evidence_quorum` policy;
- optional majority/weighted/unanimous policies for low-consequence choices;
- verifier-gate integration.

Workers still do not receive direct shared-memory tools.

Dependent tasks receive selected board entries in bounded handoff packets.

Exit criteria:

- duplicate votes/evidence do not inflate quorum;
- conflicting evidence stays visible;
- verifier failure overrides consensus;
- raw sibling transcripts never enter another child context automatically.

## H4 — verified learning

Borrow the useful ActiveLoop-style learning loop without adopting automatic global trust.

Add:

- structured capture of hive/subagent outcomes;
- redaction;
- distillation into knowledge candidates;
- promotion/invalidation state;
- parent-selected recall;
- optional adapter to `ice-cognee` or another backend;
- skill candidate generation behind explicit promotion policy.

Initial default:

```text
knowledge mode = candidate_only
child durable-memory access = off
organization-wide propagation = off
```

Exit criteria:

- unverified results cannot enter promoted knowledge;
- secrets are redacted;
- scope isolation is tested;
- stale knowledge can be invalidated;
- Hivemind works with durable memory disabled.

## H5 — isolated writer hives

Dependency: `WorkspaceProvider` and writer subagent phase.

Each writer gets a separate worktree/workspace.

Add:

- write-capable role only through isolated provider;
- patch/branch capture;
- changed paths measured from workspace state;
- competing implementation proposals where justified;
- parent diff/test verification;
- explicit conflict/integration policy.

Hivemind may rank/recommend patches. It cannot apply them merely because workers agree.

Exit criteria:

- no shared-tree writer race;
- cancellation captures partial patch safely;
- cleanup idempotent;
- parent can reject all proposals;
- mandatory verification blocks bad consensus.

## H6 — durable/background hives

Dependency: durable subagent job model.

Add:

- persisted `HiveRun` and task state;
- resume/reconnect;
- owner-scoped cancel after reconnect;
- completion notification;
- retention/cleanup;
- crash recovery;
- durable artifact references.

Do not implement background as a boolean on the foreground coordinator.

## H7 — federation/remote workers, only if justified

Ruflo includes federation and broader swarm topologies. ICE should consider remote hives only after local semantics are mature.

Required first:

- worker identity/authentication;
- encrypted transport;
- remote workspace isolation;
- scoped credentials;
- tamper-resistant evidence provenance;
- network allowlisting;
- remote cancellation/lease semantics;
- cost/usage ownership.

This is not a near-term requirement.

## Evaluation plan

Compare at least:

```text
A. parent only
B. parent + one delegate worker
C. parent + Hivemind fan-out
D. parent + Hivemind panel/consensus
```

Use identical repository state, objective, model routes where possible, budgets, and verification criteria.

Measure:

- verified task success;
- regressions missed/found;
- evidence precision;
- wall time;
- total input/output/reasoning tokens;
- estimated/reported cost;
- tool calls and failures;
- human review burden;
- cancellation reliability;
- parent context saved versus worker context spent.

Hivemind ships by default only if measured value exceeds coordination and token cost on its intended task classes.

## Selection policy target

The parent should eventually use a simple cost/benefit heuristic:

```text
single bounded question                   -> delegate
2+ independent evidence paths             -> Hivemind fan-out
consequential ambiguous recommendation    -> Hivemind panel + evidence quorum
sequential dependent work                 -> chain/pipeline, not broad fan-out
mutation                                  -> isolated writer workflow only
```

Do not create a hive because the feature exists.

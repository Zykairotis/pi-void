# Hivemind Contracts

**Status:** Proposed contracts; names may change during implementation.

Hivemind must consume the existing subagent execution contract rather than creating a second worker protocol.

## `HiveRequest`

```ts
interface HiveRequest {
  objective: string;
  tasks: HiveTask[];
  strategy: "fanout" | "panel" | "pipeline";
  scope?: {
    roots?: string[];
    exclude?: string[];
  };
  budget: HiveBudget;
  consensus?: HiveConsensusPolicy;
  knowledge?: HiveKnowledgePolicy;
}
```

Rules:

- `tasks` are explicit in the first release;
- no arbitrary child system prompts;
- no raw child permission lists;
- no caller-provided recursive depth;
- hive scope cannot widen parent/subagent scope.

## `HiveTask`

```ts
interface HiveTask {
  taskId: string;
  role: string;
  task: string;
  focus?: string;
  dependsOn?: string[];
  reviewOf?: string[];
  consensusGroup?: string;
  context?: SubagentContextRef[];
  model?: string;
  timeoutMs?: number;
}
```

`role` resolves through the same role/profile policy as `delegate`.

For the first useful Hivemind release, `explore` and `review` are sufficient. Specialization should initially be expressed through the task/focus field instead of creating dozens of privileged role types.

Examples:

```text
role=explore, focus=architecture
role=explore, focus=tests
role=explore, focus=security boundaries
role=review,  focus=regression risk
```

## `HiveBudget`

```ts
interface HiveBudget {
  maxWorkers: number;
  maxTasks: number;
  maxWallTimeMs: number;
  maxOutputBytes: number;
  maxRequests?: number;
  maxInputTokens?: number;
  maxOutputTokens?: number;
  maxEstimatedCost?: number;
}
```

Aggregate limits are enforced independently of per-subagent limits.

A worker must never receive a larger effective limit than both its role and the remaining hive budget permit.

## `HiveRun`

```ts
type HiveStatus =
  | "created"
  | "running"
  | "aggregating"
  | "completed"
  | "partial"
  | "failed"
  | "cancelled"
  | "timed_out";

interface HiveRun {
  hiveId: string;
  parentSessionId: string;
  status: HiveStatus;
  objective: string;
  taskIds: string[];
  workerRunIds: string[];
  createdAt: string;
  startedAt?: string;
  endedAt?: string;
}
```

Each worker remains an ordinary `SubagentRun` with its own `runId` and child session ID.

## `HiveClaim`

```ts
type HiveClaimStatus =
  | "proposed"
  | "corroborated"
  | "contradicted"
  | "verified"
  | "rejected";

interface HiveClaim {
  claimId: string;
  hiveId: string;
  text: string;
  status: HiveClaimStatus;
  sourceRunIds: string[];
  evidence: SubagentEvidence[];
  contradictions?: string[];
  scope?: string[];
}
```

Important distinction:

```text
number of agreeing agents != evidence quality
```

A claim becomes `verified` only through an observed verification step or a parent-owned evidence check defined by policy.

## `HiveConsensusPolicy`

```ts
interface HiveConsensusPolicy {
  mode:
    | "none"
    | "majority"
    | "weighted"
    | "unanimous"
    | "evidence_quorum";
  minimumParticipants?: number;
  minimumIndependentEvidence?: number;
  requireVerifierGate?: boolean;
}
```

`evidence_quorum` should be the preferred Pi Void mode for consequential recommendations.

Do not expose a setting named Byzantine fault tolerance unless the implementation can justify the actual fault model. Several correlated LLM calls do not automatically satisfy BFT assumptions.

## `HiveDecision`

```ts
interface HiveDecision {
  decisionId: string;
  hiveId: string;
  question: string;
  options: string[];
  recommendation?: string;
  votes: HiveVote[];
  evidenceRefs: string[];
  disagreements: string[];
  consensusReached: boolean;
  verifierStatus?: "not_run" | "passed" | "failed";
}
```

A decision can be consensus-reached and still fail verification.

## `HiveKnowledgePolicy`

```ts
interface HiveKnowledgePolicy {
  mode: "off" | "candidate_only" | "promote_verified";
  recall: "none" | "parent_selected";
  allowSkillCandidates?: boolean;
}
```

Initial recommendation:

```text
mode   = candidate_only
recall = parent_selected
```

No child receives unrestricted durable-memory access.

## `HiveKnowledgeCandidate`

```ts
interface HiveKnowledgeCandidate {
  candidateId: string;
  hiveId: string;
  kind: "fact" | "pattern" | "decision" | "workflow" | "skill";
  summary: string;
  evidenceRefs: string[];
  sourceRunIds: string[];
  scope: "run" | "repository" | "user" | "organization";
  status: "candidate" | "promoted" | "rejected" | "invalidated";
  createdAt: string;
}
```

Promotion policy is defined in [Memory and learning](./memory-learning.md).

## `HiveResult`

```ts
interface HiveResult {
  hiveId: string;
  parentSessionId: string;
  status: HiveStatus;
  summary: string;
  partial: boolean;
  workerResults: SubagentResult[];
  claims: HiveClaim[];
  decisions: HiveDecision[];
  knowledgeCandidates?: HiveKnowledgeCandidate[];
  usage?: HiveUsage;
  diagnostics?: HiveDiagnostic[];
}
```

The parent-visible aggregate is bounded. Large worker output and artifacts remain outside normal parent context behind stable references.

## Internal execution seam

Hivemind should depend on a small worker interface, not on the model-facing `delegate` tool implementation:

```ts
interface SubagentExecutor {
  run(request: SubagentRequest, context: ParentExecutionContext): Promise<SubagentResult>;
  cancel(runId: string): Promise<void>;
}
```

Both `delegate` and Hivemind use this shared internal seam.

This avoids textual recursion such as a coordinator model calling the public `delegate` tool repeatedly and keeps permissions/cancellation/accounting in one implementation.

## Contract invariants

- IDs are stable and opaque.
- Status is typed, never parsed from prose.
- Results are bounded.
- Evidence is distinct from claims.
- Verification is distinct from consensus.
- Parent permissions cap every worker.
- Durable knowledge is distinct from run-scoped board state.
- No contract requires a specific model provider, memory database, or process backend.

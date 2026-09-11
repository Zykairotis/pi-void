# Hivemind Memory and Learning

**Status:** Target architecture; durable learning is later than read-only coordination.

ActiveLoop Hivemind demonstrates a useful pattern: capture structured agent activity, retrieve relevant prior work, summarize sessions, and convert repeated successful patterns into reusable skills. ICE should borrow that learning loop while applying stricter promotion and trust boundaries.

## Four distinct memory domains

Do not use one global store for everything.

### 1. Ice session history

Owner: Ice.

Contains the normal parent or child conversation/session history.

Rules:

- parent and child histories remain separate;
- Hivemind does not merge them;
- compaction remains session-local;
- raw transcript is not the Hivemind coordination protocol.

### 2. Hive run board

Owner: Hivemind coordinator.

Lifetime: one hive run, initially in memory.

Contains:

- task state;
- worker run references;
- typed claims;
- evidence/artifact references;
- contradictions;
- advisory decisions;
- measured usage/budget state.

This is shared coordination state, not permanent memory.

### 3. Verified Hivemind knowledge

Owner: ICE learning policy.

Lifetime: durable when explicitly promoted.

Contains distilled and provenance-bearing:

- repository facts with validity scope;
- successful implementation/review patterns;
- reusable workflow knowledge;
- decisions and their evidence;
- skill candidates;
- invalidation metadata.

### 4. External/derived memory adapters

Examples:

- existing `ice-cognee`;
- a future local SQLite/vector store;
- a DeepLake-compatible adapter;
- another user-selected backend.

Hivemind semantics must not depend on one storage provider.

## Learning pipeline

Recommended pipeline:

```text
1. Capture
2. Redact
3. Distill
4. Verify
5. Promote
6. Retrieve
7. Revalidate / invalidate
```

### 1. Capture

Capture structured execution facts first:

- objective/task IDs;
- role/model route;
- tool/event metadata;
- bounded worker result;
- evidence/artifact references;
- verifier results;
- measured usage;
- parent final disposition.

Raw prompts, tool bodies, and transcripts should be opt-in and redacted rather than mandatory durable input.

### 2. Redact

Before any durable storage:

- remove credentials/tokens;
- remove protected paths when policy requires;
- strip unnecessary raw tool output;
- bound text size;
- attach sensitivity metadata.

### 3. Distill

Generate a candidate that is smaller and more reusable than the trace.

Examples:

```text
Fact candidate
"Project trust is checked before project extensions load."

Pattern candidate
"When reviewing resource loaders, verify event hooks as well as tool allowlists."

Workflow candidate
"For provider regressions, inspect catalog refresh, model-store normalization, and provider tests independently."
```

### 4. Verify

A learning candidate needs evidence beyond model confidence.

Possible gates:

- cited source still exists;
- deterministic test passed;
- parent independently re-read the evidence;
- repeated successful runs support the pattern;
- user explicitly approved promotion;
- no contradictory verified knowledge exists.

### 5. Promote

Promotion changes future behavior and therefore deserves a higher bar than temporary recall.

Recommended states:

```text
candidate -> promoted -> invalidated
          -> rejected
```

Promotion records:

- source hive/run IDs;
- evidence references;
- repository/version scope;
- creation time;
- verifier status;
- author/owner where relevant;
- expiration or revalidation trigger where appropriate.

### 6. Retrieve

Initial Hivemind recall should be **parent-selected**.

```text
durable store
  -> parent searches/retrieves
  -> parent selects bounded relevant entries
  -> selected entries enter HiveTask handoff
```

Children do not directly receive unrestricted Cognee or Hivemind durable-memory tools in the first coordination release.

This preserves the existing subagent memory boundary and keeps recall auditable.

### 7. Revalidate / invalidate

Knowledge can become stale.

Invalidate or lower trust when:

- referenced files/functions disappear;
- repository version/branch scope no longer matches;
- verification starts failing;
- contradictory newer evidence wins;
- the user explicitly retires a pattern.

## Skill learning

ActiveLoop Hivemind codifies repeated patterns into `SKILL.md` files. ICE can use the same general idea, but skill promotion must be more conservative because a skill changes future model instructions.

Recommended flow:

```text
successful verified hives
  -> repeated pattern detector
  -> SkillCandidate
  -> static safety/provenance checks
  -> explicit user or policy approval
  -> installed trusted skill
```

A skill candidate should include:

- trigger/use case;
- exact workflow;
- required tools/capabilities;
- prohibited operations;
- evidence from prior successful runs;
- failure cases;
- version/source hash.

Do not auto-install a skill merely because one agent generated convincing prose.

## Cognee relationship

`ice-cognee` remains an independent derived-memory adapter.

Recommended integration:

- Hivemind defines **what** may be recalled/promoted and with what provenance;
- a Cognee adapter may implement **where/how** verified Hivemind knowledge is stored or retrieved;
- the parent performs recall initially;
- child direct Cognee recall/write remains off unless a later capability policy explicitly enables it;
- Hivemind must work with Cognee disabled.

This avoids creating two competing memory semantics while keeping the Hivemind contract backend-neutral.

## Retrieval strategy

Prefer a tiered strategy:

1. exact structured metadata and IDs;
2. lexical search;
3. repository/path/tag filters;
4. semantic/vector retrieval only when measured recall justifies it;
5. optional graph associations for proven use cases.

This follows ICE's existing principle that embeddings should earn their cost through measured retrieval gains.

## Long-term organization scope

Cross-user or organization-level learning is a later capability because it changes privacy and poisoning risk.

Required before organization-wide propagation:

- explicit organization/workspace identity;
- access control;
- provenance;
- redaction policy;
- deletion/invalidation semantics;
- contributor attribution;
- protection against one compromised project poisoning shared behavior.

The first durable store should prefer repository/user scope over implicit global sharing.

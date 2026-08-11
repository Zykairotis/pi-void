# Hivemind References and Provenance

**Status:** Research notes for architecture only. No external source code has been copied into Pi Void by this documentation work.

## 1. ActiveLoop Hivemind

Repository:

```text
https://github.com/activeloopai/hivemind
```

License advertised by the repository: Apache-2.0.

Primary sources inspected:

```text
README.md
src/cli/install-pi.ts
```

### Useful ideas

The README describes a shared-learning system that:

- captures prompts/tool calls/responses as structured traces;
- searches traces and learned skills;
- summarizes sessions into wiki-style pages;
- extracts repeated patterns into reusable `SKILL.md` content;
- propagates learned capability across sessions/agents;
- supports Pi as a first-class integration target.

The Pi installer source is especially relevant because it uses Pi-native integration surfaces rather than requiring a replacement harness. It installs a Pi extension that subscribes to lifecycle events such as session start/input/tool results/message completion, registers first-class Hivemind recall tools, and runs separate summary/skill workers around session shutdown.

### Pi Void adaptation

Borrow:

- lifecycle-based structured capture;
- explicit search/read/index style memory surface;
- session summarization as an offline/after-run operation;
- skill extraction as a separate learning phase;
- cross-session provenance and reusable learned patterns.

Change:

- do not automatically trust or permanently promote raw child output;
- durable promotion occurs only after Pi Void redaction and verification policy;
- child direct memory access remains off initially;
- Hivemind must work without cloud storage or one specific backend;
- organization-wide propagation is later and explicit.

## 2. Ruflo Hive Mind

Repository:

```text
https://github.com/ruvnet/ruflo
```

License advertised by the repository: MIT.

Primary sources inspected:

```text
README.md
.agents/skills/hive-mind-advanced/SKILL.md
v3/@claude-flow/cli/src/mcp-tools/hive-mind-tools.ts
```

### Useful ideas

The advanced skill documents:

- queen-led coordination;
- specialized workers;
- collective memory;
- explicit task assignment;
- session pause/resume/stop/checkpoints;
- majority/weighted/supermajority-style consensus concepts;
- multi-hive coordination.

The MCP tool source provides a more concrete implementation reference:

- hive state persists topology, queen identity/term, worker membership, consensus proposals/history, and shared memory;
- topologies include mesh/hierarchical/ring/star;
- consensus strategy is explicit;
- vote/quorum calculations are typed;
- worker spawning is bounded;
- the tool description explicitly distinguishes a single native task from Hive Mind use for collective multi-worker coordination.

### Pi Void adaptation

Borrow:

- explicit hive run state;
- parent/queen identity;
- worker membership and lineage;
- topology as a deliberate policy;
- bounded fan-out;
- typed proposals/decisions;
- disagreement and quorum tracking;
- collective state separate from raw chat.

Change:

- parent Pi session is the queen; no mandatory separate queen model;
- star topology first;
- no nested queens or recursive worker trees by default;
- consensus remains advisory;
- use `evidence_quorum` terminology instead of claiming BFT without the full distributed fault model;
- do not import very large agent/tool catalogs into the Pi Void surface;
- no automatic shared-tree writer swarm.

### Claims not used as architecture evidence

Repository/skill benchmark or performance claims are not used to justify Pi Void design decisions unless independently reproduced under controlled same-model evaluation.

## 3. Existing Pi Void subagent references

Hivemind extends, rather than replaces, the earlier reference synthesis.

### Pi native example

Use for:

- extension/tool UX;
- cancellation patterns;
- compatibility baseline.

### Oh My Pi

Use for:

- task/result contracts;
- bounded parallel execution;
- partial results;
- isolated writer worktrees.

### OpenCode

Use for:

- parent-child lineage;
- permission derivation;
- recursive-delegation denial;
- later durable/background lifecycle.

### II-Agent

Use for:

- typed run/event state;
- persistent lifecycle concepts.

### Claw Code

Use for:

- task validation;
- evidence/report discipline;
- verification-oriented result handling.

### OpenHands

Use only as a broad workspace/runtime separation reference from the local checkout.

## 4. Resulting Pi Void synthesis

```text
Pi native AgentSession runtime
        +
Oh My Pi task/worktree mechanics
        +
OpenCode permission/lineage model
        +
II-Agent run lifecycle
        +
Claw Code evidence discipline
        +
Ruflo hive coordination/state ideas
        +
ActiveLoop shared-learning pipeline
        =
Pi Void Hivemind over safe subagents
```

The architecture intentionally keeps the authoritative reasoning loop in Pi and treats every added layer as optional, bounded, and evidence-driven.

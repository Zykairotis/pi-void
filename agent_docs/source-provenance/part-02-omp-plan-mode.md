# Part 02 — Oh My Ice plan-mode extraction provenance

Source checkout: `agent_references/oh-my-pi`

Pinned source revision: `e06ac0b787d9d30adfbe13aca46784376d54c35a`

License: MIT, from source checkout `LICENSE`.

## Adapted behavior

- Read-only planning before mutation.
- Structured Markdown plan draft/refinement followed by proposal.
- Repository-grounded preference questions separated from discoverable facts.
- Explicit approval during proposal before transition to build mode.
- Review choices for fresh execution context, native compaction, or preserved context.
- Reopenable pending review, direct draft editing, and refinement feedback.
- Optional planning/execution model transitions using Ice's model registry.
- Bounded continuation reminders when planning ends without a decision tool.
- Approved-plan execution handoff and mandatory reread before mutation.
- Graceful post-tool-turn stop before the approved execution handoff, avoiding a user-visible abort error.
- Approved plan remains durable outside model context.
- Exact approved plan reread before first approved-plan mutation.
- Approved-plan reread requirement resets after Ice compaction.

## ICE implementation boundary

- `packages/coding-agent/src/ice-safe-verify.ts` owns mode permissions, plan state, approval, persistence, and mutation gating.
- Ice custom session entries store bounded draft/approved plan state; no repository plan file or new artifact protocol is created.
- Ice's existing extension tool, session, compaction, UI, and model-routing hooks remain authoritative.
- Fresh execution is enforced by a durable execution-start context boundary; compact execution uses Ice's native compaction callback.
- Headless modes never auto-approve a proposal.
- Existing explicit `/build` behavior remains available as a manual override; interactive use requires confirmation when a draft or proposal is unfinished.

## Rejected or deferred source behavior

- OMP `local://` and `xd://` artifact URL protocols.
- OMP hashline and custom dispatch internals.
- Integrated OMP interactive mode and custom compaction engine.
- Subagent plan handoff.
- OMP overlay internals, section annotations/deletion, role-configuration machinery, and writable scratch artifacts. ICE uses the native scrolling selector/editor and exact model flags/scoped model selection instead.

No Oh My Ice source code was copied. Behavior and test cases were independently adapted to ICE extension seams and ICE safety policy.

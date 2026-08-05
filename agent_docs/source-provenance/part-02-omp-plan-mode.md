# Part 02 — Oh My Pi plan-mode extraction provenance

Source checkout: `agent_references/oh-my-pi`

Pinned source revision: `e06ac0b787d9d30adfbe13aca46784376d54c35a`

License: MIT, from source checkout `LICENSE`.

## Adapted behavior

- Read-only planning before mutation.
- Structured Markdown plan draft/refinement followed by proposal.
- Explicit approval during proposal before transition to build mode.
- Approved-plan execution handoff and mandatory reread before mutation.
- Approved plan remains durable outside model context.
- Exact approved plan reread before first approved-plan mutation.
- Approved-plan reread requirement resets after Pi compaction.

## Pi Void implementation boundary

- `packages/coding-agent/src/piv-safe-verify.ts` owns mode permissions, plan state, approval, persistence, and mutation gating.
- Pi custom session entries store bounded draft/approved plan state; no repository plan file or new artifact protocol is created.
- Pi's existing extension tool, session, compaction, UI, and model-routing hooks remain authoritative.
- Headless modes never auto-approve a proposal.
- Existing explicit `/build` behavior remains available without a proposal for compatibility with Guarded Build v0.

## Rejected or deferred source behavior

- OMP `local://` and `xd://` artifact URL protocols.
- OMP hashline and custom dispatch internals.
- Integrated OMP interactive mode and custom compaction engine.
- Subagent plan handoff.
- OMP-specific plan overlays, thinking-level transitions, and writable scratch artifacts.

No Oh My Pi source code was copied. Behavior and test cases were independently adapted to Pi Void extension seams and Pi Void safety policy.

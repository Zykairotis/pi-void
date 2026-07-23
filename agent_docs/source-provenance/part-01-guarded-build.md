# Part 01 Guarded Build provenance

`agent_references/` is read-only. Pi source is implementation authority. External sources below informed behavior or tests; no exact external code was copied.

| Local component | Reference project | Source path | Snapshot identity | License | Reuse type |
|---|---|---|---|---|---|
| Hidden extension and lifecycle integration | Pi | `packages/coding-agent/src/core/extensions/types.ts`, `runner.ts`, `agent-session.ts`, `examples/extensions/` | `7f82eed08c19099c663eb8c1ccb5fbac72dc0b86` | MIT | direct native use |
| Tool policy | OpenCode | `packages/opencode/src/permission/index.ts`, `packages/plugin/src/index.ts` | `411eff73f026d4950c07947c4d983788cb615baa` | MIT | behavioral adaptation |
| Mode profiles and permission tests | OpenCode | `packages/opencode/src/agent/agent.ts`, `packages/opencode/test/permission/next.test.ts` | `411eff73f026d4950c07947c4d983788cb615baa` | MIT | behavioral and test-derived |
| Path containment | oh-my-pi | `packages/utils/src/dirs.ts`, `packages/coding-agent/src/lsp/client.ts` | `e06ac0b787d9d30adfbe13aca46784376d54c35a` | MIT | rewritten helper |
| Path regression cases | oh-my-pi | `packages/utils/test/issue-935-repro.test.ts`, `packages/coding-agent/test/utils/filter-user-extensions.ts`, `packages/coding-agent/CHANGELOG.md` | `e06ac0b787d9d30adfbe13aca46784376d54c35a` | MIT | test-derived |
| Verifier statuses and internal state | OpenHands | `openhands/app_server/app_conversation/app_conversation_service_base.py`, `openhands/app_server/app_conversation/sql_app_conversation_info_service.py`, `openhands/app_server/event_callback/webhook_router.py`, related unit tests | `96f902a9ac14bf5edfb2e47d759d75c91e4faf28` | MIT (non-`enterprise/` paths) | conceptual |
| Mode transitions | claw-code | `rust/crates/tools/src/lib.rs`, `ROADMAP.md` | `4ea31c1bc91c4e9bcbd67d51c550c01e127e6d0d` | MIT | behavioral and test-derived |

## Frozen Part 01 contract

- Modes: exact `plan` and `build`; default `plan`.
- Plan tools: `read`, `grep`, `find`, `ls`.
- Build tools: plan tools plus `edit`, `write`.
- Bash: build mode plus current-process `--piv-allow-bash` plus project trust.
- Unknown tools: denied and hidden.
- Mutation: successful, previously authorized `edit` or `write` completion.
- Verifier terminal states: `passed`, `failed`, `timed-out`, `spawn-error`, `cancelled`, `blocked-untrusted`; `not-configured`, `pending`, and `running` are nonterminal.
- Durable state excludes raw verifier argv, environment values, tokens, authentication headers, tool inputs, and process environment.
- Verifier argv authority: current-process `--piv-verify` only.
- Guarded execution is not a sandbox. Bash and filesystem TOCTOU remain outside direct path-guard guarantees.

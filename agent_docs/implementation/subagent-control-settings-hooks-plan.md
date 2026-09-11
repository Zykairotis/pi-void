# ICE subagent control, settings, and lifecycle hooks

## 0. Document contract

- Status: proposed implementation plan; no feature in this document is shipped by writing it.
- Requested deliverable: a detailed 2,000–3,000-line Markdown plan grounded in local references.
- Scope: parent-agent control, extensible agent profiles, global/project settings, and subagent hooks.
- Research boundary: local repository source and documentation only; no external web evidence.
- Implementation boundary: no production code changes, dependency changes, or reference modifications.
- Audit boundary: this is not the ChatGPT Desktop comparison loop and carries no PASS/parity verdict.
- Authority: repository rules and observed implementation override reference suggestions.
- Source language: “observed” means inspected source or documentation, not a benchmark result.
- Proposal language: new fields, modules, event names, limits, and UI actions below are draft contracts.
- Numeric limits marked proposed are starting values requiring tests and review.
- Review date: 2026-09-07.
- Large files were inspected at relevant seams; this is not a whole-repository security audit.
- Before editing a large implementation file, read it completely and recheck current behavior.
- The configured parallel research agents returned 404 errors before producing findings.
- All substantive findings below come from direct inspection, not those failed calls.

### 0.1 Executive correction to the earlier conversation

ICE is not currently limited to a few hardcoded subagent types.
It already has eleven bundled roles and trusted global/project Markdown profiles.
It already has global and project settings files.
It already has Ice lifecycle interception and extension APIs.
It already has foreground child viewing and user takeover for eligible live children.
The useful improvement is a coherent parent-facing control and configuration layer over these facilities.
The useful improvement is not another agent registry, another settings store, or another session engine.

### 0.2 Existing bundled role catalog

- `explore`: repository exploration and verified implementation facts.
- `planner`: architecture, dependencies, implementation order, and verification planning.
- `coder`: targeted implementation and fixes.
- `worker`: bounded implementation-plan execution.
- `tester`: reproduction and focused verification when authorized.
- `review`: actionable evidence-backed review.
- `security`: trust boundaries and sensitive data flow.
- `debugger`: causal investigation and bounded fix candidates.
- `documenter`: implementation-grounded documentation.
- `performance`: measured performance investigation.
- `refactor`: scoped structural improvements preserving behavior.
- `scout` is an alias for `explore`, not a missing role requiring another implementation.
- Roles requesting mutation tools still do not receive those tools under ordinary safe delegation.
- Sources: [P01], [P02].

### 0.3 Existing configuration locations

- Global settings: the active agent directory's `settings.json`.
- Default global settings location: `~/.ice/agent/settings.json`.
- Project settings: `.ice/settings.json` at the location selected by existing Ice settings semantics.
- User role definitions: `<agentDir>/agents/<role>.md`.
- Project role definitions: the nearest eligible `.ice/agents` directory selected by the existing profile loader.
- Project settings and agent discovery have distinct current lookup rules; do not silently unify them.
- Trusted project profile > user profile > bundled profile > alias is the documented source-resolution intent.
- The existing resolver rejects an untrusted project-only role rather than silently granting it authority.
- Global/project settings already expose scoped reads, persistence, reload, and trust handling.
- Sources: [P02], [P03], [P04], [P13].

### 0.4 The important architecture decision

Current ICE deliberately makes every delegated child inherit the exact parent Model object.
Configured profile `model` metadata is retained diagnostically but ignored for execution.
Per-call model selection therefore changes an intentional design decision.
This plan proposes an optional, explicitly approved future routing slice, not an immediate silent replacement.
Default delegation must continue inheriting the parent model until that decision is approved and implemented.
Approval must include an `idea.md` update and targeted model/runtime provenance tests.
No user request to write this plan is treated as approval to change that runtime policy.
Sources: [P01], [P02], especially `loadProfilesFromDirectory` model diagnostics.

### 0.5 Implementation status update — 2026-09-09

This document began as a proposed roadmap. The current ICE tree now implements the safe, parent-owned settings/control/hooks slice described below; the status is based on source inspection and targeted checks, not model claims.

Implemented in the current tree:

- Strict `ice.subagents` / `ice.hooks` parsing, SettingsManager ownership, trust-aware resolution, deny-first restrictions, neutral empty role allowlists, source-aware launch provenance, RPC/interactive projections, and fail-closed settings-load handling.
- Shared per-call thinking/tool/budget controls across foreground, durable async, batch, and review facades. Turn budgets are enforced at actual Ice `turn_start` boundaries and report repair/finalization consume the same budget.
- Restricted local `outputSchema` validation for bounded nested payloads; remote references, unknown keywords, unions, recursion/depth bombs, and oversized payloads are rejected before launch. The mandatory outer summary/evidence envelope remains authoritative.
- Parent-owned in-process lifecycle decisions and observations, cancellation/deadline-bounded approval, final tool-boundary checks, bounded hook records, owner-scoped durable contract/provenance, and owner-bound idempotent retained-child follow-up with user-takeover arbitration.
- Existing profile discovery/import, batch/review scheduling, durable jobs, isolated writers, child views, observatory, and verification paths remain in their existing Ice-native owners rather than being replaced.

Explicitly deferred by the architecture and not claimed as shipped:

- W20–W21 alternate per-child model routing. Exact parent-model object inheritance remains mandatory; W19 is complete as the decision to retain that policy, while W20–W21 remain deferred implementation work.
- W31–W33 executable command hooks. In-process handlers are shipped; command hooks remain disabled until a separate executable-policy and isolation gate passes. Project trust alone never executes a command.
- Background batch/writer continuation, restart-resumable live sessions, and other items in Section 13 remain deferred.

The completion evidence for this implementation is maintained under `.artifacts/ice-subagent-control-hooks/`; targeted tests and the repository's non-writing check equivalents must be rerun after any subsequent source change.

## 1. Reading map

1. Sections 0–4 establish the baseline, source evidence, and design decisions.
2. Sections 5–9 specify configuration, invocation controls, hooks, and supervision.
3. Section 10 lists ordered implementation work packages with acceptance evidence.
4. Section 11 lists adversarial verification scenarios.
5. Sections 12–15 cover rollout, rejection/defer decisions, and completion gates.
6. Source IDs resolve through the source register below to local files and snapshot hashes.
7. Existing source paths are integration targets, not permission to rewrite those files wholesale.
8. Proposed test/module names are explicitly proposals and may be consolidated when that reduces complexity.

## 2. Snapshot and source register
- ICE branch: `feat/subagents`.
- ICE HEAD: `c87052efb9dd403f551143381a8964aeca98bb71`.
- `opencode` reference HEAD: `57ef3828431790c53f8f333c7ffbfe88770a1812`.
- `oh-my-pi` reference HEAD: `3b2c31cdc3f8823abe220169a4dfa84dd41c05d2`.
- `claw-code` reference HEAD: `08106b0c3771ef5b4a5aa176acccd460e88b7325`.
- `prime-agent` reference HEAD: `9c8230df67b378aaedc032f90e1ae8ba687cfe4a`.
- `openhands` reference HEAD: `f7fb0c4b21f5ed726edbba8a6309634ef434b004`.
- SHA-256 values below fingerprint the local file bytes used for this document.
- HEAD identifies the checkout; file hashes disambiguate a locally modified reference file.
- Source links are relative to this document and open the existing local file.
- A citation supports the specific mechanism described, not wholesale architectural equivalence.
### P01 — idea.md

- Source: [idea.md](../../idea.md).
- Locator: `Current Product Shape; Controlled delegation; Exact model capabilities`.
- SHA-256: `1b17b7083fb6993332686ab6185b72d7d17334e1f296f931df0e2bb0a9d37da8`.
- Evidence: Authoritative project direction: exact parent model, trusted profiles, flat delegation, isolated normal writers.
- Qualification: Do not change this direction merely because a reference permits broader behavior.
### P02 — ice-subagents.ts

- Source: [packages/coding-agent/src/ice-subagents.ts](../../packages/coding-agent/src/ice-subagents.ts).
- Locator: `SUBAGENT_PROFILES; SubagentProfile; resolveSubagentProfileResolution; delegateParameters`.
- SHA-256: `a60d53debc95bcdbb5cb50d100852bed32da7383b650f44cb0d2b835ed190d4c`.
- Evidence: Eleven bundled roles; trusted file-defined profiles; requested versus effective capabilities; bounded invocation schemas.
- Qualification: Selected regions inspected, not a full-file security audit; re-read affected implementation before edits.
### P03 — settings-manager.ts

- Source: [packages/coding-agent/src/core/settings-manager.ts](../../packages/coding-agent/src/core/settings-manager.ts).
- Locator: `SettingsManager; getGlobalSettings; getProjectSettings; setSettingValue; reload`.
- SHA-256: `73ad7b7eb9a113b7f73ac4eba19e0cc2ddbce4e560f8372fee2602ed1ea2298a`.
- Evidence: Existing global/project settings ownership, trust handling, scoped persistence, and override APIs.
- Qualification: Extend this owner minimally; do not introduce an independently writing settings store.
### P04 — settings.md

- Source: [packages/coding-agent/docs/settings.md](../../packages/coding-agent/docs/settings.md).
- Locator: `Settings; Project Trust; Project Overrides`.
- SHA-256: `a145c8cf78c60a12a40888ead2cd777f141a32751ca2b6e0aa6b26b96f61ec80`.
- Evidence: Documents ~/.ice/agent/settings.json and .ice/settings.json, trust gating, and nested-object merging.
- Qualification: Documentation is an API guide; test actual storage behavior for new security-sensitive fields.
### P05 — types.ts

- Source: [packages/coding-agent/src/core/extensions/types.ts](../../packages/coding-agent/src/core/extensions/types.ts).
- Locator: `ToolCallEvent; ToolResultEvent; ExtensionAPI.events`.
- SHA-256: `3bbc923dabc317b976304658dd1a9c77a2b29b09acf0d33af008420ba0d3d705`.
- Evidence: Tool-call input is mutable and explicitly not revalidated automatically after mutation.
- Qualification: This is a contract observation, not a demonstrated exploit; delegation must validate at its final execution boundary.
### P06 — extensions.md

- Source: [packages/coding-agent/docs/extensions.md](../../packages/coding-agent/docs/extensions.md).
- Locator: `Events; Custom Tools; Error Handling; ExtensionAPI Methods`.
- SHA-256: `c21f4af881d85c4bda9b7af613f1d74f2df0fa782feeeb3bad123d4f6d2d848f`.
- Evidence: Existing event interception, custom tools, session entries, UI, and shared event bus.
- Qualification: An observer event bus must not become an authorization channel.
### P07 — sdk.md

- Source: [packages/coding-agent/docs/sdk.md](../../packages/coding-agent/docs/sdk.md).
- Locator: `AgentSession; ModelRuntime; ResourceLoader; SettingsManager`.
- SHA-256: `0b7f43da432aed5d33e739db5fc36439f4d67049eb567bfb3bb42b151102594a`.
- Evidence: Ice-owned session creation, model routing, resource control, steering, and settings durability seams.
- Qualification: Check installed types and current implementation before writing an adapter.
### P08 — ice-agent-packs.ts

- Source: [packages/coding-agent/src/ice-agent-packs.ts](../../packages/coding-agent/src/ice-agent-packs.ts).
- Locator: `importRufloAgentPack; generatedProfile; readTools`.
- SHA-256: `804d90eddf5f158adb69894d756caca51cbbf69009293df29ae06af6a21ffc07`.
- Evidence: Existing role import adapter maps tool vocabulary and writes provenance-bearing profiles.
- Qualification: Import is not permission approval; no blind cross-harness discovery.
### P09 — ice-subagent-preflight.ts

- Source: [packages/coding-agent/src/ice-subagent-preflight.ts](../../packages/coding-agent/src/ice-subagent-preflight.ts).
- Locator: `SubagentPreflightRequirementInput; formatSubagentPreflightFailure`.
- SHA-256: `71b34c5b1512d2f59d0ef84974c1913adb6db61a9dd6bc440ea435941a1198db`.
- Evidence: Bounded command-availability, scoped-path, and env-presence preflight without executing probes.
- Qualification: Executable hooks are not equivalent to these safe probes.
### P10 — ice-subagent-jobs.ts

- Source: [packages/coding-agent/src/ice-subagent-jobs.ts](../../packages/coding-agent/src/ice-subagent-jobs.ts).
- Locator: `SubagentJobRegistry; SubagentJobRecord`.
- SHA-256: `9776e4943d48ed934b736eb05a10f2c65d0203143de367af77bc2dcd1f1cade3`.
- Evidence: Existing durable job owner and persisted record types are integration targets.
- Qualification: Symbol inventory plus P01 behavior description; re-inspect complete registry before changing transitions.
### P11 — ice-agent-view-bridge.ts

- Source: [packages/coding-agent/src/ice-agent-view-bridge.ts](../../packages/coding-agent/src/ice-agent-view-bridge.ts).
- Locator: `IceAgentViewBridge`.
- SHA-256: `460bb31dc6acff5a54d83dfc1ef01a1e7ebe11e4864859d0827e3e7cc94ab76e`.
- Evidence: Existing foreground child-view integration is the supervision UI seam.
- Qualification: Path/symbol integration target; detailed behavioral claims here rely on P01, not a new bridge audit.
### P12 — event-bus.ts

- Source: [packages/coding-agent/examples/extensions/event-bus.ts](../../packages/coding-agent/examples/extensions/event-bus.ts).
- Locator: `ice.events.on; ice.events.emit`.
- SHA-256: `1185942b7afd83692d9e8da029e8594d702157398c693ec8b3ddb02b0780828a`.
- Evidence: Small working example of observational inter-extension events.
- Qualification: Do not copy its unchecked payload assertion into security-sensitive decisions.
### P13 — 10-settings.ts

- Source: [packages/coding-agent/examples/sdk/10-settings.ts](../../packages/coding-agent/examples/sdk/10-settings.ts).
- Locator: `SettingsManager.create; flush; drainErrors`.
- SHA-256: `558f82b9d0655935e6a28ec09f6c35f0f9593f8b034f25d45400c02bc77a778a`.
- Evidence: Working example of existing settings persistence and error reporting.
- Qualification: Durability is explicit; immediate in-memory update is not the same as completed disk persistence.
### P14 — tui.md

- Source: [packages/coding-agent/docs/tui.md](../../packages/coding-agent/docs/tui.md).
- Locator: `Component Interface; Invalidation and Theme Changes; Key Rules`.
- SHA-256: `0d73727b3c1870d92bee8a90a8c2d5c957e3a4316dcaf4adc170f2cbcd82013e`.
- Evidence: Existing render, input, settings, and invalidation contracts for UI additions.
- Qualification: Prefer existing components; avoid a replacement child terminal UI.
### O01 — agent.ts

- Source: [agent_references/opencode/packages/opencode/src/config/agent.ts](../../agent_references/opencode/packages/opencode/src/config/agent.ts).
- Locator: `load; loadMode`.
- SHA-256: `4844d4dfa48a516f5b134b0e310c3b0fc11292d0180b0b12ab8d96a43775efa7`.
- Evidence: Markdown/frontmatter agent discovery; names derived from paths; schema validation.
- Qualification: Discovery follows symlinks in this source; ICE must retain its own canonical-source boundary.
### O02 — agent.ts

- Source: [agent_references/opencode/packages/core/src/v1/config/agent.ts](../../agent_references/opencode/packages/core/src/v1/config/agent.ts).
- Locator: `AgentSchema; normalize; Info`.
- SHA-256: `4f2d7bc8283ff0c8cd922c614a74f74abb1abe9d5fc2a6dba3dd03d2dca5c624`.
- Evidence: Model, variant, sampling, visibility, steps, permissions, and custom option fields.
- Qualification: Do not import permissive unknown-key or deprecated-field semantics by default.
### O03 — task.ts

- Source: [agent_references/opencode/packages/opencode/src/tool/task.ts](../../agent_references/opencode/packages/opencode/src/tool/task.ts).
- Locator: `BaseParameterFields; TaskTool; runTask; notify`.
- SHA-256: `db09fa5868ad3ecfdd83aa2bb7243f85e9e2cd13d0b19fd6f307f7a337b2b36e`.
- Evidence: Named roles, task IDs for reuse, profile model selection, depth checks, and gated background execution.
- Qualification: Reusing a task ID is not proof of ICE-compatible ownership checks; background mode is experimental here.
### O04 — subagent-permissions.ts

- Source: [agent_references/opencode/packages/opencode/src/agent/subagent-permissions.ts](../../agent_references/opencode/packages/opencode/src/agent/subagent-permissions.ts).
- Locator: `deriveSubagentSessionPermission`.
- SHA-256: `c3bbbd4ea8f076c9da07f5dd242bb07581bd8744b602e3e23deb02ea87601e6c`.
- Evidence: Carries parent-session denies/external-directory rules and adds default task/todo restrictions.
- Qualification: Its comment distinguishes parent-agent restrictions from child permissions; do not replace ICE parent-tool intersection.
### O05 — paths.ts

- Source: [agent_references/opencode/packages/opencode/src/config/paths.ts](../../agent_references/opencode/packages/opencode/src/config/paths.ts).
- Locator: `files; directories; fileInDirectory`.
- SHA-256: `cd86a34461b27caf1042f8cba140fbbed47790c4f30cd9691f87298e8d4d4444`.
- Evidence: Explicit config search roots and worktree-bounded ancestor lookup.
- Qualification: Borrow explicit scope explanations, not a second config-search algorithm.
### M01 — agents.ts

- Source: [agent_references/oh-my-pi/packages/coding-agent/src/task/agents.ts](../../agent_references/oh-my-pi/packages/coding-agent/src/task/agents.ts).
- Locator: `parseAgent; loadBundledAgents; getBundledAgentsMap`.
- SHA-256: `c6ed83e6ff9b090c35c357cfe4615b3d7f9d74c0b421cf83987768d941d91e97`.
- Evidence: Bundled Markdown roles and configurable frontmatter fields including model/thinking/spawns.
- Qualification: Validate actual supported frontmatter before any import mapping.
### M02 — discovery.ts

- Source: [agent_references/oh-my-pi/packages/coding-agent/src/task/discovery.ts](../../agent_references/oh-my-pi/packages/coding-agent/src/task/discovery.ts).
- Locator: `discoverAgents`.
- SHA-256: `4d3933f52731adc04dee9f8a3972069208c8d85524f0e6314edea502c09e7c2f`.
- Evidence: Native user/project/extension roots and explicit exclusion of direct foreign-harness roots.
- Qualification: Useful precedent for explicit adapters rather than automatic .claude execution.
### M03 — types.ts

- Source: [agent_references/oh-my-pi/packages/coding-agent/src/task/types.ts](../../agent_references/oh-my-pi/packages/coding-agent/src/task/types.ts).
- Locator: `taskSchema; AgentDefinition; StructuredSubagentSchemaMode`.
- SHA-256: `e09210905d90e2564c040c0f12d686ee8608d9689e94154cbdfd51eb6b2e3a27`.
- Evidence: Per-task tools, output schemas, isolation options, and structured validation metadata.
- Qualification: Some options are dynamic; do not claim every runtime exposes every field.
### M04 — spawn-policy.ts

- Source: [agent_references/oh-my-pi/packages/coding-agent/src/task/spawn-policy.ts](../../agent_references/oh-my-pi/packages/coding-agent/src/task/spawn-policy.ts).
- Locator: `resolveSpawnPolicy; isScoutSpawnable`.
- SHA-256: `8f1a9340aa71192090e0b45c2e37b3d4b69f3415922081798b5b318c4b18405c`.
- Evidence: Explicit agent allowlists, wildcard/default resolution, and disabled-agent checks.
- Qualification: Its unrestricted default does not fit ICE no-recursion policy.
### M05 — read-only-policy.ts

- Source: [agent_references/oh-my-pi/packages/coding-agent/src/task/read-only-policy.ts](../../agent_references/oh-my-pi/packages/coding-agent/src/task/read-only-policy.ts).
- Locator: `READ_ONLY_TOOL_NAMES; isReadOnlyAgent`.
- SHA-256: `bc8cb2dc27008bfcaba1c3f4cafed0e41dec5a451797c0084477260b0e90d8c3`.
- Evidence: Unknown tools fail read-only classification; hub excluded for argument-dependent effects.
- Qualification: Its read-only vocabulary includes memory/network-related names; do not copy that authority classification.
### M06 — structured-subagent.ts

- Source: [agent_references/oh-my-pi/packages/coding-agent/src/task/structured-subagent.ts](../../agent_references/oh-my-pi/packages/coding-agent/src/task/structured-subagent.ts).
- Locator: `assertPlanControlsAllowed; assertDepthAndSpawnAllowed; structured execution functions`.
- SHA-256: `debe4041c32191c13fd2c00dc867acf0c4037f67d9c082a6dada24b2847de0ff`.
- Evidence: Shared policy/preflight path with plan restrictions, spawn checks, schema validation, and isolation cleanup.
- Qualification: Adapt the single-resolution principle, not its runtime, MCP manager, recursion, or artifact protocols.
### M07 — tool-wrapper.ts

- Source: [agent_references/oh-my-pi/packages/coding-agent/src/extensibility/hooks/tool-wrapper.ts](../../agent_references/oh-my-pi/packages/coding-agent/src/extensibility/hooks/tool-wrapper.ts).
- Locator: `HookToolWrapper`.
- SHA-256: `3ddeee1ff64710f4024120ca5e753997d2e3c075a8f626d32dc008f4e29adad8`.
- Evidence: Before-tool interception, fail-safe hook errors, progress forwarding, and result/error observation.
- Qualification: Preserve original execution failure even when after-tool observers also fail.
### M08 — settings.ts

- Source: [agent_references/oh-my-pi/packages/coding-agent/src/capability/settings.ts](../../agent_references/oh-my-pi/packages/coding-agent/src/capability/settings.ts).
- Locator: `settingsCapability`.
- SHA-256: `6338419726bef43c3d6a337aa21c910f56b689ba4ea653b14ca428679bdd9f91`.
- Evidence: Settings sources retain path, scope level, and metadata; merging distinct from deduplication.
- Qualification: Borrow provenance presentation without adopting its capability registry.
### R01 — agents.ts

- Source: [agent_references/prime-agent/packages/coding-agent/examples/extensions/subagent/agents.ts](../../agent_references/prime-agent/packages/coding-agent/examples/extensions/subagent/agents.ts).
- Locator: `AgentConfig; discoverAgents; formatAgentList`.
- SHA-256: `0135bb8ad668af4dd238af6ee8aca233defbc26a858b06e8f22462551359cb99`.
- Evidence: File-defined agents, user/project/both discovery, tools/model fields, and source presentation.
- Qualification: This is an example extension, not the entire native Prime Agent delegation implementation.
### R02 — README.md

- Source: [agent_references/prime-agent/packages/coding-agent/examples/extensions/subagent/README.md](../../agent_references/prime-agent/packages/coding-agent/examples/extensions/subagent/README.md).
- Locator: `Features; Error Handling; Limitations`.
- SHA-256: `f58efb3a3aecb44e3a05d11c8dcaf599aca2f7cdfa981fc41c08ea6241d0430f`.
- Evidence: Documents single/parallel/chain example workflows and distinguishes native RLM delegation.
- Qualification: README claims are documentation evidence, not tests run in this inspection.
### R03 — rlm-max-depth.ts

- Source: [agent_references/prime-agent/packages/coding-agent/src/core/rlm-max-depth.ts](../../agent_references/prime-agent/packages/coding-agent/src/core/rlm-max-depth.ts).
- Locator: `RlmMaxDepthStatus; SetRlmMaxDepthResult`.
- SHA-256: `e882c614e77d90e5c5be6202283c12e2e62a95015232cae02f94e124e5385b29`.
- Evidence: Wire-safe depth setting provenance and global persistence outcome fields.
- Qualification: A status type does not establish runtime enforcement; recursion remains rejected for this plan.
### R04 — README.md

- Source: [agent_references/prime-agent/README.md](../../agent_references/prime-agent/README.md).
- Locator: `Core abstractions; warning; Built for Long-Running Work`.
- SHA-256: `968b64da5dbd48cabc25f3f0ae0bf36ba3227c115d045d1d89bdf98b790645ec`.
- Evidence: Describes persistent Python control, native recursive agents, durable state, and explicit non-sandbox warning.
- Qualification: Architecture context only; do not adopt a competing REPL control loop.
### C01 — __init__.py

- Source: [agent_references/claw-code/src/hooks/__init__.py](../../agent_references/claw-code/src/hooks/__init__.py).
- Locator: `PORTING_NOTE`.
- SHA-256: `1abab06279477f044268a22537f98629947e1118afca5528bc88c9562ce00930`.
- Evidence: Explicit Python placeholder for archived hooks subsystem.
- Qualification: Not evidence of working lifecycle hooks and not authoritative Claude Code behavior.
### C02 — lib.rs

- Source: [agent_references/claw-code/rust/crates/tools/src/lib.rs](../../agent_references/claw-code/rust/crates/tools/src/lib.rs).
- Locator: `Agent ToolSpec; execute_agent_with_spawn; SubagentToolExecutor; normalize_subagent_type`.
- SHA-256: `14c788cf9c5fed15873a8ced390ae2ba05aec69fab31ccf55cef5466ebbdb4ba`.
- Evidence: Active Rust Agent schema, persisted handoff/manifest, typed role tool sets, spawn errors, and dispatch denial.
- Qualification: Selected regions inspected; no whole-runtime parity claim. Hardcoded model/date defaults are not suitable for ICE.
### C03 — setup_wizard.rs

- Source: [agent_references/claw-code/rust/crates/rusty-claude-cli/src/setup_wizard.rs](../../agent_references/claw-code/rust/crates/rusty-claude-cli/src/setup_wizard.rs).
- Locator: `run_setup_wizard`.
- SHA-256: `11e5e0d08297806b1d5eed1cc42819751514c9b2c9ed6e52d915b83a9ca98ae2`.
- Evidence: Writes a subagentModel setting after provider setup.
- Qualification: A settings write alone does not prove that the Agent runtime consumes it.
### C04 — README.md

- Source: [agent_references/claw-code/README.md](../../agent_references/claw-code/README.md).
- Locator: `Ownership / affiliation disclaimer; port documentation links`.
- SHA-256: `e7881ed93bbf9219394e0d1e39168bfad9c5a59d955c1ecaa77e7c375abbabfc`.
- Evidence: Identifies the separate Rust port and disclaims Anthropic affiliation/ownership.
- Qualification: Do not treat repository name or MIT license as permission to copy proprietary archived material.
### H01 — hooks-service.ts

- Source: [agent_references/openhands/src/api/hooks-service.ts](../../agent_references/openhands/src/api/hooks-service.ts).
- Locator: `HooksService.loadWorkspaceHooks; HOOKS_LOAD_TIMEOUT_MS`.
- SHA-256: `ef69836b478dc89843ee6fdd922a9b5afc5a7ca4ea36e71c092d685ccd295159`.
- Evidence: Frontend client loads workspace hooks through agent-server; bounded timeout and optional failure fallback.
- Qualification: Server hook execution semantics are outside this file; optional discovery fallback is not mandatory-policy fail-open precedent.
### H02 — hook-execution-event.ts

- Source: [agent_references/openhands/src/types/agent-server/core/events/hook-execution-event.ts](../../agent_references/openhands/src/types/agent-server/core/events/hook-execution-event.ts).
- Locator: `HookEventType; HookExecutionEvent`.
- SHA-256: `92ca02e5fcd4ac15780ace1a8b9185eb4300b17a0a8d3ea420fcbe93cc9b8d8d`.
- Evidence: Hook event schema includes success, blocked, exit status, correlation, output, and additional context.
- Qualification: Type declarations show representation, not proof of execution, isolation, or redaction.
### H03 — hooks-service.test.ts

- Source: [agent_references/openhands/__tests__/api/hooks-service.test.ts](../../agent_references/openhands/__tests__/api/hooks-service.test.ts).
- Locator: `HooksService tests`.
- SHA-256: `65f9dd0742099c8e036269d920f6ea96e2b1cf6cf3378cb35af8b2cea132507e`.
- Evidence: Mocked local/cloud/no-backend/error cases for workspace hook loading.
- Qualification: Inspected test cases, not executed; remote server behavior remains unverified.
### D01 — part-01-guarded-build.md

- Source: [agent_docs/implementation/part-01-guarded-build.md](../../agent_docs/implementation/part-01-guarded-build.md).
- Locator: `Frozen behavior; Safety design`.
- SHA-256: `b64a08a6f8a63482e6458091cb0261a3e22d9ef58bb66b3dc0358a81f4802680`.
- Evidence: Historical implementation report for guard ownership, trust, verification, and tool boundaries.
- Qualification: Context only; current source and idea.md take precedence over this earlier report.
### D02 — ice-codebase-audit-10-flaws.md

- Source: [agent_docs/ice-codebase-audit-10-flaws.md](../../agent_docs/ice-codebase-audit-10-flaws.md).
- Locator: `Audit findings`.
- SHA-256: `73051c3abfe52b65504be0c8d0ab9cb20bd0756f44c4095552cfc6aa4c3faaeb`.
- Evidence: Historical candidate failure areas including completion delivery and async model-runtime lifetime.
- Qualification: Do not present these as current bugs without reproduction against the current tree.
## 3. Reference comparison and adoption decisions

### 3.1 OpenCode

- Observed: Markdown agents are discovered and validated through a configuration schema. [O01]
- Observed: the schema exposes model, variant, permissions, visibility, and iteration settings. [O02]
- Observed: the task tool can reuse a task ID and uses the profile model or parent message route. [O03]
- Observed: background dispatch is gated by an experimental runtime flag. [O03]
- Observed: a parent ancestry walk checks configured delegation depth. [O03]
- Observed: parent-session deny rules are retained by the subagent permission helper. [O04]
- Adopt: transparent agent capabilities and concise descriptions.
- Adopt: explicit source-aware model selection only after ICE architecture approval.
- Adapt: owner-bound continuation instead of arbitrary task-ID reuse.
- Reject: replacing the Ice session runtime with OpenCode sessions or its Effect service graph.
- Reject: relaxing ICE parent active-tool intersection to match a different permission model.
- Do not infer globally deny-first semantics solely from a helper that constructs a ruleset.

### 3.2 Oh My Ice

- Observed: bundled and discovered roles share a configurable agent-definition contract. [M01], [M02]
- Observed: the task schema supports tools, structured-output controls, and isolation variants. [M03]
- Observed: spawn policy expresses disabled, wildcard, and explicit agent lists. [M04]
- Observed: a shared execution path performs preflight and plan-mode checks. [M06]
- Observed: before-tool hook failure blocks dispatch in the inspected wrapper. [M07]
- Adopt: resolve once and reuse one immutable launch contract across facades.
- Adopt: strict structured-result validation with explicit failure state.
- Adapt: parent-visible role eligibility without granting recursive child spawning.
- Adapt: provenance-rich settings without adopting another capability registry.
- Reject: direct imports of its MCP manager, custom protocols, or task runtime.
- Reject: assuming its broader read-only tool vocabulary matches ICE's local read-only boundary.
- Preserve the useful lesson that tool names can conceal argument-dependent side effects. [M05]

### 3.3 Claw Code

- Observed: the inspected Python hooks package explicitly calls itself a placeholder. [C01]
- Observed: active Rust code defines an Agent tool with description, prompt, type, name, and model. [C02]
- Observed: the Agent tool is assigned a broad permission tier in its ToolSpec. [C02]
- Observed: handoff metadata and a running manifest are persisted before spawn dispatch. [C02]
- Observed: spawn failure is recorded as a failed terminal state. [C02]
- Observed: the child executor rejects tools outside its allowed set before dispatch. [C02]
- Observed: role normalization includes Explore, Plan, Verification, and guide variants. [C02]
- Adopt: persistence-before-dispatch and explicit spawn failure classification.
- Adopt: enforce tool restrictions at execution as well as in the visible schema.
- Reject: hardcoded provider model/date defaults.
- Reject: treating a setup-wizard settings write as evidence that runtime routing consumes it. [C03]
- Reject: assuming this repository proves proprietary Claude Code's behavior or licensing. [C04]

### 3.4 Prime Agent

- Observed: an example extension provides file-defined user/project agents. [R01]
- Documented: that example supports single, parallel, and chain workflows. [R02]
- Documented: native Prime Agent uses a persistent Python/RLM control model distinct from the example. [R04]
- Observed: depth status types include source provenance and global persistence outcome. [R03]
- Adopt: source labels and explicit persistence success/failure in settings views.
- Adapt: bounded parent-owned follow-up without automatic chains or peer messaging.
- Reject: importing the RLM/REPL controller or its recursive delegation model.
- Reject: turning reusable agent specifications into unattended self-modifying executable policy.
- Preserve the explicit warning that process separation is not a security sandbox. [R04]

### 3.5 OpenHands

- Observed: frontend workspace-hook discovery calls an external agent-server client. [H01]
- Observed: discovery has a five-second client timeout setting and optional null fallback. [H01]
- Observed: typed hook events represent success, blocking, exit codes, output, and correlation. [H02]
- Observed: mocked tests cover unavailable/cloud/empty-backend conditions. [H03]
- Adopt: clear hook observability and bounded optional discovery latency.
- Adapt: distinguish unavailable optional observers from missing mandatory enforcement.
- Reject: claiming remote execution/isolation properties from frontend event types.
- Defer: an OpenHands remote-workspace adapter; it is unrelated to the first settings/hooks slice.

## 4. Product requirements and architecture invariants

### 4.1 Parent-agent control requirements

- Discover all eligible bundled, user, and trusted project roles.
- Explain unavailable roles without loading their executable resources.
- Choose a role based on description, capabilities, and output expectations.
- Narrow tools per call within the parent's current authority.
- Override reasoning within supported Ice/provider settings.
- Set explicit bounded turn, runtime, tool-call, and returned-output budgets.
- Select context resources without cloning the full transcript.
- Require evidence-backed completion and optionally a restricted structured payload.
- Inspect resolved settings and why a requested override was rejected.
- Send bounded follow-up to an eligible retained live child through existing Ice steering.
- Cancel work independently of whether optional notification hooks succeed.
- Keep each child result untrusted until parent verification completes.

### 4.2 Configuration requirements

- Use the existing SettingsManager as the only writer of global/project settings.
- Add a namespaced ICE settings section rather than another settings.json location.
- Preserve unrelated upstream settings and existing trust semantics.
- Keep role prose in Markdown profiles rather than bloating settings.json with prompts.
- Record source provenance for every resolved operational setting.
- Distinguish defaults, caller requests, enforced caps, and final effective values.
- Reject unknown security-sensitive keys rather than silently ignoring a misspelling.
- Never store provider keys, generated catalogs, or runtime transcripts in role configuration.
- Treat the model's tool arguments as requests, not permission grants.
- Apply configuration changes to future launches unless a setting has an explicitly safe live-update contract.

### 4.3 Non-negotiable boundaries

- Ice remains the sole authoritative reasoning/tool loop.
- No second provider SDK, model registry, session store, planner, or compaction engine.
- `ice` remains behaviorally unchanged when ICE features are absent.
- `plan` and `review` stay read-only regardless of profile capabilities.
- Deny wins over allow and ask.
- Missing approval in headless execution blocks the gated action.
- Project trust grants eligibility, not unlimited authority.
- Safe children keep ambient extension, MCP, network, and credential expansion disabled.
- Ordinary writers use the existing isolated writer workflow.
- Explicit YOLO remains visibly unsafe and must not be relabeled sandboxed.
- Child recursion and direct sibling messaging remain disabled.
- Required checks and observed artifacts determine completion.
- Model claims and hook opinions cannot clear failed mandatory verification.
- Parent/session ownership is required for lifecycle control and result access.
- Ambiguous non-idempotent dispatch is not automatically replayed after a crash.
- Existing intentional functionality is not removed without user approval.

## 5. Proposed configuration contract

### 5.1 Namespace and ownership

The following JSON is a design example, not a supported configuration today.
Use `ice.subagents` for operational defaults and `ice.hooks` for configured parent-owned hooks.
Review the final namespace with existing ICE settings conventions before committing the schema.
Keep parsing/resolution in a small ICE module; keep file persistence in SettingsManager.
Extend shared settings types/access only where a demonstrated extension seam is insufficient.
Do not change global settings precedence for stock Ice.

```json
{
  "ice": {
    "subagents": {
      "enabled": true,
      "defaults": {
        "thinking": "medium",
        "timeoutMs": 120000,
        "maxTurns": 12,
        "maxToolCalls": 40,
        "maxOutputBytes": 24576
      },
      "allowedRoles": ["explore", "planner", "review", "security"],
      "roleDefaults": {
        "security": { "thinking": "high", "maxTurns": 16 }
      },
      "modelSelection": { "mode": "inherit-parent" }
    },
    "hooks": {
      "enabled": false,
      "definitions": []
    }
  }
}
```

### 5.2 Resolution order for ordinary defaults

1. Bundled operational defaults establish complete base values.
2. Global ICE defaults specialize the base.
3. Trusted project ICE defaults specialize global preferences.
4. The selected role's existing metadata supplies role-specific defaults.
5. Global per-role settings override the selected role's operational defaults.
6. Trusted project per-role settings override global per-role preferences.
7. Validated per-call overrides specialize the requested launch.
8. Enforced limits cap or reject the request; they are not another preference layer.
9. The resulting contract freezes source identities, hashes, and effective values.
10. Queue admission captures that contract before any asynchronous worker starts.

### 5.3 Security-sensitive merge rules

- Keep security rules separate from generic recursive object merging.
- `allowedRoles` at more-restrictive layers intersects; it never unions authority.
- A project may narrow the global allowed role set but cannot enable a globally denied role.
- Role aliases are resolved before eligibility checks so aliases cannot bypass restrictions.
- Tool requests intersect parent-active tools, role capabilities, and mode/policy eligibility.
- Hard budgets use the most restrictive applicable cap.
- Optional preference overrides exceeding caps receive an explicit diagnostic or rejection.
- Invalid security policy blocks delegation rather than falling back to permissive defaults.
- Hook definitions merge by stable ID under explicit rules, not incidental array concatenation.
- A project cannot replace or disable a mandatory global enforcement hook.
- A per-call hook selection may reference approved optional hooks only.
- A tool call cannot include executable hook source, arbitrary shell text, or an approval bypass.
- Unknown keys inside enforcement objects are errors.
- Unknown unrelated upstream settings remain governed by existing upstream behavior.

### 5.4 Role definition improvements

- Preserve the existing Markdown/frontmatter profile format.
- Keep `name`, `description`, tools, thinking, timeout, resources, and source hashes.
- Add only proven operational metadata rather than a second role definition dialect.
- Prefer optional tags for discoverability over dozens of bundled specialist roles.
- Add optional bounded output-contract references after their validator exists.
- Add optional approved hook IDs after hook eligibility is implemented.
- Add explicit role availability reasons to the existing profile listing projection.
- Do not reinterpret an existing ignored `model` field until the routing decision is approved.
- Do not automatically load foreign `.claude/agents` directories.
- Reuse explicit import adapters with per-file provenance and reviewed conversion diagnostics.
- Adding a profile does not add a new permission tier.
- Adding a profile must not auto-install dependencies or run setup scripts.

## 6. Proposed invocation contract

### 6.1 Preserve the existing primitives

- Keep `delegate` for foreground delegation.
- Keep `delegate_async` for owner-scoped durable jobs.
- Keep `delegate_batch` for bounded sibling fanout.
- Keep `review_batch` for review-specific evidence contracts.
- Keep `delegate_write` separate from read/review role invocation.
- Keep current contextPacket, resources, scope.targets, preflight, and acceptanceCriteria support.
- Add a shared optional `execution` object to eligible facades rather than unrelated flat fields.
- Do not silently add writer powers to `delegate` because a profile says “coder”.
- Do not replace the durable job registry with `background: true` on the foreground runner.

### 6.2 Proposed execution fields

- `thinking`: a Ice-supported requested reasoning level validated against the selected model route.
- `tools`: a requested subset of known eligible built-ins; empty explicitly means no tools if supported.
- `maxTurns`: bounded model-turn budget with a documented final-report reservation.
- `maxToolCalls`: bounded dispatch count, not merely a prompt instruction.
- `maxOutputBytes`: maximum parent-facing serialized result size.
- Existing top-level `timeoutMs` remains authoritative until an explicitly reviewed schema simplification.
- Do not introduce a duplicate nested timeout field in the initial slice.
- `model`: deferred pending architecture approval; an exact route reference, never credentials or endpoint construction.
- Do not expose temperature/top_p initially; there is no measured requirement justifying those controls yet.
- Reject unsupported reasoning/model combinations before consuming a child run.

### 6.3 Proposed example invocation

```json
{
  "role": "security",
  "task": "Review hook input handling and report concrete authority bypasses.",
  "scope": {
    "roots": ["packages/coding-agent"],
    "targets": ["packages/coding-agent/src/ice-subagents.ts"]
  },
  "contextMode": "fresh",
  "timeoutMs": 120000,
  "execution": {
    "thinking": "high",
    "tools": ["read", "grep", "find"],
    "maxTurns": 10,
    "maxToolCalls": 30,
    "maxOutputBytes": 16384
  },
  "acceptanceCriteria": [
    {
      "id": "hook-boundary",
      "requirement": "Identify concrete defects or explain the inspected boundary with file evidence.",
      "required": true,
      "evidence": "finding",
      "dimension": "security"
    }
  ]
}
```

### 6.4 Result contract evolution

- Retain the existing verified bounded JSON envelope as the authoritative outer result.
- Optional custom output belongs in a bounded nested payload, not a replacement envelope.
- Start with named result formats or a restricted schema subset.
- Validate the schema before dispatch, including recursion/depth/size limits.
- Disable remote schema references and executable custom validators.
- Keep schema validity distinct from factual evidence and verification success.
- Preserve contradictions across independent reviewers rather than voting them away.
- Store oversized evidence as artifacts with explicit truncation metadata.
- Do not truncate JSON bytes arbitrarily and then present invalid JSON as a valid result.
- A final-report repair is bounded and charged to the same run budget.

## 7. Proposed lifecycle hooks

### 7.1 Integration model

Run hook orchestration in the trusted parent-owned ICE adapter.
Safe children still receive no ambient extension discovery.
Reuse Ice tool/event seams when they provide the needed authority and timing.
Use a small explicit awaited dispatcher for decisions; use the event bus only for observations.
Any proposed new shared event API requires a failing integration test proving existing seams insufficient.
No hook may create another agent loop or dispatch recursive children.

### 7.2 Event taxonomy

- `subagent.beforeLaunch`: decision hook after input normalization and before committed launch.
- `subagent.started`: observation after durable/foreground launch ownership is established.
- `subagent.beforeTool`: decision hook at the final child-tool execution boundary.
- `subagent.afterTool`: observation of success or failure without rewriting observed facts.
- `subagent.checkpoint`: bounded progress observation at a safe boundary.
- `subagent.attention`: observation/request when a child needs permitted parent attention.
- `subagent.beforeAccept`: decision hook before accepting a validated candidate result.
- `subagent.completed`: terminal observation after verification outcome is recorded.
- `subagent.failed`: terminal observation for execution/validation failure.
- `subagent.timedOut`: terminal observation for deadline exhaustion.
- `subagent.cancelled`: terminal observation after cancellation state is recorded.
- These are proposed ICE event names, not claims about existing Ice event names.
- Hook event taxonomy must map to existing terminal states without inventing contradictory lifecycle states.

### 7.3 Hook definition sketch

```json
{
  "id": "review-launch-policy",
  "event": "subagent.beforeLaunch",
  "roles": ["review", "security"],
  "kind": "command",
  "argv": ["node", "scripts/check-subagent-request.mjs"],
  "timeoutMs": 1500,
  "maxOutputBytes": 8192,
  "required": true
}
```

- This example is proposed and disabled unless hook execution is separately approved.
- A trusted repository is necessary but not sufficient authorization to execute the command.
- Command hooks require an independent executable-policy decision, including in plan/review mode.
- Plan/review must not launch side-effecting commands just because the event is a “hook”.
- The initial safe slice should support parent-owned in-process policy handlers before external commands.
- In-process handlers are trusted application/extension code, not model-generated JavaScript.
- Shell interpolation is forbidden; use an argv array and bounded JSON stdin.
- Environment starts from an explicit allowlist; do not inherit every host secret.
- Executable files and scripts need canonical identity, trust provenance, and launch-time revalidation.

### 7.4 Hook outcomes and ordering

- Decision outcomes are `continue`, `deny`, or `ask`; context additions are a separate bounded field.
- Any deny is sticky for the pending action.
- Ask cannot weaken a deny and requires an approval-capable owner client.
- Missing headless approval fails closed.
- Required hook timeout, malformed output, or crash blocks the gated action.
- Optional observational hook failure emits a diagnostic and does not change recorded execution facts.
- Global mandatory hooks precede optional global hooks, then eligible project/role hooks.
- Stable declaration order breaks ties within a source layer.
- All hooks see immutable input snapshots unless a deliberately typed patch contract is approved.
- V1 should reject tool-argument mutation rather than inherit implicit mutable-hook behavior.
- If a later version allows patches, revalidate schema, scope, budgets, and tool eligibility after every patch.
- A beforeAccept hook may reject completion but cannot promote a failed verifier to success.

### 7.5 Cancellation, retries, and side effects

- Cancellation is not subject to approval from a user hook.
- A hanging hook must not prevent the runtime from reaching its cancellation path.
- External hook process cleanup is best-effort unless an independent sandbox proves stronger guarantees.
- Observation events use stable IDs so consumers can deduplicate delivery.
- Do not promise exactly-once external side effects from an append-only journal.
- Persist hook dispatch intent and outcome where restart ambiguity matters.
- On restart, mark ambiguous side-effecting hook execution unresolved; do not rerun automatically.
- Hook-triggered notifications and network requests require explicit external-side-effect policy.
- Local traces are default; external telemetry remains opt-in.
- Redact before persistence and before sending any hook payload outside the parent trust boundary.

## 8. Parent supervision and child continuity

- Existing foreground user takeover is not the same as model-callable supervision. [P01], [P11]
- Existing durable background jobs remain non-steerable in the current documented slice. [P01]
- Add model-callable follow-up only after owner and lifecycle-state rules are explicit.
- Prefer extending one existing management surface over many always-visible tools.
- Inspect returns bounded status, effective settings, remaining budget, and artifact references.
- Follow-up carries a stable request ID and bounded untrusted task data.
- Only the owning parent may target a retained live child.
- A sibling, foreign session, stale run ID, or arbitrary session path must be rejected.
- Native Ice steer/followUp APIs execute the message; no alternative conversation engine is introduced.
- User takeover and model steering need an explicit mutual-exclusion policy.
- Reserve a final-report turn after steering when the current implementation requires structured finalization.
- A completed historical view does not become a mutable live session merely because it is selectable.
- Resume after restart remains deferred; durable interruption must not silently become relaunch.
- Budget extension is bounded by the original parent/session cap and must be recorded.
- Deferred continuation must never retry a non-idempotent tool whose outcome is unknown.

## 9. Module and test ownership map

- Existing orchestration/schema seam: `packages/coding-agent/src/ice-subagents.ts`.
- Existing configuration owner: `packages/coding-agent/src/core/settings-manager.ts`.
- Existing guard integration: `packages/coding-agent/src/ice-safe-verify.ts`.
- Existing durable owner: `packages/coding-agent/src/ice-subagent-jobs.ts`.
- Existing child-view seam: `packages/coding-agent/src/ice-agent-view-bridge.ts`.
- Existing environment probes: `packages/coding-agent/src/ice-subagent-preflight.ts`.
- Existing profile import: `packages/coding-agent/src/ice-agent-packs.ts`.
- Proposed helper: `ice-subagent-settings.ts` only if resolution needs an independent testable module.
- Proposed helper: `ice-subagent-hooks.ts` only when an awaited dispatcher is implemented.
- Proposed helper: `ice-subagent-contract.ts` only if shared facade resolution otherwise duplicates logic.
- Do not create any of these proposed modules empty.
- Do not extract the 10k-line subagent implementation wholesale as a prerequisite to feature work.
- Proposed test file names below are provisional and should follow the branch's actual conventions.
- Reuse existing faux-provider/session harnesses; no real endpoints, keys, or paid tokens in default tests.
- Source test commands are requirements, not results already observed for this plan.

## 10. Ordered implementation work packages

Each work package is a bounded review unit, not permission to implement the whole roadmap at once.
Dependencies use W identifiers; independent packages can be reviewed separately but share the same policy contract.
The acceptance criteria below preserve the original proposal intent. The current status for each package is recorded in the implementation ledger in section 10.1; historical `proposed` labels in the package blocks are not current-tree status.
### W01 — Baseline behavior ledger

- Status: proposed; not implemented by this document.
- Depends on: none.
- Source basis: [P01], [P02], [P04].
- Integration target: `ice-subagents.ts; docs/settings.md`.
- Problem to solve: Earlier conversation understated existing roles and settings.
- Scope rule: implement only this contract; preserve unrelated dirty changes.

Implementation sequence:
1. Record all current delegation schemas and profile names.
2. Capture mode/tool eligibility in safe and explicit YOLO fixtures.
3. Mark each requested feature existing, partial, missing, or policy-changing.
4. Reinspect the complete affected files and installed API types before writing the change.
5. Add the focused regression coverage below before widening facade exposure.
6. Record observed outputs and unresolved failures in the implementation evidence packet.

Acceptance and verification:
- Required outcome: Ledger matches schemas and includes eleven roles plus custom profiles.
- Targeted coverage: ice-subagents.test.ts baseline catalog and facade fixtures.
- Verification evidence: exact command, exit status, fixture identity, and relevant artifact path.
- Completion authority: observed checks, not the child's summary or a hook's confidence.

Safety and rollback:
- Principal risk: False missing-feature claims cause duplicate implementation.
- Rollback boundary: Documentation-only correction can be revised without changing runtime.
- Review gate: do not proceed to dependent authority-expanding work with a failed mandatory check.
### W02 — Baseline provenance snapshot

- Status: proposed; not implemented by this document.
- Depends on: W01.
- Source basis: [P01], [O03], [M06], [C02], [H01].
- Integration target: `local evidence artifacts`.
- Problem to solve: Reference paths are mutable and prior audit reports may be stale.
- Scope rule: implement only this contract; preserve unrelated dirty changes.

Implementation sequence:
1. Capture branch, dirty paths, reference HEADs, and cited file hashes.
2. Record active node/npm versions without installing dependencies.
3. Store capped source evidence and explicit unrun checks.
4. Reinspect the complete affected files and installed API types before writing the change.
5. Add the focused regression coverage below before widening facade exposure.
6. Record observed outputs and unresolved failures in the implementation evidence packet.

Acceptance and verification:
- Required outcome: A reviewer can locate the exact source snapshot behind every claim.
- Targeted coverage: A provider-free evidence-manifest validation script.
- Verification evidence: exact command, exit status, fixture identity, and relevant artifact path.
- Completion authority: observed checks, not the child's summary or a hook's confidence.

Safety and rollback:
- Principal risk: Do not capture Git remotes, environment values, or auth files unnecessarily.
- Rollback boundary: Delete only newly created evidence artifacts after explicit cleanup approval.
- Review gate: do not proceed to dependent authority-expanding work with a failed mandatory check.
### W03 — Configuration schema decision

- Status: proposed; not implemented by this document.
- Depends on: W01.
- Source basis: [P03], [P04], [M08].
- Integration target: `proposed ice-subagent-settings.ts`.
- Problem to solve: Generic settings merge cannot express deny-first policy safely.
- Scope rule: implement only this contract; preserve unrelated dirty changes.

Implementation sequence:
1. Specify ice.subagents and ice.hooks fields with strict nested validation.
2. Separate operational defaults from restrictions and mandatory hooks.
3. Document absent, empty, invalid, disabled, and unsupported values.
4. Reinspect the complete affected files and installed API types before writing the change.
5. Add the focused regression coverage below before widening facade exposure.
6. Record observed outputs and unresolved failures in the implementation evidence packet.

Acceptance and verification:
- Required outcome: Schema distinguishes preferences from authority-bearing fields.
- Targeted coverage: proposed ice-subagent-settings.test.ts schema cases.
- Verification evidence: exact command, exit status, fixture identity, and relevant artifact path.
- Completion authority: observed checks, not the child's summary or a hook's confidence.

Safety and rollback:
- Principal risk: Unknown enforcement keys must fail closed rather than disappear.
- Rollback boundary: Feature stays disabled until schema and resolver are both ready.
- Review gate: do not proceed to dependent authority-expanding work with a failed mandatory check.
### W04 — SettingsManager integration seam

- Status: proposed; not implemented by this document.
- Depends on: W03.
- Source basis: [P03], [P07], [P13].
- Integration target: `core/settings-manager.ts`.
- Problem to solve: A new config layer must not create a second writer or lose unrelated settings.
- Scope rule: implement only this contract; preserve unrelated dirty changes.

Implementation sequence:
1. Inspect the complete manager and its scoped persistence implementation.
2. Add the smallest typed access needed for the ICE namespace.
3. Route writes, flush, and diagnostics through existing manager APIs.
4. Reinspect the complete affected files and installed API types before writing the change.
5. Add the focused regression coverage below before widening facade exposure.
6. Record observed outputs and unresolved failures in the implementation evidence packet.

Acceptance and verification:
- Required outcome: Global/project writes preserve unrelated keys and report durability errors.
- Targeted coverage: settings-manager.test.ts plus ICE namespace persistence cases.
- Verification evidence: exact command, exit status, fixture identity, and relevant artifact path.
- Completion authority: observed checks, not the child's summary or a hook's confidence.

Safety and rollback:
- Principal risk: Concurrent sessions must not overwrite unrelated modifications.
- Rollback boundary: Disable namespace consumers; retain harmless settings data for manual review.
- Review gate: do not proceed to dependent authority-expanding work with a failed mandatory check.
### W05 — Deterministic defaults resolver

- Status: proposed; not implemented by this document.
- Depends on: W03 W04.
- Source basis: [P02], [P03], [M06].
- Integration target: `proposed settings/contract helper`.
- Problem to solve: Different facades can otherwise derive different execution defaults.
- Scope rule: implement only this contract; preserve unrelated dirty changes.

Implementation sequence:
1. Implement the documented ordinary preference order as a pure function.
2. Attach per-field source labels and rejected-request reasons.
3. Freeze the validated result before it reaches a runner.
4. Reinspect the complete affected files and installed API types before writing the change.
5. Add the focused regression coverage below before widening facade exposure.
6. Record observed outputs and unresolved failures in the implementation evidence packet.

Acceptance and verification:
- Required outcome: Equivalent inputs produce equivalent resolved contracts across facades.
- Targeted coverage: table-driven precedence tests including role and per-call layers.
- Verification evidence: exact command, exit status, fixture identity, and relevant artifact path.
- Completion authority: observed checks, not the child's summary or a hook's confidence.

Safety and rollback:
- Principal risk: Generic deep merge is not permission evaluation.
- Rollback boundary: Keep current default behavior when the new namespace is absent.
- Review gate: do not proceed to dependent authority-expanding work with a failed mandatory check.
### W06 — Security restriction composition

- Status: proposed; not implemented by this document.
- Depends on: W05.
- Source basis: [P01], [O04], [M04], [M05].
- Integration target: `existing policy boundary plus resolver`.
- Problem to solve: Project and per-call settings must never widen parent authority.
- Scope rule: implement only this contract; preserve unrelated dirty changes.

Implementation sequence:
1. Normalize aliases before allowed-role intersection.
2. Intersect active tools, role requests, mode policy, and caller subset.
3. Apply deny-first decisions and minimum applicable hard caps.
4. Reinspect the complete affected files and installed API types before writing the change.
5. Add the focused regression coverage below before widening facade exposure.
6. Record observed outputs and unresolved failures in the implementation evidence packet.

Acceptance and verification:
- Required outcome: A more-specific allow cannot defeat a broader applicable deny.
- Targeted coverage: property tests for monotonic narrowing and alias denial.
- Verification evidence: exact command, exit status, fixture identity, and relevant artifact path.
- Completion authority: observed checks, not the child's summary or a hook's confidence.

Safety and rollback:
- Principal risk: Wildcard expansion and empty sets must not accidentally mean unrestricted.
- Rollback boundary: Block new override fields while preserving existing safe launches.
- Review gate: do not proceed to dependent authority-expanding work with a failed mandatory check.
### W07 — Scoped settings diagnostics

- Status: proposed; not implemented by this document.
- Depends on: W04 W05.
- Source basis: [P03], [P13], [R03].
- Integration target: `existing settings/RPC projection`.
- Problem to solve: Users need to know what persisted and what only changed in memory.
- Scope rule: implement only this contract; preserve unrelated dirty changes.

Implementation sequence:
1. Expose global/project/effective values with redacted provenance.
2. Show parse, trust, flush, and unknown-key diagnostics distinctly.
3. Do not expose full settings blobs through model-visible status.
4. Reinspect the complete affected files and installed API types before writing the change.
5. Add the focused regression coverage below before widening facade exposure.
6. Record observed outputs and unresolved failures in the implementation evidence packet.

Acceptance and verification:
- Required outcome: A failed save is visible and never reported as persisted.
- Targeted coverage: settings projection tests with write failures and untrusted projects.
- Verification evidence: exact command, exit status, fixture identity, and relevant artifact path.
- Completion authority: observed checks, not the child's summary or a hook's confidence.

Safety and rollback:
- Principal risk: Settings can contain unrelated sensitive values.
- Rollback boundary: Disable the new projection without changing stored settings.
- Review gate: do not proceed to dependent authority-expanding work with a failed mandatory check.
### W08 — Profile discovery UX

- Status: proposed; not implemented by this document.
- Depends on: W01 W06.
- Source basis: [P02], [O01], [M02], [R01].
- Integration target: `list_subagent_profiles; profile summary`.
- Problem to solve: Existing custom profiles are difficult to discover from a short role list.
- Scope rule: implement only this contract; preserve unrelated dirty changes.

Implementation sequence:
1. Extend bounded summaries with source, tags, eligibility, and effective tool class.
2. Preserve existing nearest-directory and trusted-source lookup semantics.
3. Include exact diagnostics for invalid, shadowed, and untrusted definitions.
4. Reinspect the complete affected files and installed API types before writing the change.
5. Add the focused regression coverage below before widening facade exposure.
6. Record observed outputs and unresolved failures in the implementation evidence packet.

Acceptance and verification:
- Required outcome: A query explains why a profile is unavailable without executing it.
- Targeted coverage: ice-subagents.test.ts discovery and projection cases.
- Verification evidence: exact command, exit status, fixture identity, and relevant artifact path.
- Completion authority: observed checks, not the child's summary or a hook's confidence.

Safety and rollback:
- Principal risk: Do not load untrusted role instructions just to render a preview.
- Rollback boundary: Retain current profile listing fields if optional detail is disabled.
- Review gate: do not proceed to dependent authority-expanding work with a failed mandatory check.
### W09 — Role authoring templates

- Status: proposed; not implemented by this document.
- Depends on: W08.
- Source basis: [P02], [P08], [M01], [R01].
- Integration target: `documentation and example agents`.
- Problem to solve: More useful roles should not require hardcoded production branches.
- Scope rule: implement only this contract; preserve unrelated dirty changes.

Implementation sequence:
1. Write concise frontend, migration, API-review, and verifier profile examples.
2. Explain expertise versus granted tools and safe-mode limitations.
3. Document source hashing, resources, and model-ignore behavior today.
4. Reinspect the complete affected files and installed API types before writing the change.
5. Add the focused regression coverage below before widening facade exposure.
6. Record observed outputs and unresolved failures in the implementation evidence packet.

Acceptance and verification:
- Required outcome: Examples use the existing profile parser and do not imply unsupported powers.
- Targeted coverage: Parse example fixtures with existing loader tests.
- Verification evidence: exact command, exit status, fixture identity, and relevant artifact path.
- Completion authority: observed checks, not the child's summary or a hook's confidence.

Safety and rollback:
- Principal risk: A verifier requesting Bash still cannot run Bash in safe read-only mode.
- Rollback boundary: Remove only new examples if rejected; retain existing role catalog.
- Review gate: do not proceed to dependent authority-expanding work with a failed mandatory check.
### W10 — Profile metadata validation

- Status: proposed; not implemented by this document.
- Depends on: W08 W09.
- Source basis: [P02], [O02], [M01].
- Integration target: `loadProfilesFromDirectory`.
- Problem to solve: Adding tags/contracts/hooks can weaken a previously bounded profile parser.
- Scope rule: implement only this contract; preserve unrelated dirty changes.

Implementation sequence:
1. Define exact bounds and accepted types for new optional metadata.
2. Keep canonical paths and launch-time hash revalidation.
3. Reject unknown authority-bearing fields with source-aware diagnostics.
4. Reinspect the complete affected files and installed API types before writing the change.
5. Add the focused regression coverage below before widening facade exposure.
6. Record observed outputs and unresolved failures in the implementation evidence packet.

Acceptance and verification:
- Required outcome: Malformed new metadata cannot cause partial permissive profile loading.
- Targeted coverage: profile parser tests for oversized fields, duplicates, and symlink swaps.
- Verification evidence: exact command, exit status, fixture identity, and relevant artifact path.
- Completion authority: observed checks, not the child's summary or a hook's confidence.

Safety and rollback:
- Principal risk: Do not reinterpret ignored model metadata before routing approval.
- Rollback boundary: Ignore no new security field silently; disabled feature reports unsupported metadata.
- Review gate: do not proceed to dependent authority-expanding work with a failed mandatory check.
### W11 — Explicit agent import review

- Status: proposed; not implemented by this document.
- Depends on: W09 W10.
- Source basis: [P08], [M02], [C04].
- Integration target: `ice-agent-packs.ts`.
- Problem to solve: Foreign agent formats do not share tools, trust, or licensing semantics.
- Scope rule: implement only this contract; preserve unrelated dirty changes.

Implementation sequence:
1. Keep imports explicit and data-only.
2. Report unsupported fields and tools rather than granting nearest equivalents.
3. Attach source path/hash and reviewed license provenance to generated examples.
4. Reinspect the complete affected files and installed API types before writing the change.
5. Add the focused regression coverage below before widening facade exposure.
6. Record observed outputs and unresolved failures in the implementation evidence packet.

Acceptance and verification:
- Required outcome: Importing a role neither executes code nor expands tool authority.
- Targeted coverage: ice-agent-packs.test.ts conversion and conflict fixtures.
- Verification evidence: exact command, exit status, fixture identity, and relevant artifact path.
- Completion authority: observed checks, not the child's summary or a hook's confidence.

Safety and rollback:
- Principal risk: Archived proprietary instructions require independent recreation, not license assumption.
- Rollback boundary: Do not overwrite existing roles; rejected import leaves originals unchanged.
- Review gate: do not proceed to dependent authority-expanding work with a failed mandatory check.
### W12 — Shared execution override schema

- Status: proposed; not implemented by this document.
- Depends on: W05 W06.
- Source basis: [P02], [M03], [O02].
- Integration target: `delegateParameters and related facade schemas`.
- Problem to solve: Parent control needs typed fields rather than instructions hidden in task prose.
- Scope rule: implement only this contract; preserve unrelated dirty changes.

Implementation sequence:
1. Add optional execution.thinking/tools/maxTurns/maxToolCalls/maxOutputBytes.
2. Keep current timeoutMs instead of introducing competing timeout locations.
3. Use one shared schema definition across eligible read/review facades.
4. Reinspect the complete affected files and installed API types before writing the change.
5. Add the focused regression coverage below before widening facade exposure.
6. Record observed outputs and unresolved failures in the implementation evidence packet.

Acceptance and verification:
- Required outcome: Schema rejects unsupported fields and preserves calls without overrides.
- Targeted coverage: schema tests for delegate, async, batch, and review parity.
- Verification evidence: exact command, exit status, fixture identity, and relevant artifact path.
- Completion authority: observed checks, not the child's summary or a hook's confidence.

Safety and rollback:
- Principal risk: Do not add writer controls to read-only schemas implicitly.
- Rollback boundary: Disable execution overrides with an explicit feature gate if integration fails.
- Review gate: do not proceed to dependent authority-expanding work with a failed mandatory check.
### W13 — Reasoning override resolution

- Status: proposed; not implemented by this document.
- Depends on: W12.
- Source basis: [P02], [P07], [O02].
- Integration target: `launch contract and Ice thinking APIs`.
- Problem to solve: Profiles have thinking defaults but the parent cannot request task-specific effort.
- Scope rule: implement only this contract; preserve unrelated dirty changes.

Implementation sequence:
1. Resolve requested effort through current Ice-supported reasoning metadata.
2. Reject unsupported effort before creating a child session.
3. Record requested and effective values without provider-specific guesses.
4. Reinspect the complete affected files and installed API types before writing the change.
5. Add the focused regression coverage below before widening facade exposure.
6. Record observed outputs and unresolved failures in the implementation evidence packet.

Acceptance and verification:
- Required outcome: A reasoning override never changes the selected provider route.
- Targeted coverage: faux-model reasoning support and unsupported-value tests.
- Verification evidence: exact command, exit status, fixture identity, and relevant artifact path.
- Completion authority: observed checks, not the child's summary or a hook's confidence.

Safety and rollback:
- Principal risk: Model-specific reasoning labels are not universally interchangeable.
- Rollback boundary: Omitted override continues using existing profile thinking behavior.
- Review gate: do not proceed to dependent authority-expanding work with a failed mandatory check.
### W14 — Per-call tool narrowing

- Status: proposed; not implemented by this document.
- Depends on: W06 W12.
- Source basis: [P02], [M03], [M05], [C02].
- Integration target: `scoped child-tool construction`.
- Problem to solve: Prompt-only tool requests cannot enforce least privilege.
- Scope rule: implement only this contract; preserve unrelated dirty changes.

Implementation sequence:
1. Resolve the caller subset after profile and mode eligibility.
2. Expose only effective tools to the child model.
3. Repeat denial at final dispatch even for stale or forged tool calls.
4. Reinspect the complete affected files and installed API types before writing the change.
5. Add the focused regression coverage below before widening facade exposure.
6. Record observed outputs and unresolved failures in the implementation evidence packet.

Acceptance and verification:
- Required outcome: A disallowed tool is never executed even if the child requests it.
- Targeted coverage: forged-tool and empty-subset tests with dispatch spies.
- Verification evidence: exact command, exit status, fixture identity, and relevant artifact path.
- Completion authority: observed checks, not the child's summary or a hook's confidence.

Safety and rollback:
- Principal risk: Unknown tools must not be classified read-only by a friendly name.
- Rollback boundary: Reject narrowing requests if their semantics cannot be enforced consistently.
- Review gate: do not proceed to dependent authority-expanding work with a failed mandatory check.
### W15 — Turn budget enforcement

- Status: proposed; not implemented by this document.
- Depends on: W12.
- Source basis: [P07], [O02], [C02].
- Integration target: `native child session lifecycle`.
- Problem to solve: A maxTurns field is misleading unless the runner actually stops.
- Scope rule: implement only this contract; preserve unrelated dirty changes.

Implementation sequence:
1. Define a turn using Ice session events and document retry accounting.
2. Reserve bounded structured-final-report capacity within the same total.
3. Abort or finalize at a deterministic safe boundary on exhaustion.
4. Reinspect the complete affected files and installed API types before writing the change.
5. Add the focused regression coverage below before widening facade exposure.
6. Record observed outputs and unresolved failures in the implementation evidence packet.

Acceptance and verification:
- Required outcome: Observed turn count cannot exceed the documented boundary allowance.
- Targeted coverage: faux-provider multi-turn and final-report budget tests.
- Verification evidence: exact command, exit status, fixture identity, and relevant artifact path.
- Completion authority: observed checks, not the child's summary or a hook's confidence.

Safety and rollback:
- Principal risk: Streaming provider calls may overshoot token estimates; do not claim token-hard bounds here.
- Rollback boundary: Omit the new field until enforced rather than accepting a prompt-only limit.
- Review gate: do not proceed to dependent authority-expanding work with a failed mandatory check.
### W16 — Tool-call budget enforcement

- Status: proposed; not implemented by this document.
- Depends on: W14 W15.
- Source basis: [P02], [C02], [M07].
- Integration target: `final scoped tool wrapper`.
- Problem to solve: Parallel tool calls can oversubscribe a naively checked shared counter.
- Scope rule: implement only this contract; preserve unrelated dirty changes.

Implementation sequence:
1. Reserve tool-call capacity before dispatch.
2. Use deterministic admission across concurrent requested calls.
3. Release only reservations that never executed and record terminal counts.
4. Reinspect the complete affected files and installed API types before writing the change.
5. Add the focused regression coverage below before widening facade exposure.
6. Record observed outputs and unresolved failures in the implementation evidence packet.

Acceptance and verification:
- Required outcome: Actual dispatched calls stay within the cap under concurrent scheduling.
- Targeted coverage: parallel dispatch budget-race tests.
- Verification evidence: exact command, exit status, fixture identity, and relevant artifact path.
- Completion authority: observed checks, not the child's summary or a hook's confidence.

Safety and rollback:
- Principal risk: Cancellation cannot refund a side-effecting call whose outcome is unknown.
- Rollback boundary: Block further dispatch on accounting ambiguity and retain evidence.
- Review gate: do not proceed to dependent authority-expanding work with a failed mandatory check.
### W17 — Output budget accounting

- Status: proposed; not implemented by this document.
- Depends on: W12 W15.
- Source basis: [P02], [M03].
- Integration target: `result serializer and batch reservations`.
- Problem to solve: Returned bytes and generated tokens are distinct resources.
- Scope rule: implement only this contract; preserve unrelated dirty changes.

Implementation sequence:
1. Count UTF-8 bytes of the complete serialized parent-facing envelope.
2. Reserve metadata/error space before accepting a payload.
3. Keep batch and async reservations consistent with per-call output limits.
4. Reinspect the complete affected files and installed API types before writing the change.
5. Add the focused regression coverage below before widening facade exposure.
6. Record observed outputs and unresolved failures in the implementation evidence packet.

Acceptance and verification:
- Required outcome: Unicode and large errors cannot exceed the documented result budget.
- Targeted coverage: serialized-envelope boundary tests across all facades.
- Verification evidence: exact command, exit status, fixture identity, and relevant artifact path.
- Completion authority: observed checks, not the child's summary or a hook's confidence.

Safety and rollback:
- Principal risk: Never slice JSON mid-byte or drop mandatory failure fields.
- Rollback boundary: Fall back to a bounded valid failure envelope with artifact reference.
- Review gate: do not proceed to dependent authority-expanding work with a failed mandatory check.
### W18 — Aggregate budget integration

- Status: proposed; not implemented by this document.
- Depends on: W15 W16 W17.
- Source basis: [P01], [P10], [M06].
- Integration target: `SubagentJobRegistry and batch scheduler`.
- Problem to solve: Independent child limits can still exceed parent aggregate reservations.
- Scope rule: implement only this contract; preserve unrelated dirty changes.

Implementation sequence:
1. Reserve parent budget before accepting queued or parallel work.
2. Charge retries and report-finalization to the same run accounting.
3. Release unused reservations exactly once on terminal transition.
4. Reinspect the complete affected files and installed API types before writing the change.
5. Add the focused regression coverage below before widening facade exposure.
6. Record observed outputs and unresolved failures in the implementation evidence packet.

Acceptance and verification:
- Required outcome: Queue cancellation and retry paths preserve aggregate budget invariants.
- Targeted coverage: ice-subagent-jobs.test.ts and batch accounting tests.
- Verification evidence: exact command, exit status, fixture identity, and relevant artifact path.
- Completion authority: observed checks, not the child's summary or a hook's confidence.

Safety and rollback:
- Principal risk: A second budget ledger must not compete with the existing scheduler owner.
- Rollback boundary: Stop admission while retaining inspect/cancel for already accepted jobs.
- Review gate: do not proceed to dependent authority-expanding work with a failed mandatory check.
### W19 — Model-routing architecture gate

- Status: proposed; not implemented by this document.
- Depends on: W02 W05.
- Source basis: [P01], [P02], [O03], [C03].
- Integration target: `idea.md decision record only`.
- Problem to solve: Per-child model routing intentionally contradicts current exact-parent policy.
- Scope rule: implement only this contract; preserve unrelated dirty changes.

Implementation sequence:
1. Present measured use cases, cost, credential, and route-provenance implications.
2. Request explicit approval before altering runtime or ignored profile fields.
3. If approved, update idea.md with default inheritance and opt-in routing limits.
4. Reinspect the complete affected files and installed API types before writing the change.
5. Add the focused regression coverage below before widening facade exposure.
6. Record observed outputs and unresolved failures in the implementation evidence packet.

Acceptance and verification:
- Required outcome: A recorded decision either approves a bounded slice or defers it explicitly.
- Targeted coverage: No routing implementation test is claimed before approval.
- Verification evidence: exact command, exit status, fixture identity, and relevant artifact path.
- Completion authority: observed checks, not the child's summary or a hook's confidence.

Safety and rollback:
- Principal risk: A feature planning request does not authorize a policy override.
- Rollback boundary: Keep exact parent Model object inheritance unchanged if approval is absent.
- Review gate: do not proceed to dependent authority-expanding work with a failed mandatory check.
### W20 — Optional Ice-owned route resolution

- Status: proposed; not implemented by this document.
- Depends on: W19 approval required.
- Source basis: [P07], [O02], [O03].
- Integration target: `ModelRuntime via existing SDK seam`.
- Problem to solve: Approved routing must not become another provider registry or SDK.
- Scope rule: implement only this contract; preserve unrelated dirty changes.

Implementation sequence:
1. Accept only exact configured route references or inherit-parent.
2. Resolve available models through Ice-owned runtime/catalog APIs.
3. Validate tools, reasoning, context, and output metadata before admission.
4. Reinspect the complete affected files and installed API types before writing the change.
5. Add the focused regression coverage below before widening facade exposure.
6. Record observed outputs and unresolved failures in the implementation evidence packet.

Acceptance and verification:
- Required outcome: Invalid route or missing credentials causes preflight failure without network discovery.
- Targeted coverage: faux runtime route-selection and capability tests.
- Verification evidence: exact command, exit status, fixture identity, and relevant artifact path.
- Completion authority: observed checks, not the child's summary or a hook's confidence.

Safety and rollback:
- Principal risk: Never persist keys or generated model catalogs in project settings.
- Rollback boundary: Disable opt-in route selection and return to inherit-parent defaults.
- Review gate: do not proceed to dependent authority-expanding work with a failed mandatory check.
### W21 — Async route snapshot provenance

- Status: proposed; not implemented by this document.
- Depends on: W20.
- Source basis: [P01], [P10], [O03].
- Integration target: `durable acceptance and launch contract`.
- Problem to solve: Queued work must not silently use a newly selected parent model.
- Scope rule: implement only this contract; preserve unrelated dirty changes.

Implementation sequence:
1. Capture approved route identity and runtime generation at acceptance.
2. Revalidate credential availability without replaying auth mutation.
3. Report stale/unavailable captured route rather than silently substituting another.
4. Reinspect the complete affected files and installed API types before writing the change.
5. Add the focused regression coverage below before widening facade exposure.
6. Record observed outputs and unresolved failures in the implementation evidence packet.

Acceptance and verification:
- Required outcome: Parent model changes do not reroute already accepted jobs.
- Targeted coverage: queued job model-switch and unavailable-runtime tests.
- Verification evidence: exact command, exit status, fixture identity, and relevant artifact path.
- Completion authority: observed checks, not the child's summary or a hook's confidence.

Safety and rollback:
- Principal risk: Do not serialize live Model objects or credentials into session entries.
- Rollback boundary: Mark captured-route launch failure explicitly; do not auto-fallback.
- Review gate: do not proceed to dependent authority-expanding work with a failed mandatory check.
### W22 — Context selection refinement

- Status: proposed; not implemented by this document.
- Depends on: W12.
- Source basis: [P01], [P02], [P07].
- Integration target: `contextPacket and fork sanitizer`.
- Problem to solve: More parent control should not mean unrestricted transcript cloning.
- Scope rule: implement only this contract; preserve unrelated dirty changes.

Implementation sequence:
1. Extend selection with bounded references to already authorized context.
2. Preserve fresh default and sanitized fork semantics.
3. Record source IDs and dropped/redacted/truncated item counts.
4. Reinspect the complete affected files and installed API types before writing the change.
5. Add the focused regression coverage below before widening facade exposure.
6. Record observed outputs and unresolved failures in the implementation evidence packet.

Acceptance and verification:
- Required outcome: No settings/auth/session file can be smuggled through generic context roots.
- Targeted coverage: context packet and fork redaction regression tests.
- Verification evidence: exact command, exit status, fixture identity, and relevant artifact path.
- Completion authority: observed checks, not the child's summary or a hook's confidence.

Safety and rollback:
- Principal risk: Parent notes and verified-fact labels remain untrusted text to the child.
- Rollback boundary: Retain current contextPacket semantics if selection refinement is disabled.
- Review gate: do not proceed to dependent authority-expanding work with a failed mandatory check.
### W23 — Structured result subset

- Status: proposed; not implemented by this document.
- Depends on: W17.
- Source basis: [P02], [M03], [M06].
- Integration target: `existing verified result envelope`.
- Problem to solve: Custom output contracts can undermine mandatory completion evidence.
- Scope rule: implement only this contract; preserve unrelated dirty changes.

Implementation sequence:
1. Keep current envelope and place optional custom data under a bounded payload.
2. Support named formats or a restricted local JSON schema subset.
3. Validate schema depth/size/refs before child creation.
4. Reinspect the complete affected files and installed API types before writing the change.
5. Add the focused regression coverage below before widening facade exposure.
6. Record observed outputs and unresolved failures in the implementation evidence packet.

Acceptance and verification:
- Required outcome: Remote refs, recursive bombs, and unsupported schema features fail preflight.
- Targeted coverage: proposed result-contract tests using provider-free payload fixtures.
- Verification evidence: exact command, exit status, fixture identity, and relevant artifact path.
- Completion authority: observed checks, not the child's summary or a hook's confidence.

Safety and rollback:
- Principal risk: Do not add a dependency before reviewing existing validator APIs and license.
- Rollback boundary: Use existing typed results when custom output is disabled.
- Review gate: do not proceed to dependent authority-expanding work with a failed mandatory check.
### W24 — Result verification integration

- Status: proposed; not implemented by this document.
- Depends on: W23.
- Source basis: [P01], [P02], [M06].
- Integration target: `acceptance criteria and verifier path`.
- Problem to solve: Schema-valid output may still lack evidence or claim false completion.
- Scope rule: implement only this contract; preserve unrelated dirty changes.

Implementation sequence:
1. Validate envelope, payload, evidence paths, and acceptance criteria separately.
2. Keep required verifier outcomes authoritative.
3. Allow at most the already approved bounded repair budget.
4. Reinspect the complete affected files and installed API types before writing the change.
5. Add the focused regression coverage below before widening facade exposure.
6. Record observed outputs and unresolved failures in the implementation evidence packet.

Acceptance and verification:
- Required outcome: Failed mandatory criteria stay failed after payload repair or hook execution.
- Targeted coverage: valid-JSON false-claim and stale-evidence tests.
- Verification evidence: exact command, exit status, fixture identity, and relevant artifact path.
- Completion authority: observed checks, not the child's summary or a hook's confidence.

Safety and rollback:
- Principal risk: Model self-assessment is never the final acceptance authority.
- Rollback boundary: Return failed verification with preserved diagnostic/artifact references.
- Review gate: do not proceed to dependent authority-expanding work with a failed mandatory check.
### W25 — Hook event contract

- Status: proposed; not implemented by this document.
- Depends on: W03 W12.
- Source basis: [P05], [P06], [M07], [H02].
- Integration target: `proposed ice-subagent-hooks.ts`.
- Problem to solve: Generic events do not specify awaited decisions or durable correlation.
- Scope rule: implement only this contract; preserve unrelated dirty changes.

Implementation sequence:
1. Define versioned event envelopes with owner/run/attempt/event IDs.
2. Separate decision hooks from observational hooks.
3. Specify lifecycle ordering, field bounds, and terminal-state mapping.
4. Reinspect the complete affected files and installed API types before writing the change.
5. Add the focused regression coverage below before widening facade exposure.
6. Record observed outputs and unresolved failures in the implementation evidence packet.

Acceptance and verification:
- Required outcome: Each event has an explicit emission boundary and permitted outcome set.
- Targeted coverage: hook event codec and lifecycle ordering tests.
- Verification evidence: exact command, exit status, fixture identity, and relevant artifact path.
- Completion authority: observed checks, not the child's summary or a hook's confidence.

Safety and rollback:
- Principal risk: Do not add core events unless existing extension seams are proven insufficient.
- Rollback boundary: Keep configured hooks disabled until dispatcher and policy tests pass.
- Review gate: do not proceed to dependent authority-expanding work with a failed mandatory check.
### W26 — Hook configuration resolver

- Status: proposed; not implemented by this document.
- Depends on: W06 W10 W25.
- Source basis: [P03], [M08], [H01].
- Integration target: `ICE settings resolver`.
- Problem to solve: Array merging can accidentally replace mandatory global enforcement.
- Scope rule: implement only this contract; preserve unrelated dirty changes.

Implementation sequence:
1. Resolve stable hook IDs with source and trust provenance.
2. Prevent project/role/caller removal of required global hooks.
3. Reject duplicate ambiguous IDs and unsupported event/outcome combinations.
4. Reinspect the complete affected files and installed API types before writing the change.
5. Add the focused regression coverage below before widening facade exposure.
6. Record observed outputs and unresolved failures in the implementation evidence packet.

Acceptance and verification:
- Required outcome: Effective hook order is deterministic and policy cannot be weakened locally.
- Targeted coverage: mandatory-hook shadowing and duplicate-ID tests.
- Verification evidence: exact command, exit status, fixture identity, and relevant artifact path.
- Completion authority: observed checks, not the child's summary or a hook's confidence.

Safety and rollback:
- Principal risk: Trusting a project is not approval for every executable hook.
- Rollback boundary: Invalid required configuration disables delegation with an actionable diagnostic.
- Review gate: do not proceed to dependent authority-expanding work with a failed mandatory check.
### W27 — Parent-owned in-process dispatcher

- Status: proposed; not implemented by this document.
- Depends on: W25 W26.
- Source basis: [P06], [P12], [M07].
- Integration target: `existing parent extension adapter`.
- Problem to solve: Safe children must not receive arbitrary extension loading to support hooks.
- Scope rule: implement only this contract; preserve unrelated dirty changes.

Implementation sequence:
1. Add an awaited typed dispatcher owned by the parent adapter.
2. Pass frozen bounded payloads to approved handlers.
3. Publish separate redacted observational events after authoritative decisions.
4. Reinspect the complete affected files and installed API types before writing the change.
5. Add the focused regression coverage below before widening facade exposure.
6. Record observed outputs and unresolved failures in the implementation evidence packet.

Acceptance and verification:
- Required outcome: No child resource discovery or recursive delegation becomes enabled.
- Targeted coverage: dispatcher handler ordering, rejection, and no-child-extension tests.
- Verification evidence: exact command, exit status, fixture identity, and relevant artifact path.
- Completion authority: observed checks, not the child's summary or a hook's confidence.

Safety and rollback:
- Principal risk: The shared event bus is observational and cannot return authorization.
- Rollback boundary: Disable new hook registration without changing Ice extension lifecycle.
- Review gate: do not proceed to dependent authority-expanding work with a failed mandatory check.
### W28 — Before-launch enforcement

- Status: proposed; not implemented by this document.
- Depends on: W27.
- Source basis: [P02], [P09], [M06].
- Integration target: `last preflight before child admission`.
- Problem to solve: Launch hooks can race source changes or reserve resources too early.
- Scope rule: implement only this contract; preserve unrelated dirty changes.

Implementation sequence:
1. Normalize inputs and resolve eligibility before invoking policy handlers.
2. Revalidate sources and final contract after allowed context additions.
3. Record block/ask outcome before allocating a child run.
4. Reinspect the complete affected files and installed API types before writing the change.
5. Add the focused regression coverage below before widening facade exposure.
6. Record observed outputs and unresolved failures in the implementation evidence packet.

Acceptance and verification:
- Required outcome: Denied launch consumes no provider request and leaves no accepted orphan job.
- Targeted coverage: denied launch, changed profile, and async admission tests.
- Verification evidence: exact command, exit status, fixture identity, and relevant artifact path.
- Completion authority: observed checks, not the child's summary or a hook's confidence.

Safety and rollback:
- Principal risk: A hook may not expand tools, roots, model route, or approval state.
- Rollback boundary: Return explicit preflight failure and release only uncommitted reservations.
- Review gate: do not proceed to dependent authority-expanding work with a failed mandatory check.
### W29 — Final tool-boundary hook enforcement

- Status: proposed; not implemented by this document.
- Depends on: W14 W27.
- Source basis: [P05], [M07], [C02].
- Integration target: `scoped child tool wrappers`.
- Problem to solve: Mutable tool-call hooks can invalidate a guard decision made earlier.
- Scope rule: implement only this contract; preserve unrelated dirty changes.

Implementation sequence:
1. Invoke decision hooks at the actual scoped-tool dispatch boundary.
2. For V1 forbid argument mutation and validate immutable input schema.
3. If future patches are supported, rerun scope and authority checks afterward.
4. Reinspect the complete affected files and installed API types before writing the change.
5. Add the focused regression coverage below before widening facade exposure.
6. Record observed outputs and unresolved failures in the implementation evidence packet.

Acceptance and verification:
- Required outcome: A path/tool mutation cannot bypass final authorization.
- Targeted coverage: forged post-hook path and malformed-input tests.
- Verification evidence: exact command, exit status, fixture identity, and relevant artifact path.
- Completion authority: observed checks, not the child's summary or a hook's confidence.

Safety and rollback:
- Principal risk: Do not claim existing mutable-hook contracts revalidate automatically.
- Rollback boundary: Block affected tool on hook/output ambiguity, preserving original arguments as redacted evidence.
- Review gate: do not proceed to dependent authority-expanding work with a failed mandatory check.
### W30 — Hook approval handling

- Status: proposed; not implemented by this document.
- Depends on: W28 W29.
- Source basis: [P01], [P06].
- Integration target: `existing approval-capable parent UI/RPC seam`.
- Problem to solve: Ask outcomes cannot silently become allows in headless modes.
- Scope rule: implement only this contract; preserve unrelated dirty changes.

Implementation sequence:
1. Map ask to existing owner approval capability.
2. Persist/request only bounded redacted decision context.
3. Keep deny sticky across all hooks and late approvals.
4. Reinspect the complete affected files and installed API types before writing the change.
5. Add the focused regression coverage below before widening facade exposure.
6. Record observed outputs and unresolved failures in the implementation evidence packet.

Acceptance and verification:
- Required outcome: Missing or foreign approval never starts the gated action.
- Targeted coverage: interactive mock approval and headless fail-closed tests.
- Verification evidence: exact command, exit status, fixture identity, and relevant artifact path.
- Completion authority: observed checks, not the child's summary or a hook's confidence.

Safety and rollback:
- Principal risk: Approval identity cannot be supplied by a model-controlled JSON field.
- Rollback boundary: Leave action pending/blocked according to existing approval semantics.
- Review gate: do not proceed to dependent authority-expanding work with a failed mandatory check.
### W31 — Optional command-hook execution gate

- Status: proposed; not implemented by this document.
- Depends on: W27 W30.
- Source basis: [P01], [H01], [M07].
- Integration target: `parent command execution adapter`.
- Problem to solve: Command hooks introduce real filesystem/process/network authority.
- Scope rule: implement only this contract; preserve unrelated dirty changes.

Implementation sequence:
1. Require explicit executable policy separate from project trust.
2. Keep command hooks disabled in ordinary read-only plan/review unless an independent safe boundary permits them.
3. Resolve argv, cwd, and executable identity without shell interpolation.
4. Reinspect the complete affected files and installed API types before writing the change.
5. Add the focused regression coverage below before widening facade exposure.
6. Record observed outputs and unresolved failures in the implementation evidence packet.

Acceptance and verification:
- Required outcome: Trust alone cannot cause a repository script to execute.
- Targeted coverage: command gate tests across build/plan/review and headless modes.
- Verification evidence: exact command, exit status, fixture identity, and relevant artifact path.
- Completion authority: observed checks, not the child's summary or a hook's confidence.

Safety and rollback:
- Principal risk: A local trusted command can still read host credentials absent isolation.
- Rollback boundary: Disable command hooks independently while preserving in-process policy handlers.
- Review gate: do not proceed to dependent authority-expanding work with a failed mandatory check.
### W32 — Command-hook payload and environment

- Status: proposed; not implemented by this document.
- Depends on: W31.
- Source basis: [P01], [H02].
- Integration target: `hook subprocess boundary`.
- Problem to solve: Hook stdin, argv, and environment can leak or reinterpret untrusted content.
- Scope rule: implement only this contract; preserve unrelated dirty changes.

Implementation sequence:
1. Send versioned bounded JSON through stdin rather than shell text.
2. Use explicit environment allowlist and scoped cwd.
3. Validate/redact stdout before it can affect context or traces.
4. Reinspect the complete affected files and installed API types before writing the change.
5. Add the focused regression coverage below before widening facade exposure.
6. Record observed outputs and unresolved failures in the implementation evidence packet.

Acceptance and verification:
- Required outcome: Metacharacters remain data and secret sentinel values never reach fixtures/logs.
- Targeted coverage: argv injection, stdin cap, env-redaction tests.
- Verification evidence: exact command, exit status, fixture identity, and relevant artifact path.
- Completion authority: observed checks, not the child's summary or a hook's confidence.

Safety and rollback:
- Principal risk: Executable policy does not by itself sandbox filesystem or network.
- Rollback boundary: Terminate and classify malformed command output as required-hook failure.
- Review gate: do not proceed to dependent authority-expanding work with a failed mandatory check.
### W33 — Hook deadline and cleanup

- Status: proposed; not implemented by this document.
- Depends on: W31 W32.
- Source basis: [P01], [M07], [H01].
- Integration target: `existing process cleanup utility after inspection`.
- Problem to solve: A hanging hook can block launch or cancellation indefinitely.
- Scope rule: implement only this contract; preserve unrelated dirty changes.

Implementation sequence:
1. Apply monotonic per-hook and aggregate hook deadlines.
2. Bound stdout/stderr streams and close stdin on cancellation.
3. Propagate abort to approved process cleanup without claiming perfect host containment.
4. Reinspect the complete affected files and installed API types before writing the change.
5. Add the focused regression coverage below before widening facade exposure.
6. Record observed outputs and unresolved failures in the implementation evidence packet.

Acceptance and verification:
- Required outcome: Required timeout blocks action within a tested bounded interval.
- Targeted coverage: fake-clock handler tests and local no-network process fixtures.
- Verification evidence: exact command, exit status, fixture identity, and relevant artifact path.
- Completion authority: observed checks, not the child's summary or a hook's confidence.

Safety and rollback:
- Principal risk: Descendant process termination is platform-dependent and must be reported honestly.
- Rollback boundary: Disable command hooks if cleanup cannot meet the documented boundary.
- Review gate: do not proceed to dependent authority-expanding work with a failed mandatory check.
### W34 — Hook result semantics

- Status: proposed; not implemented by this document.
- Depends on: W27 W32.
- Source basis: [P01], [M07], [H02].
- Integration target: `decision/result validator`.
- Problem to solve: A hook can return malformed or contradictory outcomes.
- Scope rule: implement only this contract; preserve unrelated dirty changes.

Implementation sequence:
1. Validate exact continue/deny/ask result shape with bounded reason/context.
2. Keep original tool failures immutable in after-tool observers.
3. Prevent beforeAccept from clearing failed deterministic verification.
4. Reinspect the complete affected files and installed API types before writing the change.
5. Add the focused regression coverage below before widening facade exposure.
6. Record observed outputs and unresolved failures in the implementation evidence packet.

Acceptance and verification:
- Required outcome: Malformed required output fails closed and observers cannot forge success.
- Targeted coverage: contradictory outcomes, invalid JSON, and failure-masking tests.
- Verification evidence: exact command, exit status, fixture identity, and relevant artifact path.
- Completion authority: observed checks, not the child's summary or a hook's confidence.

Safety and rollback:
- Principal risk: Do not treat stdout containing the word allow as an authorization protocol.
- Rollback boundary: Reject the hook result and preserve primary execution failure.
- Review gate: do not proceed to dependent authority-expanding work with a failed mandatory check.
### W35 — Hook persistence and retry ambiguity

- Status: proposed; not implemented by this document.
- Depends on: W25 W33 W34.
- Source basis: [P01], [P10], [C02].
- Integration target: `extension-owned session entries`.
- Problem to solve: Crash recovery must not duplicate non-idempotent hook side effects.
- Scope rule: implement only this contract; preserve unrelated dirty changes.

Implementation sequence:
1. Journal stable event IDs plus dispatch intent/outcome for side-effecting hooks.
2. Classify restart-without-outcome as unresolved rather than rerun.
3. Deduplicate observational delivery without promising exactly-once external effects.
4. Reinspect the complete affected files and installed API types before writing the change.
5. Add the focused regression coverage below before widening facade exposure.
6. Record observed outputs and unresolved failures in the implementation evidence packet.

Acceptance and verification:
- Required outcome: A crash after dispatch does not automatically execute the same command again.
- Targeted coverage: crash-window journal replay tests.
- Verification evidence: exact command, exit status, fixture identity, and relevant artifact path.
- Completion authority: observed checks, not the child's summary or a hook's confidence.

Safety and rollback:
- Principal risk: Append-only records do not prove an external notification was delivered exactly once.
- Rollback boundary: Retain unresolved entries and require owner inspection for recovery.
- Review gate: do not proceed to dependent authority-expanding work with a failed mandatory check.
### W36 — Hook observability projections

- Status: proposed; not implemented by this document.
- Depends on: W25 W35.
- Source basis: [P12], [H02], [H03].
- Integration target: `existing observatory/agent view`.
- Problem to solve: Users need success/block/failure evidence without raw secret-rich payloads.
- Scope rule: implement only this contract; preserve unrelated dirty changes.

Implementation sequence:
1. Render hook ID, event, duration, status, and capped redacted reason.
2. Expose correlation IDs and artifact references rather than full stdin/env.
3. Distinguish optional unavailable observation from mandatory enforcement failure.
4. Reinspect the complete affected files and installed API types before writing the change.
5. Add the focused regression coverage below before widening facade exposure.
6. Record observed outputs and unresolved failures in the implementation evidence packet.

Acceptance and verification:
- Required outcome: UI/RPC show matching authoritative status with bounded output.
- Targeted coverage: projection snapshots including ANSI/control characters and long reasons.
- Verification evidence: exact command, exit status, fixture identity, and relevant artifact path.
- Completion authority: observed checks, not the child's summary or a hook's confidence.

Safety and rollback:
- Principal risk: Do not expose raw hook commands containing secrets in status views.
- Rollback boundary: Hide optional detail while keeping mandatory failure diagnostics visible.
- Review gate: do not proceed to dependent authority-expanding work with a failed mandatory check.
### W37 — Cancellation independence

- Status: proposed; not implemented by this document.
- Depends on: W18 W33 W35.
- Source basis: [P01], [P10], [O03].
- Integration target: `existing cancel/supervisor paths`.
- Problem to solve: Cancellation must not wait for a hostile or broken user hook to approve it.
- Scope rule: implement only this contract; preserve unrelated dirty changes.

Implementation sequence:
1. Record cancellation intent through existing owner state machine.
2. Abort active child/hook work independently of notification success.
3. Emit terminal hook observation only after authoritative transition.
4. Reinspect the complete affected files and installed API types before writing the change.
5. Add the focused regression coverage below before widening facade exposure.
6. Record observed outputs and unresolved failures in the implementation evidence packet.

Acceptance and verification:
- Required outcome: A hanging cancelled observer cannot keep the job active.
- Targeted coverage: cancellation races at queue, preflight, tool, and finalization boundaries.
- Verification evidence: exact command, exit status, fixture identity, and relevant artifact path.
- Completion authority: observed checks, not the child's summary or a hook's confidence.

Safety and rollback:
- Principal risk: Best-effort host process cleanup must not be mislabeled deterministic sandbox termination.
- Rollback boundary: Retain cancelled/cleanup-incomplete distinction and stop admission if required.
- Review gate: do not proceed to dependent authority-expanding work with a failed mandatory check.
### W38 — Model-callable supervision contract

- Status: proposed; not implemented by this document.
- Depends on: W12 W18.
- Source basis: [P01], [P07], [O03], [R02].
- Integration target: `manage_subagent and existing owner checks`.
- Problem to solve: User takeover exists but parent-model follow-up is a separate capability.
- Scope rule: implement only this contract; preserve unrelated dirty changes.

Implementation sequence:
1. Define inspect/followUp/extend/stop eligibility for retained live foreground runs.
2. Require owner-bound run IDs and idempotent control request IDs.
3. Keep historical and durable background handles explicitly unsupported initially.
4. Reinspect the complete affected files and installed API types before writing the change.
5. Add the focused regression coverage below before widening facade exposure.
6. Record observed outputs and unresolved failures in the implementation evidence packet.

Acceptance and verification:
- Required outcome: Unsupported lifecycle state returns a typed error without spawning a replacement child.
- Targeted coverage: supervision schema and owner/state matrix tests.
- Verification evidence: exact command, exit status, fixture identity, and relevant artifact path.
- Completion authority: observed checks, not the child's summary or a hook's confidence.

Safety and rollback:
- Principal risk: Do not accept arbitrary session paths or foreign task IDs.
- Rollback boundary: Keep existing management actions and disable only proposed follow-up capability.
- Review gate: do not proceed to dependent authority-expanding work with a failed mandatory check.
### W39 — Native follow-up adapter

- Status: proposed; not implemented by this document.
- Depends on: W38.
- Source basis: [P07], [P11].
- Integration target: `Ice AgentSession steer/followUp seam`.
- Problem to solve: Continuity must reuse Ice rather than construct a competing message loop.
- Scope rule: implement only this contract; preserve unrelated dirty changes.

Implementation sequence:
1. Route bounded follow-up to the existing retained native session.
2. Charge continued work to remaining run budget.
3. Preserve the existing structured final-report requirement after steering.
4. Reinspect the complete affected files and installed API types before writing the change.
5. Add the focused regression coverage below before widening facade exposure.
6. Record observed outputs and unresolved failures in the implementation evidence packet.

Acceptance and verification:
- Required outcome: Follow-up does not reset scope, mode, tools, or accumulated usage.
- Targeted coverage: faux-session follow-up and final-report tests.
- Verification evidence: exact command, exit status, fixture identity, and relevant artifact path.
- Completion authority: observed checks, not the child's summary or a hook's confidence.

Safety and rollback:
- Principal risk: Native prompt-template expansion must not introduce unapproved resources.
- Rollback boundary: Reject unsupported expansion or state transitions instead of falling back to a fresh run.
- Review gate: do not proceed to dependent authority-expanding work with a failed mandatory check.
### W40 — User/model control arbitration

- Status: proposed; not implemented by this document.
- Depends on: W39.
- Source basis: [P01], [P11], [P14].
- Integration target: `IceAgentViewBridge integration`.
- Problem to solve: User takeover and model steering can issue conflicting instructions.
- Scope rule: implement only this contract; preserve unrelated dirty changes.

Implementation sequence:
1. Define explicit ownership while a user has taken control.
2. Reject or queue model follow-up according to one documented policy.
3. Release control on return/cancel and preserve chronological provenance.
4. Reinspect the complete affected files and installed API types before writing the change.
5. Add the focused regression coverage below before widening facade exposure.
6. Record observed outputs and unresolved failures in the implementation evidence packet.

Acceptance and verification:
- Required outcome: No simultaneous controller can silently overwrite another pending instruction.
- Targeted coverage: bridge control-state and follow-up race tests.
- Verification evidence: exact command, exit status, fixture identity, and relevant artifact path.
- Completion authority: observed checks, not the child's summary or a hook's confidence.

Safety and rollback:
- Principal risk: The bridge remains presentation/control routing, never scheduler authority.
- Rollback boundary: Return to mirror mode and keep parent runtime authoritative.
- Review gate: do not proceed to dependent authority-expanding work with a failed mandatory check.
### W41 — Budget extension policy

- Status: proposed; not implemented by this document.
- Depends on: W18 W38.
- Source basis: [P01], [P10].
- Integration target: `existing management/supervisor seam`.
- Problem to solve: Time extension must not bypass original session caps.
- Scope rule: implement only this contract; preserve unrelated dirty changes.

Implementation sequence:
1. Validate extension against remaining parent allowance and terminal state.
2. Record previous/effective deadline and approval provenance.
3. Prevent repeated small extensions from exceeding the aggregate cap.
4. Reinspect the complete affected files and installed API types before writing the change.
5. Add the focused regression coverage below before widening facade exposure.
6. Record observed outputs and unresolved failures in the implementation evidence packet.

Acceptance and verification:
- Required outcome: Cumulative extensions are bounded and inspectable.
- Targeted coverage: extension accumulation, expiry, and concurrent stop tests.
- Verification evidence: exact command, exit status, fixture identity, and relevant artifact path.
- Completion authority: observed checks, not the child's summary or a hook's confidence.

Safety and rollback:
- Principal risk: A late extend request cannot resurrect a terminal run.
- Rollback boundary: Reject extension and preserve original deadline if accounting is ambiguous.
- Review gate: do not proceed to dependent authority-expanding work with a failed mandatory check.
### W42 — Durable facade consistency

- Status: proposed; not implemented by this document.
- Depends on: W18 W28 W35.
- Source basis: [P01], [P10], [M06].
- Integration target: `delegate_async and SubagentJobRegistry`.
- Problem to solve: New settings/hooks can drift between accepted and promoted jobs.
- Scope rule: implement only this contract; preserve unrelated dirty changes.

Implementation sequence:
1. Persist bounded contract identity at acceptance.
2. Revalidate trust/source availability before promotion without re-resolving preferences.
3. Map preflight/hook failure to existing owner-scoped terminal records.
4. Reinspect the complete affected files and installed API types before writing the change.
5. Add the focused regression coverage below before widening facade exposure.
6. Record observed outputs and unresolved failures in the implementation evidence packet.

Acceptance and verification:
- Required outcome: Queued jobs preserve accepted defaults and fail explicitly when authority disappears.
- Targeted coverage: queue settings-reload, trust-revocation, and hook-failure tests.
- Verification evidence: exact command, exit status, fixture identity, and relevant artifact path.
- Completion authority: observed checks, not the child's summary or a hook's confidence.

Safety and rollback:
- Principal risk: Do not re-run already dispatched required hooks after restart ambiguity.
- Rollback boundary: Pause new admissions; allow owner inspect/cancel of retained jobs.
- Review gate: do not proceed to dependent authority-expanding work with a failed mandatory check.
### W43 — Batch and review facade consistency

- Status: proposed; not implemented by this document.
- Depends on: W12 W18 W24 W28.
- Source basis: [P02], [M06].
- Integration target: `delegate_batch; review_batch`.
- Problem to solve: Per-task overrides must not bypass aggregate or review-specific validation.
- Scope rule: implement only this contract; preserve unrelated dirty changes.

Implementation sequence:
1. Resolve each sibling contract through the same pure resolver.
2. Preserve deterministic result order despite asynchronous completion.
3. Retain review dimensions and contradiction evidence in outer results.
4. Reinspect the complete affected files and installed API types before writing the change.
5. Add the focused regression coverage below before widening facade exposure.
6. Record observed outputs and unresolved failures in the implementation evidence packet.

Acceptance and verification:
- Required outcome: Identical single and batch requests have identical effective authority.
- Targeted coverage: single/batch/review equivalence and failFast tests.
- Verification evidence: exact command, exit status, fixture identity, and relevant artifact path.
- Completion authority: observed checks, not the child's summary or a hook's confidence.

Safety and rollback:
- Principal risk: One invalid task must follow an explicit preflight/admission policy rather than partial surprise dispatch.
- Rollback boundary: Reject the batch before dispatch when required preflight policy fails.
- Review gate: do not proceed to dependent authority-expanding work with a failed mandatory check.
### W44 — Writer boundary preservation

- Status: proposed; not implemented by this document.
- Depends on: W06 W24 W28.
- Source basis: [P01], [P02].
- Integration target: `delegate_write and patch workflow`.
- Problem to solve: Richer profiles could accidentally bypass the isolated writer primitive.
- Scope rule: implement only this contract; preserve unrelated dirty changes.

Implementation sequence:
1. Keep normal writer launch requirements and isolated workspace policy unchanged.
2. Apply only compatible new settings through a separate reviewed writer contract.
3. Preserve clean base, patch provenance, verification, and rollback checks.
4. Reinspect the complete affected files and installed API types before writing the change.
5. Add the focused regression coverage below before widening facade exposure.
6. Record observed outputs and unresolved failures in the implementation evidence packet.

Acceptance and verification:
- Required outcome: New read/review controls cannot produce parent-workspace writes.
- Targeted coverage: existing writer adversarial tests plus cross-facade denial cases.
- Verification evidence: exact command, exit status, fixture identity, and relevant artifact path.
- Completion authority: observed checks, not the child's summary or a hook's confidence.

Safety and rollback:
- Principal risk: Explicit YOLO exception must stay separately labeled and approved.
- Rollback boundary: Do not migrate writer behavior until all existing writer gates pass.
- Review gate: do not proceed to dependent authority-expanding work with a failed mandatory check.
### W45 — Settings and role UI

- Status: proposed; not implemented by this document.
- Depends on: W07 W08 W36.
- Source basis: [P04], [P14], [H02].
- Integration target: `existing /settings and agent chooser`.
- Problem to solve: Users need discoverable configuration without a replacement frontend.
- Scope rule: implement only this contract; preserve unrelated dirty changes.

Implementation sequence:
1. Add lazy ICE sections showing defaults, roles, and hook status.
2. Provide source-aware edits using existing scoped persistence.
3. Use configurable keybindings and existing TUI components.
4. Reinspect the complete affected files and installed API types before writing the change.
5. Add the focused regression coverage below before widening facade exposure.
6. Record observed outputs and unresolved failures in the implementation evidence packet.

Acceptance and verification:
- Required outcome: Narrow terminals show bounded readable source and failure information.
- Targeted coverage: targeted settings/agent-view render and keybinding tests.
- Verification evidence: exact command, exit status, fixture identity, and relevant artifact path.
- Completion authority: observed checks, not the child's summary or a hook's confidence.

Safety and rollback:
- Principal risk: Do not write project settings without current project trust.
- Rollback boundary: Hide ICE UI additions when disabled; stock Ice UI remains unchanged.
- Review gate: do not proceed to dependent authority-expanding work with a failed mandatory check.
### W46 — RPC and headless projection

- Status: proposed; not implemented by this document.
- Depends on: W07 W30 W36 W45.
- Source basis: [P03], [P06], [P07].
- Integration target: `existing RPC settings/tool result seams`.
- Problem to solve: Headless clients need the same contract without accidental interactive prompts.
- Scope rule: implement only this contract; preserve unrelated dirty changes.

Implementation sequence:
1. Expose bounded effective configuration and validation diagnostics.
2. Route supported writes through current scoped settings APIs.
3. Represent asks as pending/denied based on actual client approval capability.
4. Reinspect the complete affected files and installed API types before writing the change.
5. Add the focused regression coverage below before widening facade exposure.
6. Record observed outputs and unresolved failures in the implementation evidence packet.

Acceptance and verification:
- Required outcome: No RPC call waits on an unavailable interactive picker.
- Targeted coverage: targeted RPC settings and delegation transport tests.
- Verification evidence: exact command, exit status, fixture identity, and relevant artifact path.
- Completion authority: observed checks, not the child's summary or a hook's confidence.

Safety and rollback:
- Principal risk: A JSON boolean from the model is not session-wide authorization.
- Rollback boundary: Keep new RPC fields optional until clients explicitly request them.
- Review gate: do not proceed to dependent authority-expanding work with a failed mandatory check.
### W47 — Reload and trust revocation

- Status: proposed; not implemented by this document.
- Depends on: W05 W26 W42.
- Source basis: [P02], [P03], [P04].
- Integration target: `settings reload and profile revalidation`.
- Problem to solve: Hot reload can change authority during an active or queued run.
- Scope rule: implement only this contract; preserve unrelated dirty changes.

Implementation sequence:
1. Apply preference changes only to future accepted contracts.
2. Immediately enforce applicable authority revocation at the next safe boundary.
3. Avoid executing newly discovered project hooks until trust and approval are resolved.
4. Reinspect the complete affected files and installed API types before writing the change.
5. Add the focused regression coverage below before widening facade exposure.
6. Record observed outputs and unresolved failures in the implementation evidence packet.

Acceptance and verification:
- Required outcome: Queued/running work never gains authority merely because settings reload.
- Targeted coverage: reload with profile edits, trust revocation, and queued launches.
- Verification evidence: exact command, exit status, fixture identity, and relevant artifact path.
- Completion authority: observed checks, not the child's summary or a hook's confidence.

Safety and rollback:
- Principal risk: Failing required config must not silently reuse a permissive stale policy.
- Rollback boundary: Block new launches and surface last-valid versus invalid policy distinctly.
- Review gate: do not proceed to dependent authority-expanding work with a failed mandatory check.
### W48 — Telemetry and artifact hygiene

- Status: proposed; not implemented by this document.
- Depends on: W17 W35 W36.
- Source basis: [P01], [H02].
- Integration target: `existing redaction/artifact adapters`.
- Problem to solve: Richer controls increase the amount of sensitive provenance being recorded.
- Scope rule: implement only this contract; preserve unrelated dirty changes.

Implementation sequence:
1. Record hashes, route IDs, effective tools, budgets, and hook outcomes.
2. Redact before writes and enforce retention/size limits.
3. Keep raw large outputs outside model context with validated references.
4. Reinspect the complete affected files and installed API types before writing the change.
5. Add the focused regression coverage below before widening facade exposure.
6. Record observed outputs and unresolved failures in the implementation evidence packet.

Acceptance and verification:
- Required outcome: Secret sentinels are absent from persisted and model-visible artifacts.
- Targeted coverage: artifact redaction, path ownership, and retention tests.
- Verification evidence: exact command, exit status, fixture identity, and relevant artifact path.
- Completion authority: observed checks, not the child's summary or a hook's confidence.

Safety and rollback:
- Principal risk: External telemetry stays disabled unless separately approved.
- Rollback boundary: Disable optional tracing detail without erasing mandatory failure evidence.
- Review gate: do not proceed to dependent authority-expanding work with a failed mandatory check.
### W49 — Provider-free end-to-end gate

- Status: proposed; not implemented by this document.
- Depends on: W37 W42 W43 W44 W46 W47.
- Source basis: [P01], [P07].
- Integration target: `test/suite/harness.ts and faux provider`.
- Problem to solve: Unit tests alone miss cross-facade ownership and lifecycle gaps.
- Scope rule: implement only this contract; preserve unrelated dirty changes.

Implementation sequence:
1. Create focused scenarios through the same production delegation extension.
2. Cover settings, hooks, tools, budgets, cancellation, and result verification together.
3. Assert command/status/artifact evidence rather than generated completion prose.
4. Reinspect the complete affected files and installed API types before writing the change.
5. Add the focused regression coverage below before widening facade exposure.
6. Record observed outputs and unresolved failures in the implementation evidence packet.

Acceptance and verification:
- Required outcome: Mandatory suite passes without provider credentials or network requests.
- Targeted coverage: proposed suite cases using the established faux provider harness.
- Verification evidence: exact command, exit status, fixture identity, and relevant artifact path.
- Completion authority: observed checks, not the child's summary or a hook's confidence.

Safety and rollback:
- Principal risk: Never invoke the full endpoint-sensitive vitest suite for this gate.
- Rollback boundary: Keep new capability opt-in if any mandatory scenario fails.
- Review gate: do not proceed to dependent authority-expanding work with a failed mandatory check.
### W50 — Controlled performance evaluation

- Status: proposed; not implemented by this document.
- Depends on: W49.
- Source basis: [P01], [O02], [M03].
- Integration target: `local benchmark artifacts`.
- Problem to solve: More schema/configuration machinery can cost more than it saves.
- Scope rule: implement only this contract; preserve unrelated dirty changes.

Implementation sequence:
1. Measure schema tokens, launch latency, hook overhead, output size, and verified success.
2. Compare identical models/tasks/budgets with repeated runs.
3. Separate native harness routes from controlled same-model comparisons.
4. Reinspect the complete affected files and installed API types before writing the change.
5. Add the focused regression coverage below before widening facade exposure.
6. Record observed outputs and unresolved failures in the implementation evidence packet.

Acceptance and verification:
- Required outcome: Results include versions, route, effort, runtime, budgets, and repeated-run distribution.
- Targeted coverage: provider-free overhead benchmarks; live comparisons require explicit approval.
- Verification evidence: exact command, exit status, fixture identity, and relevant artifact path.
- Completion authority: observed checks, not the child's summary or a hook's confidence.

Safety and rollback:
- Principal risk: Do not infer quality from one successful demo or star counts.
- Rollback boundary: Remove optional always-visible fields or keep them lazy if overhead lacks benefit.
- Review gate: do not proceed to dependent authority-expanding work with a failed mandatory check.
### W51 — Documentation and architecture update

- Status: proposed; not implemented by this document.
- Depends on: W49 W50.
- Source basis: [P01], [P04], [P06].
- Integration target: `idea.md and coding-agent docs`.
- Problem to solve: Proposed and shipped capabilities must remain visibly distinct.
- Scope rule: implement only this contract; preserve unrelated dirty changes.

Implementation sequence:
1. Document only verified implemented slices as current behavior.
2. Update idea.md when an approved routing/hook authority decision changes.
3. Publish config examples, limits, failure semantics, and source provenance.
4. Reinspect the complete affected files and installed API types before writing the change.
5. Add the focused regression coverage below before widening facade exposure.
6. Record observed outputs and unresolved failures in the implementation evidence packet.

Acceptance and verification:
- Required outcome: Docs agree with schema, tests, and actual enabled defaults.
- Targeted coverage: documentation example parsing and local-link validation.
- Verification evidence: exact command, exit status, fixture identity, and relevant artifact path.
- Completion authority: observed checks, not the child's summary or a hook's confidence.

Safety and rollback:
- Principal risk: No Desktop PASS or harness parity claim without that separate audited workflow.
- Rollback boundary: Revert inaccurate new prose while keeping verified behavior descriptions.
- Review gate: do not proceed to dependent authority-expanding work with a failed mandatory check.
### W52 — Opt-in rollout and rollback drill

- Status: implemented and strictly verified in the current tree; the isolated operator-style drill is recorded in `.artifacts/ice-subagent-control-hooks/rollback-drill.md`.
- Depends on: W49 W51.
- Source basis: [P01], [P10].
- Integration target: `ice launcher feature gates and settings`.
- Problem to solve: A failed rollout must not strand jobs or change stock Ice.
- Scope rule: implement only this contract; preserve unrelated dirty changes.

Implementation sequence:
1. Enable the smallest settings/tool-control slice first.
2. Keep external commands, routing, and continuation independently gated.
3. Test disabling new admissions while inspecting/cancelling existing jobs.
4. Reinspect the complete affected files and installed API types before writing the change.
5. Add the focused regression coverage below before widening facade exposure.
6. Record observed outputs and unresolved failures in the implementation evidence packet.

Acceptance and verification:
- Required outcome: Feature-off startup preserves stock behavior and retained-job observability.
- Targeted coverage: feature-off and rollback fixtures across persisted state versions.
- Verification evidence: exact command, exit status, fixture identity, and relevant artifact path.
- Completion authority: observed checks, not the child's summary or a hook's confidence.

Safety and rollback:
- Principal risk: Do not delete intentional old behavior or archived branches during rollout.
- Rollback boundary: Disable new admissions, preserve journals, finish/cancel owned work explicitly.
- Review gate: do not proceed to dependent authority-expanding work with a failed mandatory check.
### W53 — Mandatory repository checks

- Status: implemented and strictly verified in the current tree; the literal `npm run check` output is recorded in `.artifacts/ice-subagent-control-hooks/repository-checks.txt`.
- Depends on: W49 W52.
- Source basis: [P01], [P13].
- Integration target: `repository verification commands`.
- Problem to solve: Passing focused tests does not replace the required repo check.
- Scope rule: implement only this contract; preserve unrelated dirty changes.

Implementation sequence:
1. Record node/npm versions and targeted test command exit statuses.
2. Use npm 12.0.2 or corepack npm@12.0.2 run check with full output.
3. Separate baseline failures, regressions, warnings, and unrun checks.
4. Reinspect the complete affected files and installed API types before writing the change.
5. Add the focused regression coverage below before widening facade exposure.
6. Record observed outputs and unresolved failures in the implementation evidence packet.

Acceptance and verification:
- Required outcome: Mandatory targeted tests and required check pass before implementation completion.
- Targeted coverage: exact affected test files from package root; no full vitest or npm test.
- Verification evidence: exact command, exit status, fixture identity, and relevant artifact path.
- Completion authority: observed checks, not the child's summary or a hook's confidence.

Safety and rollback:
- Principal risk: Do not alter dependency metadata to evade the required toolchain.
- Rollback boundary: Stop rollout on failures and produce a bounded unresolved evidence report.
- Review gate: do not proceed to dependent authority-expanding work with a failed mandatory check.
### W54 — Final evidence and review packet

- Status: implemented and regenerated for the current tree; the packet is recorded under `.artifacts/ice-subagent-control-hooks/`.
- Depends on: W53.
- Source basis: [P01], [D01], [D02].
- Integration target: `stable implementation evidence directory`.
- Problem to solve: A long plan is not evidence that a feature works.
- Scope rule: implement only this contract; preserve unrelated dirty changes.

Implementation sequence:
1. List changed files/symbols, commands, statuses, artifacts, and remaining risks.
2. Tie each acceptance criterion to observed verification.
3. Request any separate Desktop comparison only through the authorized controller workflow.
4. Reinspect the complete affected files and installed API types before writing the change.
5. Add the focused regression coverage below before widening facade exposure.
6. Record observed outputs and unresolved failures in the implementation evidence packet.

Acceptance and verification:
- Required outcome: Completion statement contains no unsupported shipped, safe-autonomy, or parity claims.
- Targeted coverage: evidence packet completeness and link checks.
- Verification evidence: exact command, exit status, fixture identity, and relevant artifact path.
- Completion authority: observed checks, not the child's summary or a hook's confidence.

Safety and rollback:
- Principal risk: Historical reports remain evidence candidates, not current authoritative status.
- Rollback boundary: Leave unresolved packages explicitly deferred rather than declaring blanket completion.
- Review gate: do not proceed to dependent authority-expanding work with a failed mandatory check.
### 10.1 Current implementation ledger — 2026-09-09 closure verification

The individual work-package blocks above preserve the original proposal text and acceptance intent. The following ledger is the authoritative status for the current tree; it supersedes each block's historical `proposed` line. Track A is verified at **49 full / 0 partial / 5 explicitly deferred**; Track B remains unapproved.

| Work packages | Current status | Evidence / boundary |
|---|---|---|
| W01–W08 | implemented | Existing role catalog, strict settings namespace, SettingsManager seam, deterministic resolver, deny-first restrictions, diagnostics, and profile listing are covered by source and focused tests. |
| W09–W18 | implemented | Profile authoring guidance, metadata/source revalidation, shared execution overrides, Ice reasoning resolution, scoped tools, native turn/tool budgets, UTF-8 result accounting, and batch reservations are shipped. |
| W19 | implemented | Architecture decision gate closed: exact parent-model object inheritance is mandatory and enforced. |
| W20–W21 | deferred | Alternate per-child model routing requires a separate architecture approval and is not implemented. |
| W22–W24 | implemented | Bounded context selection, restricted local output schemas/payloads, and parent-side result verification are shipped. |
| W25 | implemented | Versioned owner/run/attempt-correlated in-process hook events and bounded records. |
| W26 | implemented | Deterministic resolver now applies optional `roleHookIds`/`callHookIds` selections as a union while retaining required hooks; role predicates and duplicate guards remain active. |
| W27 | implemented | Parent-owned awaited dispatcher with bounded immutable payloads and fail-closed required decisions. |
| W28 | implemented | `beforeLaunch` context additions are normalized/redacted, merged into the bounded context packet, and followed by source/resource and preflight revalidation before admission. |
| W29–W30 | implemented | Final tool-boundary enforcement, approval handling, sticky deny, and headless fail-closed behavior. |
| W31–W33 | deferred | Executable command hooks remain disabled pending an independent executable-policy, isolation, payload, and cleanup gate. |
| W34–W44 | implemented | Hook result semantics, bounded journal intent/outcome records, redacted projections, cancellation, owner-bound follow-up/arbitration, bounded extensions, durable contract revalidation, batch/review parity, and writer boundaries are shipped. |
| W45 | implemented | Existing scoped settings edits plus a bounded source-aware effective-policy submenu expose enablement, trust, role budgets, hook declarations, routing policy, and load errors without a replacement frontend. |
| W46 | implemented | RPC effective values, diagnostics, scoped writes, and headless fail-closed approval behavior are covered. |
| W47 | implemented | SettingsManager reload/trust state and active/queued authority checks apply future-contract semantics and fail closed at safe boundaries; restart-resumable live sessions remain outside this package. |
| W48–W49 | implemented | Redacted bounded artifacts, the hermetic sequential eight-file focused gate (393 passed), and the broader 16-file non-Cognee ICE sweep (479 passed) are recorded. |
| W50 | implemented | Schema-v2 benchmark evidence records cold import plus warm parser/resolver/normalization/prompt/serialization/hook-dispatch overhead and runtime metadata; no live quality claim is made. |
| W51 | implemented | `idea.md`, settings documentation, and the coding-agent changelog distinguish shipped behavior from deferred authority. |
| W52 | implemented | Automated feature-off/revocation/retained-state coverage and a completed isolated operator-style persisted-state rollback drill are recorded in `rollback-drill.md` and `rollback-drill-output.txt`. |
| W53 | implemented | The hermetic eight-file acceptance run passes 393/393 and the literal `npm run check` passes under npm 12.0.2 with no status change; output is `targeted-tests.txt` and `repository-checks.txt`. |
| W54 | implemented | Current hashes, fixture provenance, 393/393 and 479/479 outputs, rollback output, repository check, final state, and the 49/0/5 ledger are regenerated under `.artifacts/ice-subagent-control-hooks/`. |

The shipped scope is therefore the safe parent-owned slice, not the deferred command-hook or alternate-routing phases. W19 is the exact-parent-model decision; only W20–W21 routing implementation is deferred. No autonomous-safety or external-isolation claim follows from these statuses.

### 10.2 Acceptance evidence index — 2026-09-09

| Acceptance area | Observed evidence | Result / limitation |
|---|---|---|
| W35 checkpoint observation | `test/ice-subagent-result-contract.test.ts`: `emits and returns a parent-owned checkpoint observation at a native progress boundary` | Native `turn_start` plus `message_update` produces a bounded observational record; it cannot authorize work. |
| W36 journal/projection | `test/ice-subagents.test.ts`: `persists redacted hook intent and outcome records through the parent session seam` | Production extension path writes paired intent/outcome records with one event ID and redacted reason; reload warns on unresolved intent without replay. |
| W47 reload/revocation | `test/ice-subagent-settings.test.ts`: `revalidates future launches after settings reload and fails closed on reload errors`; `test/ice-subagent-result-contract.test.ts`: authority-revoked acceptance | Reloaded disable/invalid policy blocks future admission; an active result is rejected when parent authority is revoked before acceptance. Restart-resumable live sessions remain outside this package. |
| W49 production-facade gate | `targeted-tests.txt`: eight affected files, 393 passed sequentially with `ICE_CODING_AGENT_DIR` unset; `broader-ice-sweep.txt`: 16 explicit non-Cognee ICE files, 479 passed | Settings, hooks, budgets, cancellation, durable ownership, result verification, batch/review, RPC, safe verification, agent-view, provider/settings, adversarial, telemetry, and writer boundaries passed without endpoint credentials. |
| W50 controlled performance | `benchmark.json` schema v2 | Repeated provider-free cold import, warm parse/resolve/normalize/prompt/serialization, and hook-dispatch measurements with runtime, route, reasoning, and budget metadata; no quality or live-route comparison. |
| W51 documentation | `idea.md`, `packages/coding-agent/docs/settings.md`, `packages/coding-agent/CHANGELOG.md`, this ledger | Shipped behavior and explicit deferrals are separated. |
| W52 rollout boundary | `rollback-drill.md` and `rollback-drill-output.txt` plus feature-off, reload, retained-job inspection/cancellation, journal no-replay, and persisted-state migration tests | Isolated operator-style persisted-state mutation/reload/rollback passed 1/1; no real user settings or session store was mutated. |
| W53 repository gates | `repository-checks.txt` | Node `v24.21.0`, npm `12.0.2`; non-writing Biome precheck and the literal `npm run check` both exit 0, with TypeScript, dependency/import, lock, shrinkwrap, and browser-smoke gates included; pre/post status diff is empty. |
| W54 packet completeness | `evidence.md`, `work-package-ledger.md`, `benchmark.json`, `targeted-tests.txt`, `broader-ice-sweep.txt`, `hermetic-delegate-mvp.txt`, `rollback-drill.md`, `rollback-drill-output.txt`, `repository-checks.txt`, `source-provenance.txt`, `final-state.txt` | Current commands, counts, fixture identity, settings fixture, source hashes, status snapshots, rollback output, limitations, and deferrals are recorded; no parity or autonomous-safety verdict is claimed. |

The historical T01–T54 scenario prose remains useful as adversarial test design. The index above records which acceptance slices have observed coverage in the current tree; deferred W20–W21 and W31–W33 are not converted into passing claims.

## 11. Adversarial verification scenarios

These scenarios are test specifications, not tests executed during document authoring.
Use synthetic provider/model objects, temporary fixture directories, and fake clocks where possible.
Process fixtures must be local, bounded, non-networked, and independent of real endpoint credentials.
Each scenario should prove both model-visible behavior and actual dispatch/persistence behavior.
### T01 — Global deny versus project allow

- Covers: W06.
- Evidence basis: [P01], [O04].
- Fixture: Global policy denies Bash; trusted project and caller request Bash.
- Action: Resolve a coder launch with active parent Bash.
- Expected result: Bash remains denied and the source of the denial is reported.
- Required observation: Tool dispatch spy remains untouched.
- Isolation: use temporary files and provider-free mocks; never real credentials.
- Failure handling: preserve the failing fixture and report the observed mismatch.
- Completion gate: this scenario is unrun until its future targeted command passes.
### T02 — Untrusted project hook

- Covers: W26 W31.
- Evidence basis: [P04], [H01].
- Fixture: Project settings contain a command hook and project trust is absent.
- Action: Discover roles/settings and attempt ordinary delegation.
- Expected result: No project executable runs; eligibility diagnostic is bounded.
- Required observation: Command spawn count is zero.
- Isolation: use temporary files and provider-free mocks; never real credentials.
- Failure handling: preserve the failing fixture and report the observed mismatch.
- Completion gate: this scenario is unrun until its future targeted command passes.
### T03 — Alias restriction bypass

- Covers: W06 W08.
- Evidence basis: [P02], [M04].
- Fixture: The explore role is denied but scout alias is supplied.
- Action: Resolve alias and launch through every facade.
- Expected result: Normalized target is denied consistently.
- Required observation: No child creation on any facade.
- Isolation: use temporary files and provider-free mocks; never real credentials.
- Failure handling: preserve the failing fixture and report the observed mismatch.
- Completion gate: this scenario is unrun until its future targeted command passes.
### T04 — Profile source replaced after selection

- Covers: W10 W28.
- Evidence basis: [P02], [O01].
- Fixture: A selected profile file changes between discovery and launch.
- Action: Swap bytes or symlink target before final revalidation.
- Expected result: Source hash/canonical mismatch blocks launch.
- Required observation: Provider call count remains zero.
- Isolation: use temporary files and provider-free mocks; never real credentials.
- Failure handling: preserve the failing fixture and report the observed mismatch.
- Completion gate: this scenario is unrun until its future targeted command passes.
### T05 — Unknown tool disguised as read-only

- Covers: W14.
- Evidence basis: [M05], [C02].
- Fixture: A profile requests a custom tool named safe_read that has no approved capability mapping.
- Action: Resolve tools and forge a direct child call.
- Expected result: Unknown tool is not granted or executed.
- Required observation: Visible schema and dispatch denial agree.
- Isolation: use temporary files and provider-free mocks; never real credentials.
- Failure handling: preserve the failing fixture and report the observed mismatch.
- Completion gate: this scenario is unrun until its future targeted command passes.
### T06 — Empty requested tool subset

- Covers: W12 W14.
- Evidence basis: [M03], [P02].
- Fixture: Caller explicitly supplies execution.tools as an empty array.
- Action: Run a task using a no-tool-capable faux model.
- Expected result: Empty means no tools if supported, otherwise explicit rejection; never unrestricted fallback.
- Required observation: Tool list is empty or provider never starts.
- Isolation: use temporary files and provider-free mocks; never real credentials.
- Failure handling: preserve the failing fixture and report the observed mismatch.
- Completion gate: this scenario is unrun until its future targeted command passes.
### T07 — Malformed required config

- Covers: W03 W47.
- Evidence basis: [P03], [M08].
- Fixture: A mandatory hook policy has a misspelled security key.
- Action: Reload settings before launching.
- Expected result: Delegation blocks with source-aware validation error.
- Required observation: No permissive last-valid security fallback silently activates.
- Isolation: use temporary files and provider-free mocks; never real credentials.
- Failure handling: preserve the failing fixture and report the observed mismatch.
- Completion gate: this scenario is unrun until its future targeted command passes.
### T08 — Concurrent scoped settings writes

- Covers: W04.
- Evidence basis: [P03], [P13].
- Fixture: Two manager instances modify distinct global keys.
- Action: Flush both through existing storage semantics.
- Expected result: Unrelated keys survive or a conflict is surfaced according to verified storage behavior.
- Required observation: Disk fixture and drained errors are inspected.
- Isolation: use temporary files and provider-free mocks; never real credentials.
- Failure handling: preserve the failing fixture and report the observed mismatch.
- Completion gate: this scenario is unrun until its future targeted command passes.
### T09 — Unsupported reasoning effort

- Covers: W13.
- Evidence basis: [P07], [O02].
- Fixture: Selected model advertises no support for requested effort.
- Action: Pass execution.thinking through a faux route.
- Expected result: Failure occurs before consuming a child run.
- Required observation: Requested/effective diagnostics do not invent provider metadata.
- Isolation: use temporary files and provider-free mocks; never real credentials.
- Failure handling: preserve the failing fixture and report the observed mismatch.
- Completion gate: this scenario is unrun until its future targeted command passes.
### T10 — Routing gate disabled

- Covers: W19 W20.
- Evidence basis: [P01], [P02].
- Fixture: Profile contains model metadata and no routing approval exists.
- Action: Launch ordinary delegation.
- Expected result: Exact current parent model remains selected and ignored metadata is diagnosed.
- Required observation: Object identity and provenance assertions pass.
- Isolation: use temporary files and provider-free mocks; never real credentials.
- Failure handling: preserve the failing fixture and report the observed mismatch.
- Completion gate: this scenario is unrun until its future targeted command passes.
### T11 — Queued parent model change

- Covers: W21 W42.
- Evidence basis: [P01], [P10].
- Fixture: Async request is accepted before parent selects another route.
- Action: Promote queued work after the model switch.
- Expected result: Accepted contract is honored or explicitly fails unavailable; no silent reroute.
- Required observation: Launch route and acceptance provenance match.
- Isolation: use temporary files and provider-free mocks; never real credentials.
- Failure handling: preserve the failing fixture and report the observed mismatch.
- Completion gate: this scenario is unrun until its future targeted command passes.
### T12 — Turn budget final report

- Covers: W15.
- Evidence basis: [P02], [O02].
- Fixture: Child uses every ordinary work turn but needs a structured final report.
- Action: Advance faux-provider turns to the cap.
- Expected result: Finalization obeys the documented total allowance or returns budget failure.
- Required observation: Observed turn count and final result are asserted.
- Isolation: use temporary files and provider-free mocks; never real credentials.
- Failure handling: preserve the failing fixture and report the observed mismatch.
- Completion gate: this scenario is unrun until its future targeted command passes.
### T13 — Parallel tool admission race

- Covers: W16.
- Evidence basis: [P02], [C02].
- Fixture: Only one tool-call reservation remains while two calls arrive together.
- Action: Dispatch concurrent eligible requests.
- Expected result: At most one executes.
- Required observation: Reservation and dispatch counters stay consistent.
- Isolation: use temporary files and provider-free mocks; never real credentials.
- Failure handling: preserve the failing fixture and report the observed mismatch.
- Completion gate: this scenario is unrun until its future targeted command passes.
### T14 — UTF-8 result overflow

- Covers: W17.
- Evidence basis: [P02], [M03].
- Fixture: Result contains multi-byte text, large diagnostics, and escaped JSON characters.
- Action: Serialize at the configured boundary.
- Expected result: Returned JSON remains valid and within full-envelope byte cap.
- Required observation: Byte length uses encoded serialized output, not string length.
- Isolation: use temporary files and provider-free mocks; never real credentials.
- Failure handling: preserve the failing fixture and report the observed mismatch.
- Completion gate: this scenario is unrun until its future targeted command passes.
### T15 — Batch aggregate reservation

- Covers: W18 W43.
- Evidence basis: [P01], [P10].
- Fixture: Individually valid tasks exceed aggregate planned output.
- Action: Submit the whole batch and queue variants.
- Expected result: Admission follows documented all-preflight policy without overspending.
- Required observation: Reservations never exceed owner cap.
- Isolation: use temporary files and provider-free mocks; never real credentials.
- Failure handling: preserve the failing fixture and report the observed mismatch.
- Completion gate: this scenario is unrun until its future targeted command passes.
### T16 — Foreign owner inspection

- Covers: W38.
- Evidence basis: [P01], [O03].
- Fixture: Another session supplies a real retained run or job ID.
- Action: Inspect, follow up, extend, and stop.
- Expected result: Every control is rejected without leaking result contents.
- Required observation: State and child prompt history remain unchanged.
- Isolation: use temporary files and provider-free mocks; never real credentials.
- Failure handling: preserve the failing fixture and report the observed mismatch.
- Completion gate: this scenario is unrun until its future targeted command passes.
### T17 — Historical view continuation

- Covers: W38 W39.
- Evidence basis: [P01], [P11].
- Fixture: A completed child is visible only as a retained redacted snapshot.
- Action: Request model-callable follow-up against its ID.
- Expected result: Typed unsupported-state error; no new hidden child is spawned.
- Required observation: Session creation count remains unchanged.
- Isolation: use temporary files and provider-free mocks; never real credentials.
- Failure handling: preserve the failing fixture and report the observed mismatch.
- Completion gate: this scenario is unrun until its future targeted command passes.
### T18 — User takeover collision

- Covers: W40.
- Evidence basis: [P01], [P11].
- Fixture: User controls a live child while parent model sends follow-up.
- Action: Interleave takeover, follow-up, and return-to-parent actions.
- Expected result: Documented arbitration holds without silent instruction loss.
- Required observation: Ordered control provenance and prompt count are inspected.
- Isolation: use temporary files and provider-free mocks; never real credentials.
- Failure handling: preserve the failing fixture and report the observed mismatch.
- Completion gate: this scenario is unrun until its future targeted command passes.
### T19 — Hook argument injection

- Covers: W32.
- Evidence basis: [P01], [H02].
- Fixture: Task and context include shell metacharacters and newline-delimited fake JSON.
- Action: Send command-hook input through argv/stdin adapter.
- Expected result: Content remains JSON data; no shell execution occurs.
- Required observation: Fixture captures exact argv/stdin and no marker side effect.
- Isolation: use temporary files and provider-free mocks; never real credentials.
- Failure handling: preserve the failing fixture and report the observed mismatch.
- Completion gate: this scenario is unrun until its future targeted command passes.
### T20 — Post-hook scope mutation

- Covers: W29.
- Evidence basis: [P05], [M07].
- Fixture: A handler attempts to replace a scoped read path with an external credential path.
- Action: Invoke final tool-boundary decision.
- Expected result: Mutation rejected in V1 or final revalidation denies it.
- Required observation: Underlying read spy never receives external path.
- Isolation: use temporary files and provider-free mocks; never real credentials.
- Failure handling: preserve the failing fixture and report the observed mismatch.
- Completion gate: this scenario is unrun until its future targeted command passes.
### T21 — Required hook timeout

- Covers: W33 W34.
- Evidence basis: [M07], [H01].
- Fixture: A required decision handler never resolves.
- Action: Advance deadline and request cancellation.
- Expected result: Action blocks and cancellation completes independently.
- Required observation: No child/tool dispatch after deadline.
- Isolation: use temporary files and provider-free mocks; never real credentials.
- Failure handling: preserve the failing fixture and report the observed mismatch.
- Completion gate: this scenario is unrun until its future targeted command passes.
### T22 — Optional observer failure

- Covers: W34 W36.
- Evidence basis: [M07], [H02].
- Fixture: afterTool observer throws after an actual tool failure.
- Action: Capture terminal outcome and diagnostics.
- Expected result: Original tool failure remains primary; observer error is secondary.
- Required observation: No forged success or erased evidence.
- Isolation: use temporary files and provider-free mocks; never real credentials.
- Failure handling: preserve the failing fixture and report the observed mismatch.
- Completion gate: this scenario is unrun until its future targeted command passes.
### T23 — Hook deny then allow

- Covers: W27 W34.
- Evidence basis: [P01], [O04].
- Fixture: Earlier required hook denies; later optional hook says continue.
- Action: Evaluate deterministic hook sequence.
- Expected result: Deny remains sticky and cannot be weakened.
- Required observation: Final policy decision includes denying source.
- Isolation: use temporary files and provider-free mocks; never real credentials.
- Failure handling: preserve the failing fixture and report the observed mismatch.
- Completion gate: this scenario is unrun until its future targeted command passes.
### T24 — Headless ask without approval

- Covers: W30 W46.
- Evidence basis: [P01], [P04].
- Fixture: Decision hook returns ask in a headless client lacking approval support.
- Action: Attempt launch and final tool dispatch.
- Expected result: Fail closed or remain explicitly pending under supported protocol.
- Required observation: No interactive picker or implicit true approval.
- Isolation: use temporary files and provider-free mocks; never real credentials.
- Failure handling: preserve the failing fixture and report the observed mismatch.
- Completion gate: this scenario is unrun until its future targeted command passes.
### T25 — Command hook in plan mode

- Covers: W31.
- Evidence basis: [P01], [M06].
- Fixture: Trusted project requests a side-effecting beforeLaunch command in plan mode.
- Action: Attempt read-only delegation.
- Expected result: Command is denied absent an independently approved safe execution boundary.
- Required observation: No filesystem mutation marker appears.
- Isolation: use temporary files and provider-free mocks; never real credentials.
- Failure handling: preserve the failing fixture and report the observed mismatch.
- Completion gate: this scenario is unrun until its future targeted command passes.
### T26 — Crash after hook dispatch

- Covers: W35.
- Evidence basis: [P01], [C02].
- Fixture: Hook intent is durable but process terminates before outcome is recorded.
- Action: Replay owner session/job journal.
- Expected result: Mark unresolved; do not automatically rerun the command.
- Required observation: External-effect fixture count does not increase.
- Isolation: use temporary files and provider-free mocks; never real credentials.
- Failure handling: preserve the failing fixture and report the observed mismatch.
- Completion gate: this scenario is unrun until its future targeted command passes.
### T27 — Cancellation during hook cleanup

- Covers: W33 W37.
- Evidence basis: [P01], [M07].
- Fixture: Hook process ignores initial termination and observer also hangs.
- Action: Cancel owning job with fake deadlines/process fixture.
- Expected result: Terminal state and cleanup limitations are reported within documented bounds.
- Required observation: No claim of successful descendant kill without observation.
- Isolation: use temporary files and provider-free mocks; never real credentials.
- Failure handling: preserve the failing fixture and report the observed mismatch.
- Completion gate: this scenario is unrun until its future targeted command passes.
### T28 — Schema remote reference

- Covers: W23.
- Evidence basis: [M03], [M06].
- Fixture: Caller output schema references a remote URL or unbounded recursion.
- Action: Validate before launch.
- Expected result: Reject without network I/O or child creation.
- Required observation: Network mock and provider counter remain zero.
- Isolation: use temporary files and provider-free mocks; never real credentials.
- Failure handling: preserve the failing fixture and report the observed mismatch.
- Completion gate: this scenario is unrun until its future targeted command passes.
### T29 — Valid payload with false completion

- Covers: W24 W34.
- Evidence basis: [P01], [P02].
- Fixture: Child payload validates but mandatory test evidence is failing or stale.
- Action: Run acceptance checks and a hook requesting continue.
- Expected result: Overall completion remains failed.
- Required observation: Verifier result cannot be overwritten by payload or hook.
- Isolation: use temporary files and provider-free mocks; never real credentials.
- Failure handling: preserve the failing fixture and report the observed mismatch.
- Completion gate: this scenario is unrun until its future targeted command passes.
### T30 — Writer facade privilege crossover

- Covers: W44.
- Evidence basis: [P01], [P02].
- Fixture: Read-only role claims to be coder and requests write tools via execution override.
- Action: Invoke delegate and review_batch in safe mode.
- Expected result: No mutation tools granted and no parent-workspace edit occurs.
- Required observation: Writer path is never entered implicitly.
- Isolation: use temporary files and provider-free mocks; never real credentials.
- Failure handling: preserve the failing fixture and report the observed mismatch.
- Completion gate: this scenario is unrun until its future targeted command passes.
### T31 — Secret-rich hook telemetry

- Covers: W32 W48.
- Evidence basis: [P01], [H02].
- Fixture: Synthetic credentials appear in task, environment, stderr, and hook reason.
- Action: Collect UI, RPC, journal, and artifact projections.
- Expected result: Secret sentinels are absent before persistence and display.
- Required observation: All produced artifacts are scanned locally.
- Isolation: use temporary files and provider-free mocks; never real credentials.
- Failure handling: preserve the failing fixture and report the observed mismatch.
- Completion gate: this scenario is unrun until its future targeted command passes.
### T32 — Disable feature with queued jobs

- Covers: W42 W52.
- Evidence basis: [P01], [P10].
- Fixture: New controls are disabled while owner has queued/running jobs.
- Action: Reload settings and inspect/cancel retained jobs.
- Expected result: No new admissions; existing ownership operations remain available.
- Required observation: No journal deletion or implicit relaunch.
- Isolation: use temporary files and provider-free mocks; never real credentials.
- Failure handling: preserve the failing fixture and report the observed mismatch.
- Completion gate: this scenario is unrun until its future targeted command passes.
### T33 — Optional remote hook discovery unavailable

- Covers: W26 W36.
- Evidence basis: [H01], [H03].
- Fixture: An optional hook listing adapter has no backend or times out.
- Action: Render hook status without invoking mandatory policy.
- Expected result: Optional unavailability is diagnostic, never a blanket policy bypass.
- Required observation: Mandatory hooks still enforce or block separately.
- Isolation: use temporary files and provider-free mocks; never real credentials.
- Failure handling: preserve the failing fixture and report the observed mismatch.
- Completion gate: this scenario is unrun until its future targeted command passes.
### T34 — Extension injection through resources

- Covers: W22 W27.
- Evidence basis: [P01], [P07].
- Fixture: A selected skill/profile names an executable extension in its prose.
- Action: Launch a safe child with explicit resources.
- Expected result: Only approved bounded resources are included; ambient discovery stays disabled.
- Required observation: Child extension/MCP registry remains empty.
- Isolation: use temporary files and provider-free mocks; never real credentials.
- Failure handling: preserve the failing fixture and report the observed mismatch.
- Completion gate: this scenario is unrun until its future targeted command passes.
### T35 — Route credentials missing after acceptance

- Covers: W21.
- Evidence basis: [P07], [P10].
- Fixture: Approved captured route loses credentials before queued promotion.
- Action: Attempt launch without refreshing or expanding auth.
- Expected result: Explicit unavailable-route failure; no fallback or automatic login.
- Required observation: No auth mutation or alternate provider request.
- Isolation: use temporary files and provider-free mocks; never real credentials.
- Failure handling: preserve the failing fixture and report the observed mismatch.
- Completion gate: this scenario is unrun until its future targeted command passes.
### T36 — Repeated timeout extension

- Covers: W41.
- Evidence basis: [P01], [P10].
- Fixture: Caller repeatedly adds small extensions under per-call maximum.
- Action: Extend until aggregate owner cap would be exceeded.
- Expected result: Cumulative cap stops further extension; terminal runs cannot revive.
- Required observation: Total granted duration and event ordering are asserted.
- Isolation: use temporary files and provider-free mocks; never real credentials.
- Failure handling: preserve the failing fixture and report the observed mismatch.
- Completion gate: this scenario is unrun until its future targeted command passes.
## 12. Delivery phases and decision gates

### 12.1 Phase A — truthful baseline and configuration visibility

- Implement W01–W11 before adding new execution authority.
- Main user value: discover the already-supported agents and understand effective settings.
- Keep all existing delegation defaults unchanged.
- Add example specialist roles rather than expanding hardcoded branching.
- Confirm settings writes use the existing scoped manager.
- Do not add command hooks, alternate models, or background steering in this phase.
- Exit evidence: source-aware discovery and settings fixtures pass.

### 12.2 Phase B — enforceable parent invocation control

- Implement W12–W18, W22–W24, and facade integration as needed.
- Main user value: choose effort, narrow tools, cap work, and demand structured evidence.
- Keep exact parent model inheritance.
- Keep safe children read-only and ordinary writers isolated.
- Prove that each accepted control is actually enforced by the runtime.
- A prompt instruction alone does not satisfy a budget or tool restriction.
- Exit evidence: single/async/batch/review parity and adversarial accounting tests pass.

### 12.3 Phase C — parent-owned hook decisions and observations

- Implement W25–W30 and W34–W37 first.
- Main user value: consistent launch/tool/result gates and inspectable outcomes.
- Start with trusted in-process handlers and observational projections.
- Keep executable command hooks disabled until their own gate passes.
- Do not enable child extension loading.
- Exit evidence: deny-first, no-approval, mutation, timeout, and failure-masking tests pass.

### 12.4 Phase D — optional executable hooks

- Implement W31–W33 and required persistence/telemetry coverage.
- Require explicit user/policy approval for command execution.
- Plan/review do not gain command authority through hook configuration.
- Document filesystem/process/network/credential limits honestly.
- Keep external telemetry and network notification hooks opt-in.
- Exit evidence: argv/stdin safety, env redaction, cleanup, and crash ambiguity tests pass.

### 12.5 Phase E — bounded live parent supervision

- Implement W38–W41 only for supported retained foreground sessions first.
- Main user value: clarify a live child's task without starting a duplicate investigation.
- Reuse Ice's native steering/follow-up facilities.
- Keep historical snapshots read-only.
- Keep background job steering and restart resume deferred.
- Exit evidence: ownership, control arbitration, final report, and cumulative cap tests pass.

### 12.6 Phase F — optional model routing decision

- W19 is a decision gate, not an automatic dependency of all other phases.
- W20–W21 remain blocked until explicit architecture approval.
- Demonstrate a measured need rather than copying a competitor's model field.
- Preserve inherit-parent as default and exact configured metadata.
- Resolve through Ice ModelRuntime, not provider SDK calls inside the subagent module.
- Exit evidence: approved idea.md decision plus route/capability/async provenance tests.

### 12.7 Cross-cutting release gates

- W42–W48 preserve consistency, trust, transport behavior, and artifact hygiene.
- W49 provides provider-free end-to-end integration evidence.
- W50 evaluates overhead and benefit without claiming deterministic model quality.
- W51 updates shipped documentation only after implementation verification.
- W52 exercises feature-off and retained-job behavior.
- W53 runs mandatory repository verification.
- W54 creates a bounded final evidence packet.
- No phase completion implies that autonomous mode is safe.

## 13. Explicit rejection and deferral register

### 13.1 Reject for this architecture

- A second planning/controller loop that tells Ice which reasoning step to take.
- A copied provider SDK or model registry embedded in delegation.
- Unrestricted recursive child spawning.
- Direct sibling-to-sibling authority or shared mutable writer workspaces.
- Global/project settings implemented by an independent JSON writer.
- Automatic discovery/execution of foreign harness hooks and agents.
- Broad host credential inheritance for command hooks.
- Model-generated approval flags treated as user consent.
- A hook that can override mandatory verifier failure.
- Silent fallback from requested unavailable model to a different provider.
- Hardcoded endpoint catalogs, guessed context limits, or committed credentials.
- Wholesale imports of OpenCode services, OMP task runtime, or Prime RLM controller.
- Treating Claw Code placeholders as shipped hooks.
- Treating OpenHands frontend types as proof of remote sandbox guarantees.
- Importing proprietary archived code or prompts based only on a repository-level license.

### 13.2 Defer until measured need and separate approval

- Background writers and background batch facades.
- Restart-resumable live child sessions.
- Parent-model steering of durable background jobs.
- Priority scheduling and preemption.
- General workflow DAGs, chained controllers, or hierarchical swarms.
- Direct child MCP and remote browser tools.
- Automatic provider fallback after interrupted execution.
- Currency-hard budgets without reliable price/runtime accounting.
- Arbitrary JSON Schema features and executable custom validators.
- Temperature/top_p overrides with no task-specific evidence.
- Remote workspace/runtime adapters.
- Automatic promotion of successful child prompts into persistent executable policy.
- Global self-modifying agent libraries.
- More bundled roles when a documented user/project profile is sufficient.

## 14. Verification commands and evidence requirements

### 14.1 Before implementation

```bash
git status --short
git branch --show-current
git rev-parse HEAD
node --version
npm --version
```

- Capture output and exit status under a stable local implementation artifact directory.
- Never capture the entire environment or authentication configuration.
- Record existing dirty paths; later changes must preserve work not owned by the implementation session.
- Establish baseline targeted tests before editing where practical.
- Required check uses the branch-declared npm version, currently 12.0.2 under repository rules.

### 14.2 Targeted tests after implementation

Run exact affected test files from the package root, for example:

```bash
cd packages/coding-agent
node ../../node_modules/vitest/dist/cli.js --run test/ice-subagents.test.ts
node ../../node_modules/vitest/dist/cli.js --run test/ice-subagent-jobs.test.ts
node ../../node_modules/vitest/dist/cli.js --run test/settings-manager.test.ts
```

- Confirm each filename exists at implementation time before using the example command.
- Run newly created or modified test files explicitly.
- Use `test/suite/harness.ts` and the faux provider for suite-level cases.
- Do not run a full vitest suite that may activate endpoint-sensitive e2e tests.
- Do not run `npm test` or `npm run build` without the user's request.
- For an explicitly desired all-non-e2e run, use the repository's `./test.sh` boundary.
- Tests listed in this plan were not executed merely because their names appear here.

### 14.3 Required repository check

When active npm is not 12.0.2:

```bash
corepack npm@12.0.2 run check
```

When active npm is exactly 12.0.2:

```bash
npm run check
```

- Preserve full output; do not pipe through tail.
- Record both active and invoked npm versions.
- In the current closure packet, the write-enabled wrapper was preceded by a non-writing Biome precheck and then invoked literally; both the full output and the pre/post dirty-state comparison are recorded under `.artifacts/ice-subagent-control-hooks/repository-checks.txt`.
- Report warnings, infos, errors, and baseline failures rather than suppressing them.
- Do not modify dependency metadata to avoid a toolchain failure.
- Docs-only authoring does not require this implementation-code check under repository rules.

### 14.4 Required implementation evidence packet

- Objective and acceptance criteria IDs.
- Branch, starting HEAD, ending HEAD, and pre-existing dirty files.
- Changed files and key symbols.
- Effective feature gates and configuration provenance.
- Exact model/provider route and reasoning setting for any approved live test.
- Runtime version and operating system.
- Targeted commands, exit statuses, and timestamps.
- Full output artifact paths and capped summaries.
- Failed, stale, unrun, and deferred checks.
- Budget, timeout, cancellation, and verification outcomes.
- Known host-isolation limitations.
- Rollback result and retained-job behavior.
- Source provenance/license notes for any actual code reuse.
- No claim of Desktop PASS without a separately valid fixed-conversation audit.

## 15. Final recommendation

Build the smallest coherent improvement, not a collection of disconnected competitor features.
Start by exposing the custom roles and settings that already exist.
Then add typed parent controls with actual runtime enforcement.
Then add parent-owned lifecycle decisions and observations.
Only later consider executable hooks, live model steering, and approved per-child routing.
Keep every facade on the same resolved contract and every authority decision outside model prose.
Preserve Ice's upstream loop, project trust, read-only modes, isolated writer path, and owner-scoped jobs.
The quality bar is verified control and understandable failure behavior, not the number of agent names.

### 15.1 Document authoring completion checklist

- [x] Local references from all five directories are represented.
- [x] Existing ICE custom roles and settings are acknowledged.
- [x] Current exact-parent-model policy is separated from proposed routing.
- [x] References distinguish source observations, documentation claims, and unverified runtime implications.
- [x] Hook command authority is separate from project trust and read-only modes.
- [x] Implementation work packages include source basis, integration targets, acceptance, tests, and rollback.
- [x] Adversarial scenarios cover policy, lifecycle, persistence, output, and secret handling.
- [x] Implementation changes and evidence are explicitly described; no dependency, release, or reference modification is claimed.
- [x] Current implementation has passing focused tests, TypeScript, non-writing Biome, and repository invariant checks; full check output is recorded in the evidence packet.
- [x] Future routing architecture change remains explicitly deferred without approval.
- [x] No Desktop comparison or parity claim is made for this local implementation packet.

### 15.2 What this document does not establish

- It does not establish parity with Claude Code or any reference harness.
- It does not establish security isolation for host commands; executable command hooks remain deferred.
- It does not establish benchmark superiority or live-model quality.
- It does not establish restart-resumable live sessions, background steering, or alternate routing.
- It does not authorize autonomous mode or external side effects.
## 16. Citation link definitions
[P01]: ../../idea.md
[P02]: ../../packages/coding-agent/src/ice-subagents.ts
[P03]: ../../packages/coding-agent/src/core/settings-manager.ts
[P04]: ../../packages/coding-agent/docs/settings.md
[P05]: ../../packages/coding-agent/src/core/extensions/types.ts
[P06]: ../../packages/coding-agent/docs/extensions.md
[P07]: ../../packages/coding-agent/docs/sdk.md
[P08]: ../../packages/coding-agent/src/ice-agent-packs.ts
[P09]: ../../packages/coding-agent/src/ice-subagent-preflight.ts
[P10]: ../../packages/coding-agent/src/ice-subagent-jobs.ts
[P11]: ../../packages/coding-agent/src/ice-agent-view-bridge.ts
[P12]: ../../packages/coding-agent/examples/extensions/event-bus.ts
[P13]: ../../packages/coding-agent/examples/sdk/10-settings.ts
[P14]: ../../packages/coding-agent/docs/tui.md
[O01]: ../../agent_references/opencode/packages/opencode/src/config/agent.ts
[O02]: ../../agent_references/opencode/packages/core/src/v1/config/agent.ts
[O03]: ../../agent_references/opencode/packages/opencode/src/tool/task.ts
[O04]: ../../agent_references/opencode/packages/opencode/src/agent/subagent-permissions.ts
[O05]: ../../agent_references/opencode/packages/opencode/src/config/paths.ts
[M01]: ../../agent_references/oh-my-pi/packages/coding-agent/src/task/agents.ts
[M02]: ../../agent_references/oh-my-pi/packages/coding-agent/src/task/discovery.ts
[M03]: ../../agent_references/oh-my-pi/packages/coding-agent/src/task/types.ts
[M04]: ../../agent_references/oh-my-pi/packages/coding-agent/src/task/spawn-policy.ts
[M05]: ../../agent_references/oh-my-pi/packages/coding-agent/src/task/read-only-policy.ts
[M06]: ../../agent_references/oh-my-pi/packages/coding-agent/src/task/structured-subagent.ts
[M07]: ../../agent_references/oh-my-pi/packages/coding-agent/src/extensibility/hooks/tool-wrapper.ts
[M08]: ../../agent_references/oh-my-pi/packages/coding-agent/src/capability/settings.ts
[R01]: ../../agent_references/prime-agent/packages/coding-agent/examples/extensions/subagent/agents.ts
[R02]: ../../agent_references/prime-agent/packages/coding-agent/examples/extensions/subagent/README.md
[R03]: ../../agent_references/prime-agent/packages/coding-agent/src/core/rlm-max-depth.ts
[R04]: ../../agent_references/prime-agent/README.md
[C01]: ../../agent_references/claw-code/src/hooks/__init__.py
[C02]: ../../agent_references/claw-code/rust/crates/tools/src/lib.rs
[C03]: ../../agent_references/claw-code/rust/crates/rusty-claude-cli/src/setup_wizard.rs
[C04]: ../../agent_references/claw-code/README.md
[H01]: ../../agent_references/openhands/src/api/hooks-service.ts
[H02]: ../../agent_references/openhands/src/types/agent-server/core/events/hook-execution-event.ts
[H03]: ../../agent_references/openhands/__tests__/api/hooks-service.test.ts
[D01]: ../../agent_docs/implementation/part-01-guarded-build.md
[D02]: ../../agent_docs/ice-codebase-audit-10-flaws.md

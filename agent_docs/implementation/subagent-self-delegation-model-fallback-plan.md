# ICE: File-Based Agents, Self-Delegation, Model Fallback, and Resource Access

Date: 2026-09-09

Status: Implemented and verified in the working tree on 2026-09-10. The final combined provider-free regression run passes 757/757 tests across 29 explicit files. The declared npm 12.0.2 repository check, coding-agent build, and five compiled-package smoke checks pass. See Section 11 and `.artifacts/ice-self-user-ready-20260910/` for commands, source provenance, and certification boundaries.

The implementation was authorized by the user's instruction to complete this plan directly. The original design is retained below as historical requirements, not as a competing current-state description. User files/settings were not automatically migrated; no commit or push was created.

## 1. Objective

Replace ICE's hardcoded specialist roles with optional user-controlled Markdown agents and a default ability for the parent agent to delegate a task to a bounded copy of itself.

Add:

- Global and project-specific agent files.
- Global-first configuration precedence throughout `ice`, not only agent discovery.
- Working primary and fallback model fields in agent files, with the captured parent model as the last candidate.
- Explicit skill access and controlled access to selected MCP tools.
- The same permission, budget, hook, cancellation, persistence, and verification boundaries across self-delegation and file-based agents.

Keep Ice's native reasoning/tool loop authoritative. Preserve ordinary `ice` behavior.

## 2. User requirements and interpretation

### Confirmed direction

- Remove the eleven hardcoded specialist role definitions.
- Allow the parent to spawn a child using its own instructions and permitted capabilities without selecting a specialist role.
- Keep custom specialists in Markdown files.
- Support global and project agent definitions.
- Global settings take precedence over project settings generally, not only for agents.
- Support a primary model and a fallback model, then inherit the parent model as a last resort.
- Allow subagents to use skills and MCP tools.

### Adopted implementation decisions

1. **Agent paths:** `~/.ice/agents` globally and the nearest trusted repository `.ice/agents` for project agents. An explicit custom agent directory or environment override uses `<agentDir>/agents`. Existing settings/auth paths remain unchanged.
2. **Migration:** move away from the current default global `~/.ice/agent/agents` path through an explicit, collision-reporting migration. Do not silently move, overwrite, or delete user files.
3. **Self history:** inherit applicable instructions and eligible capabilities, but start with fresh conversation history by default. Full conversation inheritance is not implied by copying the agent.
4. **Fallback timing:** automatically try another model during admission or clearly retry-safe startup only. Switching models after actions have run is outside the initial implementation.
5. **Writer scope:** retain the existing separate writer workflow and its authority boundary. General self/file delegation does not automatically redesign isolated writers or their model policy.
6. **Configuration scope:** global-first applies to settings consumed by `ice`; it does not automatically rewrite every upstream extension's independently owned configuration format or change stock `ice`.

## 3. Historical pre-implementation source context

These observations describe the source when the plan was written. They are superseded by the implemented contracts and verified closure in Section 11; for example, the bundled catalog and diagnostic-only model fields described here no longer exist in the active delegation path.

| Area | Current behavior | Relevant files |
|---|---|---|
| Launcher | `ice` registers a hidden delegation extension | `packages/coding-agent/src/ice.ts` |
| Profiles | Eleven built-in roles plus global/project Markdown profiles; trusted project names currently take precedence | `packages/coding-agent/src/ice-subagents.ts` |
| Global path | Default profile directory is `~/.ice/agent/agents`, derived from the agent directory | `packages/coding-agent/src/config.ts`, `packages/coding-agent/src/ice-subagents.ts` |
| Project path | Nearest ancestor `.ice/agents`; launch requires trust | `packages/coding-agent/src/ice-subagents.ts` |
| Child tools | Seven recognized built-in names; normal children narrow to four read-only tools | `packages/coding-agent/src/ice-subagents.ts` |
| Child resources | Explicit selected skills/resources already have loading and revalidation paths | `packages/coding-agent/src/ice-subagents.ts` |
| Host runtime | Explicit host-authorized children may load normal resources and adapters, but model-visible tools remain constrained; this is not a selected-MCP capability contract | `packages/coding-agent/src/ice-subagents.ts` |
| Settings | Shared SettingsManager currently merges project settings over global settings; ICE also resolves scoped policy separately | `packages/coding-agent/src/core/settings-manager.ts`, `packages/coding-agent/src/ice-subagent-settings.ts` |
| Model routing | Per-call exact routes are opt-in; role-file model metadata is diagnostic-only | `packages/coding-agent/src/ice-subagent-routing.ts`, `packages/coding-agent/src/ice-subagents.ts` |
| Hooks | Parent-owned decision/observation hooks, command policy, and durable intent/outcome handling | `packages/coding-agent/src/ice-subagent-settings.ts`, `packages/coding-agent/src/ice-subagent-command-hooks.ts` |
| Jobs | Owner-scoped durable metadata and captured routing provenance | `packages/coding-agent/src/ice-subagent-jobs.ts` |

Existing planning documents contain historical deferrals. Read the approved expansion at the top of `idea.md` before using those deferrals as current scope decisions.

## 4. Architecture and non-goals

### Required boundaries

- Ice remains the only authoritative reasoning/tool loop.
- Reuse Ice's model catalog, auth handling, skill loading, session APIs, and extension seams.
- No competing model registry, MCP controller, planner, session store, or compaction engine.
- A child never receives more authority than the parent can delegate under current policy.
- Global preference precedence does not defeat denies, execution-mode restrictions, or trust requirements.
- A plan/review child must remain read-only, including through MCP.
- A skill or system prompt is instruction data, not a permission grant.
- No recursive delegation by default.
- No automatic replay of actions with unknown outcomes.
- Verification results remain authoritative over model claims.
- No sandbox claim for ordinary host execution, command hooks, or MCP access.

### Non-goals for the first implementation

- Unlimited agent trees or recursive delegation.
- Automatic installation of providers, skills, or MCP servers.
- Credential discovery, expansion, or automatic login during fallback.
- Loading arbitrary repository extensions just to expose one MCP tool.
- Mid-task model switching after potentially non-idempotent actions.
- Automatic resumption of interrupted live children after restart.
- Replacing or broadening the isolated writer workflow.
- Modifying stock `ice` configuration precedence by default.

## 5. Proposed user-facing contracts

### 5.1 Agent locations

Proposed layout:

```text
~/.ice/agents/
  api-review.md
  backend-worker.md

repository/
  .ice/agents/
    database-review.md
```

Resolution:

1. Exact global file definition.
2. Exact trusted-project file definition.
3. No hidden specialist fallback.

Self-delegation is a separate launch choice, not another hardcoded specialist profile.

When global and project files have the same name, select the complete global definition. Do not combine two bodies or silently blend tool requests. Show the shadowed project source in diagnostics.

Define custom agent-directory/environment override behavior before changing discovery paths. Keep settings and credentials in their existing locations unless a separate migration is explicitly requested.

### 5.2 Example specialist file

The following is a proposed contract, not a currently supported complete example:

```markdown
---
name: api-review
description: Review API compatibility and validation.
model: provider/primary-model-id
fallbackModel: provider/fallback-model-id
tools: [read, grep, find, ls]
skills: [api-review-checklist]
thinking: high
timeoutMs: 120000
---
You are an API reviewer.
Report concrete defects with file paths and line references.
Separate verified findings from uncertainty and unrun checks.
Do not modify files.
```

Use exact catalog references, not endpoints or credentials. Final MCP selector syntax must follow inspection of the installed adapter's real APIs; do not invent a working configuration shape in advance.

### 5.3 Self-delegation

A launch without a named file agent creates a parent-derived child:

- Parent's applicable system instructions.
- Parent's selected model by default.
- Eligible parent tool capability identities, narrowed by policy and task scope.
- Fresh history by default, with an optional bounded sanitized handoff.
- Independent turn/tool/output/time budgets.
- Parent-owned cancellation and verification.
- No delegation/controller/session-management authority by default.

Snapshot instructions without copying secrets, transient approval messages, or authority tokens into the prompt. Preserve higher-priority runtime restrictions outside agent prose.

### 5.4 Global-first settings

For ordinary settings preferences:

```text
explicit global value
    otherwise explicit trusted-project value
        otherwise built-in default
```

Important distinctions:

- Missing and explicit `false`, `0`, or empty values are different.
- Resolve nested objects by documented field semantics; do not let parser-supplied defaults masquerade as explicit global settings.
- Arrays need explicit replacement/combination semantics, not accidental merging.
- Permissions are not ordinary preferences: denies win and restrictive caps continue to constrain all layers.
- Explicit per-call requests may specialize allowed operational preferences within hard policy limits. Document this separately from global-versus-project precedence.
- Settings writes remain scoped. A project save must not overwrite a global file.
- Global-first applies to `ice`; ordinary `ice` retains existing defaults.

### 5.5 Model candidate order

Proposed order for file-agent launches:

1. Explicit call model, if supplied; otherwise agent-file primary model.
2. Agent-file fallback model, if supplied.
3. Parent model captured for that launch.

Deduplicate equivalent candidates. Omitted model fields naturally reach the captured parent.

For each candidate:

- Resolve through Ice's existing runtime/catalog.
- Check configured authentication without mutating auth.
- Check text/modality, tool, reasoning, context, and output requirements.
- Check applicable route policy.
- Record a bounded reason when a candidate is unavailable or incompatible.

Policy denial is not a license to route around a restriction. Define which availability/capability failures permit advancing and which policy failures reject the request.

Once actions may have occurred, do not silently start over with another model. All retry-safe attempts share aggregate budgets. Queued jobs preserve the selected route and fingerprint; restart or queue promotion never silently reruns candidate selection.

## 6. Ordered implementation plan

### Step 1: Record architecture and baseline

- Update `idea.md` with the approved target and explicitly distinguish proposal from implementation.
- Record branch, dirty state, current toolchain versions, affected test baseline, and existing artifacts.
- Preserve unrelated changes and do not touch reference harnesses.
- Read complete affected files and installed API types before implementation, not only the seams used for this proposal.

Acceptance: the baseline and scope decisions are recorded; no unrelated changes are claimed as this work.

### Step 2: Specify global-first behavior

- Inventory shared settings and ICE modules that manually resolve global/project values.
- Define missing/empty/scalar/object/list behavior.
- Separate preferences from trust, denies, caps, and explicit invocation overrides.
- Document extension-owned settings that cannot be changed through the shared manager without adapter work.

Acceptance: precedence has one explicit contract and a table of consumers rather than different interpretations per feature.

### Step 3: Implement ice-only settings precedence

- Add a tested precedence option at the existing settings integration boundary.
- Thread it through `ice` startup, child construction, reload, save, and effective settings projections.
- Audit every re-merge path so updates do not silently restore project-first behavior.
- Keep ordinary `ice` behavior unchanged by default.
- Preserve scoped writes and diagnostics identifying the actual source.

Likely files:

- `packages/coding-agent/src/core/settings-manager.ts`
- `packages/coding-agent/src/ice.ts`
- `packages/coding-agent/src/ice-subagent-settings.ts`
- `packages/coding-agent/src/modes/rpc/rpc-settings.ts`
- Other ICE consumers identified by the inventory.

Acceptance: explicit global values win consistently in `ice`; stock `ice` retains current precedence.

### Step 4: Change file discovery and migration

- Implement the confirmed global path and trusted-project search path.
- Make global agent definitions win on name collisions.
- Define environment/custom agent-directory behavior.
- Inventory the old global directory and present a migration manifest.
- Never overwrite, remove, or migrate user files without explicit approval.
- Avoid silent compatibility lookup unless specifically requested.

Acceptance: discovery identifies winning/shadowed sources, trust failures, and migration collisions deterministically.

### Step 5: Remove hardcoded specialists

- Remove the eleven built-in profile definitions and implicit specialist aliases.
- Find every dependency on names such as `explore`, `review`, or `worker` in defaults, tools, tests, UI, and prompts.
- Keep user-owned files untouched.
- Adapt `review_batch` to self-based review tasks or explicitly named file agents.
- Do not replace deleted roles with concealed specialist defaults elsewhere.

Acceptance: no user-supplied file is required for self-delegation, and nonexistent named agents fail clearly.

### Step 6: Implement self-delegation

- Introduce an explicit internal distinction between self-derived and file-derived agent definitions.
- Snapshot applicable parent instructions, model, and delegable capability identities.
- Preserve fresh history by default and optional bounded sanitized handoff.
- Ensure child work cannot mutate parent steering/control state.
- Exclude recursive delegation and privileged parent-management tools.

Acceptance: the child receives the intended instructions and eligible capabilities while retaining its own scope and budgets.

### Step 7: Extend the Markdown schema

- Make primary `model` effective and add `fallbackModel`.
- Support explicit skill and MCP selections using validated, bounded identifiers.
- Retain strict unknown-field diagnostics, source validation, and bounded prompts.
- Document supported frontmatter versus settings-only fields.
- Provide complete examples without silently executable configuration.

Acceptance: malformed references and unsupported selectors fail before child creation.

### Step 8: Implement model candidate resolution

- Reuse `ice-subagent-routing.ts` and Ice's runtime APIs.
- Implement the documented primary/fallback/parent order and deduplication.
- Validate each eligible candidate against requested capabilities.
- Report selected model and skip reasons without credentials or private endpoint data.
- Preserve the existing explicit route authorization boundary until its replacement policy is approved.

Acceptance: candidate selection is deterministic and policy cannot be bypassed by fallback.

### Step 9: Integrate bounded recovery and durable routing

- Separate admission fallback from runtime retry.
- Permit startup retry only when failure classification proves no ambiguous child effects.
- Share usage, time, and attempt budgets across candidates.
- Capture the chosen route and capability fingerprint at durable acceptance.
- Fail explicitly on stale/unavailable queued routes rather than silently choosing another model.

Acceptance: no test can cause fallback to replay an edit or external action with uncertain outcome.

### Step 10: Generalize child tool capabilities

- Replace reliance on seven string names with a bounded, child-safe capability description for eligible parent tools.
- Retain scoped built-in tool wrappers.
- Wrap external tool dispatch with permissions, hooks, budget accounting, cancellation, and result limits.
- Resolve name collisions and identify provider/server/tool origins explicitly.
- Reject tools whose parent-session assumptions or authority cannot be safely adapted.

Acceptance: self children inherit only delegable capabilities; specialist selections narrow them; unknown or privileged tools do not become implicitly available.

### Step 11: Refine skill inheritance and selection

- Reuse Ice's skill loader and existing selected-resource checks.
- Support named specialist skills and an explicit self-inheritance choice.
- Apply global-first selection where ICE owns resolution.
- Revalidate trust and hashes before loading.
- Preserve context/output limits and keep skill instructions separate from execution authority.

Acceptance: a skill mentioning Bash or MCP cannot grant those tools when the child lacks permission.

### Step 12: Integrate selected MCP tools

- Inspect the installed MCP extension, actual types, tool naming, dispatch context, connection lifecycle, and cancellation behavior.
- Prefer parent-owned adapter dispatch rather than arbitrary child extension loading or duplicate connections.
- Require explicit server/tool selection and enforce the parent's policy.
- Classify read-only, mutating, and unknown operations; do not trust an MCP description as policy.
- Keep network/credential authority explicit and restrict plan/review modes.
- Fail closed when an adapter cannot safely support delegated dispatch.

Acceptance: provider-free fake MCP tests demonstrate allowed calls, denied calls, cancellation, bounded outputs, and no unauthorized connection/auth expansion.

### Step 13: Extend hooks consistently

- Apply hooks to self and file agents and to built-in and selected MCP tool calls.
- Preserve decision events and observational events.
- Carry bounded source, model, and tool identity metadata.
- Make global hook definitions win collisions without weakening required policy hooks.
- Preserve durable intent/outcome semantics and missing-approval failure behavior.
- Never let hook output increase tool/model authority or clear failed verification.

Acceptance: every applicable dispatch goes through its required policy hooks, including MCP operations.

### Step 14: Update discovery, settings, and supervision UI

- Show self-delegation and actual file agents, not deleted built-in roles.
- Display global/project source, shadowed definitions, primary/fallback models, and effective capabilities.
- Explain overridden project settings and unavailable model candidates.
- Update TUI and RPC projections together.
- Keep sensitive tool payloads and credentials out of diagnostics.

Acceptance: the UI describes observed effective behavior, not requested-but-denied capabilities.

### Step 15: Add provider-free regression coverage

Cover:

- Global-first leaves, nested fields, false/zero/empty values, arrays, reload, and writes.
- Stock `ice` compatibility.
- Global/project role collisions, untrusted sources, custom directories, migration conflicts.
- Self-delegation without built-in role dependencies.
- Instruction inheritance, fresh history, scope narrowing, and recursion denial.
- Primary/fallback/parent selection, duplicates, missing auth, incompatible reasoning/tools, and policy rejection.
- Aggregate attempt budgets and no fallback replay after side effects.
- Captured queued routes, stale fingerprints, and restart interruption.
- Skill hash changes and denied skill-requested tools.
- Fake MCP read/mutation permissions, headless approval, cancellation, output caps, and adapter failures.
- Hook ordering, required hooks, durable write failures, and unresolved effects.

Use the faux provider and fake adapters. Do not call real paid providers or external MCP services in the normal regression suite.

### Step 16: Verify and document migration

- Run all affected targeted tests from their package roots.
- Run the repository check using the declared npm version; when active npm is not `12.0.2`, use `corepack npm@12.0.2 run check` and record both versions.
- Record commands, exit statuses, changed files, artifacts, and unresolved failures.
- Do not claim live provider/MCP certification from fake-adapter tests.
- Update `idea.md`, the user guide, settings docs, applicable changelog, and HTML explainer.
- Document the final paths, precedence, fallback behavior, capability restrictions, migration, and rollback boundaries.
- Do not commit, push, or publish externally without approval.

## 7. Verification matrix

| Area | Mandatory result |
|---|---|
| Global precedence | Explicit global values win in every supported ice merge path |
| Security composition | Deny/mode/trust rules cannot be overridden by a more permissive preference |
| Stock ice | Existing default precedence and ordinary launch behavior remain unchanged |
| Agent discovery | Files are the only named specialist source; self-delegation works independently |
| Models | Exact deterministic candidate order with no credential expansion or silent post-acceptance rerouting |
| Recovery | No replay of uncertain edits or external actions |
| Skills | Selected/inherited resources load without granting tools |
| MCP | Only selected, authorized, safely adapted tools execute |
| Hooks | Required gates remain effective across all delegated tool types |
| Durability | Accepted route/provenance persists; interrupted work is not relaunched automatically |
| UI/docs | Effective state and remaining limitations are visible and consistent |

## 8. Risks and mitigations

- **Global-first changes existing expectations:** inventory affected consumers, expose source diagnostics, and keep stock ice unchanged.
- **New global path could hide existing roles:** require explicit migration and report old-path files; do not delete user data.
- **Removing built-ins breaks callers:** replace internal name assumptions and document missing-file errors before removal lands.
- **Self inheritance could copy authority accidentally:** snapshot instructions separately from permissions and exclude privileged control tools.
- **MCP tools may have broad external effects:** require explicit policy and adapter guarantees; prompts and tool descriptions are not isolation.
- **Fallback can change cost and capabilities:** validate candidates and retain attempt/model provenance with shared budgets.
- **Concurrent parent/child use can expose adapter state bugs:** verify connection ownership and dispatch context before enabling an adapter.
- **Stale documentation can imply completion:** replace superseded claims and report verified scope explicitly.

## 9. Rollback and rollout

Implement in small, reviewable slices: precedence contract, file/self agent resolution, model selection, skills, then MCP integration.

Keep high-risk MCP capability opt-in during rollout. Disabling the new capability must block new admissions without deleting retained jobs or journals. Preserve inspect/cancel access to existing owned jobs.

Do not silently restore old profile files or reroute durable work during rollback. A settings/path rollback must describe which source will win and require operator approval for file movement.

## 10. Completion criteria

This plan is complete only when:

- Confirmed path and scope decisions are recorded.
- No hardcoded specialist catalog remains in the implemented delegation path.
- Self-delegation and global/project file agents operate under global-first policy.
- Primary/fallback/parent routing behaves deterministically within approved failure boundaries.
- Selected skills and MCP tools respect parent authority and mode restrictions.
- Required targeted tests and the exact repository check pass with recorded evidence.
- Migration and user documentation match implemented behavior.
- Remaining live-certification gaps and unsupported adapters are explicitly listed.

Writing this plan alone does not satisfy any implementation completion criterion. The following closure records source changes and executed checks.

## 11. Implementation closure — 2026-09-10

### Verified step ledger

| Step | Status | Implemented result and evidence |
|---|---|---|
| 1 | Complete | `baseline.json`, binary/staged patches, per-file hashes, and copies of all 49 pre-existing dirty paths were captured before implementation. |
| 2 | Complete | The consumer inventory below defines explicit global values, missing versus empty values, arrays, permissions, and extension-owned boundaries. |
| 3 | Complete | `SettingsManager.globalFirst`, `main` bootstrap/runtime/session-switch threading, ICE opt-in, scoped save/reload/trust re-merges, and RPC source projections; stock Ice behavior is tested unchanged. |
| 4 | Complete | Global file-agent paths, custom directory behavior, winning/shadowed definitions, and non-destructive collision-aware legacy migration manifest. |
| 5 | Complete | No named bundled specialist catalog or aliases; self/file tools and all affected regression fixtures migrated. Review helpers use self with read-only authority. |
| 6 | Complete | Actual effective parent prompt snapshot, additive bounded guidance, eligible active capabilities, fresh history by default, bounded fork handoff, and no privileged controller inheritance. |
| 7 | Complete | Strict file schema supports effective primary/fallback models, resources, hooks, and exact MCP selectors. Invalid model references are rejected rather than silently truncated. |
| 8 | Complete | Ice-owned deterministic call-or-primary / file-fallback / captured-parent routing, deduplication, existing-auth/capability checks, global opt-in, and bounded skip reasons. |
| 9 | Complete | At most two pre-effect startup attempts, remaining aggregate budgets, terminal runtime failures, immutable durable route/capability/resource fingerprints, and explicit stale-promotion failure. |
| 10 | Complete | `ice-subagent-capabilities.ts` implements typed parent-owned child-safe tool registration, origins/schemas/fingerprints, scope-only immutable dispatch context, live revocation, hooks, budgets, cancellation, and redacted output limits. Scoped built-in wrappers remain separate. |
| 11 | Complete | Named resource selection plus explicit self parent-skill inheritance; file hashes/trust/count/byte limits and permission separation are enforced. No ambient child package installation or extension loading. |
| 12 | Complete | Self/file selected MCP uses registered parent adapters, actual installed parameter schemas, host-owned access classifications, collision-resistant names, bounded/error-preserving dispatch, cancellation, and live schema/adapter revocation. Unsupported unregistered backends fail closed. |
| 13 | Complete | Trusted registered handlers are wired into production facades; required hooks cannot be filtered out, global definitions win collisions without downgrading required status, and live unregistration fails closed. Native intent/outcome and report-only finalization boundaries are retained. |
| 14 | Complete | Discovery includes self, actual file sources, effective capabilities and models, fallback/skip diagnostics, and MCP availability; RPC exposes winning preference source and correct override state. Existing child views and ownership controls remain covered. |
| 15 | Complete | Final `acceptance-final` run: 29 explicit affected files, 757 tests passed, zero failures. Includes native faux-provider adapter dispatch, required MCP hooks, queued route changes, no runtime replay, resource precedence, scope/Unicode adversarial cases, and isolated writer/UI regressions. |
| 16 | Complete | npm 12.0.2 repository verification, coding-agent build, five compiled-package smoke checks, consistent user/settings/changelog/product docs, typed adapter examples, and static HTML operator explainer. |

### Shared consumer inventory

| Consumer | ICE behavior | Compatibility boundary |
|---|---|---|
| Startup, new/switch sessions, reload, save and trust changes | Shared `SettingsManager` global-first option retained at every construction/re-merge path | Stock Ice omits the option and stays project-first. |
| Subagent defaults and role preferences | File/default, project default, project role, global default, global role, explicit invocation; restrictive caps/denies applied separately | Project trust cannot grant extra execution authority. |
| Packages and configured resource arrays | Explicit global arrays replace matching project configuration arrays; missing global keys preserve project values | Ambient child package resolution is disabled altogether. |
| Same-name skills, prompt templates, SYSTEM and APPEND_SYSTEM | Global name/source wins under ICE | Stock resource ordering is tested unchanged. |
| File-agent discovery | Global whole-file definition wins; trusted project is fallback | Legacy paths are inventoried, never silently loaded or moved. |
| Hooks | Global definition wins same-ID collisions; required status is monotonic; explicit global disable blocks project enable | Commands retain independent host policy, trust, mode, Bash and approval gates. |
| RPC and interactive settings | Effective values and preference source distinguish shadowed project settings | Permission constraints can further narrow the preferred value. |
| Independently owned extension/provider configuration | Unchanged unless consumed through the shared manager or an explicit adapter | No wholesale rewrite of external formats or credentials is claimed. |

### Operator readiness and certification limits

Use `role: "self"` without a role file. Add `self.inheritSkills: true` only when parent skill inheritance is wanted; select MCP tools explicitly. File-agent model routing remains gated by global `ice.subagents.modelSelection.mode: "configured"`. No real user configuration was edited to enable optional authority.

The parent extension APIs and examples are public in the built package. An independently installed MCP extension must register the supported parent-owned adapter contract; arbitrary third-party backends are not automatically connected or certified. Live provider/server quality, availability, billing behavior, and OS-level containment are outside provider-free regression claims. Host Bash, command hooks, and remote effects are not sandboxed, and cancellation cannot undo completed effects.

User documentation: `packages/coding-agent/docs/subagent-user-guide.md`. Runnable generic-tool example: `packages/coding-agent/examples/extensions/ice-delegable-workspace-info.ts`. Existing-backend MCP helper: `packages/coding-agent/examples/ice-mcp-adapter.ts`. Operator explainer: `html-communication/subagent-user-ready.html`.

The complete evidence index is `.artifacts/ice-self-user-ready-20260910/evidence.md`; source hashes and preserved-preexisting-work checks are in its final provenance packet.

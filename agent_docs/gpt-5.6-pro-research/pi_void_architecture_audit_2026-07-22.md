# pi-void: source-audited architecture and implementation plan

**Research cutoff:** 2026-07-22. All external sources were accessed on 2026-07-22; open-source projects are pinned to the exact commits listed below. The originating specification is the user-supplied `Pasted text(3).txt` brief.

## Evidence labels

- **[VERIFIED]** Directly supported by primary source code, official documentation, raw benchmark artifacts or an audited paper.
- **[INFERRED]** A reasonable architectural deduction from verified facts, but not directly measured.
- **[PROPOSED]** An original pi-void design choice or acceptance threshold.
- **[UNRESOLVED]** Evidence is missing, conflicting or not sufficiently versioned. No numeric value is inferred.

## 1. Executive verdict

**[PROPOSED]** **Select the Balanced Hybrid architecture. Pi remains the main driver.** Preserve Pi's provider/model layer, central loop, default tools, prompt construction, session tree, compaction, TUI/RPC/headless modes and extension system. Add pi-void as separate packages that subscribe to Pi events, enforce deterministic policy, write source-auditable traces, launch the whole unmodified Pi process inside an opt-in sandbox, verify repository outcomes, apply bounded recovery, and introduce subagents only as an optional late-stage profile. OpenHands should supply architectural patterns and, later, an optional workspace/agent-server adapter; it should not become the default controller or mandatory Python dependency.

The strongest evidence is structural rather than a single leaderboard: Pi already exposes the required extension and persistence seams without a loop rewrite; OpenHands demonstrates useful controller/workspace, confirmation, stuck-detection and event-history mechanisms; repeated benchmarks show that harness choices matter but also reverse by model and task. [PI-EXT](https://github.com/earendil-works/pi/blob/dd6bea41efa8caa7a10fe5a6401676dc5699f83f/packages/coding-agent/src/core/extensions/types.ts) [PI-SESSION](https://github.com/earendil-works/pi/blob/dd6bea41efa8caa7a10fe5a6401676dc5699f83f/packages/coding-agent/src/core/session-manager.ts) [PI-LOOP](https://github.com/earendil-works/pi/blob/dd6bea41efa8caa7a10fe5a6401676dc5699f83f/packages/agent/src/agent-loop.ts) [OH-CONVERSATION](https://github.com/OpenHands/software-agent-sdk/blob/9dda2df6f5432c32861eb21e8d57df7e5525133d/openhands-sdk/openhands/sdk/conversation/impl/local_conversation.py) [OH-DOCKER](https://github.com/OpenHands/software-agent-sdk/blob/9dda2df6f5432c32861eb21e8d57df7e5525133d/openhands-workspace/openhands/workspace/docker/workspace.py) [TUA](https://arxiv.org/html/2606.28480) [GITTASK](https://arxiv.org/html/2508.18993)

**Largest uncertainty:** no public benchmark directly compares stock Pi, the proposed pi-void hybrid and OpenHands on a synchronized, coding-specific, same-model, repeated matrix. Expected reliability gains therefore remain a hypothesis until the evaluation plan in Section 10 is run.

**Explicit build exclusions:** no Pi core rewrite, no second provider abstraction, no mandatory OpenHands SDK, MCP, browser, vector database or multi-agent mode, no copied proprietary Claude Code behavior beyond public semantics, no automatic merge/deploy, and no self-modifying harness before regression control exists.

### Decision summary

| Decision | Verdict | Evidence confidence | Source-quality note |
| --- | --- | --- | --- |
| Main driver | Pi | high | Direct source inspection shows the loop, hooks, provider registry and session tree already exist. |
| Default architecture | Balanced Hybrid | medium-high | Architecture follows verified seams; performance benefit still requires pi-void-specific trials. |
| OpenHands role | Pattern source and optional runtime adapter | high | MIT source is inspectable; embedding the complete Python stack would add unnecessary coupling. |
| First code slice | @pi-void/safe-verify | high for feasibility | Uses existing tool_call, agent_settled, provider and appendEntry APIs; zero upstream edits. |
| Multi-agent | defer and opt in | medium | Mechanisms exist in OMP/Grok/OpenAI, but coding-specific Pi evidence and net-cost benefit are absent. |
| Current frontier ceiling | Codex + GPT-5.6 Sol max, AA v1.2 index 61 | medium | Repeated aggregate is current, but model and harness are confounded and raw attempts/harness version are closed. [AA-CODEX](https://artificialanalysis.ai/agents/coding-agents/comparisons/codex-vs-opencode) |

## 2. Corrected research baseline

### 2.1 What Harness-Bench proves - and does not prove

**[VERIFIED]** Harness-Bench v1 evaluates six configurable harnesses across eight model backends and 106 tasks in a full factorial, plus a separate Codex-native reference. It reports 5,088 configurable trajectories plus 106 Codex trajectories. NanoBot's 76.2 is the highest configurable-harness aggregate; the separate Codex reference is 80.4. This is unusually useful evidence that harness effects exist. [HB-PAPER](https://arxiv.org/html/2605.27922)

**[VERIFIED]** It is not sufficiently coding-specific to choose pi-void: only 22 tasks are software engineering and 7 are SRE/DevOps; every task-model-harness cell is one trajectory; the aggregate includes an LLM-judged process component; no pairwise confidence intervals establish statistical significance. The repository has also moved to a materially changed 100+ task `HarnessBench 2.0` layout at commit `1025086...`. V1 paper scores must not be attached to the 2.0 suite without a versioned result artifact. [HB-REPO](https://github.com/Qihoo360/harness-bench)

### 2.2 NanoBot's relevance

**[VERIFIED]** NanoBot is a broad configurable-runtime leader in Harness-Bench v1, not a demonstrated coding-harness template. Its result argues for small, coherent harnesses and disciplined tool use, but does not show that NanoBot's architecture should replace Pi's. The benchmark mix and single-run design make causal feature extraction unsafe without source-level ablations.

### 2.3 Positioning Pi, OpenHands, OpenCode and Codex

| System | Correct architectural position | Best relevant evidence | Do not overstate |
| --- | --- | --- | --- |
| Pi | Minimal multi-provider terminal harness and embeddable runtime | Direct source inspection; preliminary local experiment 123/160 [LOCAL-WIP](https://www.neuralnoise.com/2026/harness-bench-wip/) | The local result uses private tasks and one run per cell; universal performance leadership is not established. |
| OpenHands | Software-agent platform/SDK/controller/workspace stack containing coding-agent implementations | Repeated GitTaskBench/TUA evidence plus inspectable SDK [GITTASK](https://arxiv.org/html/2508.18993) [TUA](https://arxiv.org/html/2606.28480) [OH-SDK](https://github.com/OpenHands/software-agent-sdk) | It is not a single monolithic coding agent, and OpenHands Index is owner-operated and usually single-run. |
| OpenCode | Open-source multi-provider coding CLI/client-server product | Current AA v1.2 fixed-model Opus 4.7 chart favors OpenCode over Claude Code/Cursor [AA-LB](https://artificialanalysis.ai/agents/coding-agents) | One model/composite does not establish universal harness leadership. |
| Codex | OpenAI-native coding CLI/runtime | Current AA v1.2 leader with GPT-5.6 Sol max; strong terminal results [AA-CODEX](https://artificialanalysis.ai/agents/coding-agents/comparisons/codex-vs-opencode) | Different-model comparisons cannot isolate the Codex harness; current top row is a system result. |

### 2.4 Current-model benchmark correction: GPT-5.6 Sol and Fable 5

**[VERIFIED]** GPT-5.6 Sol is available under model ID `gpt-5.6-sol`; the `gpt-5.6` alias routes to it. Official documentation lists a 1,050,000-token context window, 128,000 maximum output, function calling and structured outputs, at $5/M input, $0.50/M cached input and $30/M output. [GPT56-MODEL](https://developers.openai.com/api/docs/models/gpt-5.6-sol)

**[VERIFIED]** Artificial Analysis v1.2 currently covers 321 tasks - DeepSWE 113, Terminal-Bench v2 subset 84 and SWE-Atlas-QnA 124 - with three repeats per task/system. Codex + GPT-5.6 Sol max scores 61 overall, with 69% DeepSWE, 88% Terminal-Bench v2 and 27% SWE-Atlas-QnA; reported pooled cost is $7.08/task, active time 10.2 minutes/task, 13.2 million tokens/task and 114.2 turns/task. [AA-METHOD](https://artificialanalysis.ai/methodology/coding-agents-benchmarking) [AA-CODEX](https://artificialanalysis.ai/agents/coding-agents/comparisons/codex-vs-opencode)

**[VERIFIED]** The launch article's value of 80 is from index v1.1. It is not comparable to the current v1.2 value of 61 because the component set and SWE-Atlas-QnA scoring changed. This is benchmark-version drift, not evidence of a model regression. [AA-GPT56-ARTICLE](https://artificialanalysis.ai/articles/gpt-5-6-has-landed) [AA-METHOD](https://artificialanalysis.ai/methodology/coding-agents-benchmarking)

**[VERIFIED]** Claude Fable 5 uses API model ID `claude-fable-5`, is positioned for long-running coding work, costs $10/M input and $50/M output, and can route safeguarded requests to Opus 4.8. Current AA v1.2 reports Claude Code + Fable 5 max with fallback at index 59, versus Codex + GPT-5.6 Sol max at 61. Because model, harness and fallback behavior all differ, this is a frontier-system comparison, not controlled harness evidence. [FABLE](https://www.anthropic.com/claude/fable) [FABLE-DOCS](https://platform.claude.com/docs/en/release-notes/overview) [AA-CLAUDE-CODEX](https://artificialanalysis.ai/agents/coding-agents/comparisons/claude-code-vs-codex)

### 2.5 Stronger benchmark signals for pi-void

| Benchmark/research | Design | Most relevant finding | Use for pi-void | Main limitation | Primary source |
| --- | --- | --- | --- | --- | --- |
| GitTaskBench | 54 repository tasks, Aider/SWE-agent/OpenHands, two runs | OpenHands wins every shared-model task-pass-rate row in that study | Coding-specific reference for repo setup, execution and verification | 2025 harness versions; only two repeats; environments differ | [GITTASK](https://arxiv.org/html/2508.18993) |
| TUA-Bench | 120 broad terminal tasks, five trials per configuration | Same-model ranking reverses: GPT-5.5 favors Codex/mini-SWE, Opus 4.8 favors OpenHands | Evidence to avoid one universal loop and to pin model/harness together | Broad terminal tasks, not coding-only; time budget strongly affects results | [TUA](https://arxiv.org/html/2606.28480) |
| OpenHands Index | Five suites with raw aggregate/archive artifacts | OpenHands leads audited exact-model Codex/Claude ACP rows on GPT-5.5 and Opus 4.7 | Task-family diagnostics and trace examples | Owner conflict, version mismatch and normally one trajectory | [OH-INDEX](https://github.com/OpenHands/openhands-index-results) |
| Artificial Analysis v1.2 | 321 tasks, three repeats, current frontier systems and a fixed Opus 4.7 chart | Current native-system ceiling and one controlled fixed-model harness slice | Current model-era target and efficiency metrics | Raw attempts and exact harness versions are closed | [AA-METHOD](https://artificialanalysis.ai/methodology/coding-agents-benchmarking) [AA-LB](https://artificialanalysis.ai/agents/coding-agents) |
| AHE and harness-evolution papers | automated harness optimization and regression studies | Middleware/tool/memory changes can transfer, but composition/generalization is inconsistent | Justifies ablation, held-out tests and regression gates | Not a direct Pi/OpenHands comparison | [AHE](https://arxiv.org/abs/2604.25850) [COMPOUND](https://arxiv.org/abs/2607.14004) [RETHINK-EVAL](https://arxiv.org/abs/2607.12227) |

## 3. Project identity and licensing

| Product | Canonical repository/docs | Pinned version or commit | Category | License | Identity confidence | Audit note |
| --- | --- | --- | --- | --- | --- | --- |
| Pi / pi-mono | https://github.com/earendil-works/pi | @earendil-works/pi-coding-agent 0.81.1; dd6bea41efa8caa7a10fe5a6401676dc5699f83f | minimal multi-provider terminal coding harness and embeddable agent runtime | MIT | high | Canonical package coordinates changed with the repository transfer. Pin commit and package namespace in pi-void CI. |
| OpenHands | https://github.com/OpenHands/OpenHands; reusable SDK: https://github.com/OpenHands/software-agent-sdk | SDK 1.36.1; 9dda2df6f5432c32861eb21e8d57df7e5525133d | software-agent platform, SDK, controller, and workspace runtime | MIT | high | For architecture reuse, the SDK repository is the primary source. OpenHands is not one monolithic coding agent. |
| Grok Build | https://github.com/xai-org/grok-build | 3af4d5d39897855bdcc74f23e690024a5dc05573 | vendor-native terminal coding/build harness | Apache-2.0 | high | Repository states it is periodically synchronized from a private monorepo; public code is inspectable but not the entire internal development environment. |
| OpenAI Codex CLI | https://github.com/openai/codex | 9fce9e13fd649f8c4549079eb6ca5d697e2ce0e4 | vendor-native coding CLI and agent workflow runtime | Apache-2.0 | high | Open-source CLI/runtime does not imply that hosted Codex services or model internals are open. |
| Claude Code | https://docs.anthropic.com/en/docs/claude-code/overview | not established | vendor-native proprietary coding CLI and IDE workflow | proprietary | high | Only documented behavior can be adapted clean-room; internal prompts and implementation are unavailable. |
| OpenCode | https://github.com/anomalyco/opencode | 130038eb63a94d832b0aea0d3ea9c83511db3d4d | open-source multi-provider coding CLI/client-server system | MIT | high | Useful reference for client/server separation and session UX; replacing Pi's provider layer would be redundant. |
| OhMyPi / OMP | https://github.com/can1357/oh-my-pi | 17.0.7; 7b141199d524b859c357fc89654f10b62b9f3df1 | feature-rich Pi fork | MIT | high | Rejected alternatives: oh-my-openagent is a different OpenCode/Codex ecosystem project; similarly named themes are not this harness. |
| mini-SWE-agent | https://github.com/SWE-agent/mini-swe-agent | 38c01a19ed1a58dd17dd7c95010e4f69d059c777 | minimal research and deployment coding harness | MIT | high | Strong minimal-loop reference: bash-only, linear history, stateless subprocess actions, explicit limits and serialized trajectories. |
| SWE-agent | https://github.com/SWE-agent/SWE-agent | not established | research software-engineering agent and agent-computer interface | MIT | high | Current maintainers recommend mini-SWE-agent for many baseline/deployment uses; SWE-agent remains useful for ACI research. |
| Agentless | https://github.com/OpenAutoCoder/Agentless | 5ce5888b9f149beaace393957a55ea8ee46c9f71 | localize-repair-validate software-repair pipeline | MIT | high | Not an interactive harness; relevant as evidence for explicit localization, candidate generation, and deterministic validation. |
| Harness-Bench | https://github.com/Qihoo360/harness-bench; paper https://arxiv.org/abs/2605.27922 | paper 2026-05-27; repository 1025086a446653702b80cfb48babbeec35db6b2c | general agent-harness benchmark | not established | high | Do not transfer v1 paper scores to the changed 2.0 repository suite without a versioned result artifact. |
| OpenHands Index | https://github.com/OpenHands/openhands-index-results | 3015ac612e7196f428e6e8a3948965d32d9a3331 | owner-operated multi-suite coding-agent index | not established | high | Useful raw archives and same-model rows; direct conflict of interest and normally one trajectory per task. No repository license file was found at the pinned commit, so reuse terms are not established. |

### 3.1 Ambiguous-name resolution

- **[VERIFIED]** **Pi/pi-mono:** `https://github.com/badlogic/pi-mono` redirects to `earendil-works/pi`; current package coordinates use `@earendil-works/*`. pi-void must pin the new canonical identity and test package-name drift. [PI-REPO](https://github.com/earendil-works/pi)
- **[VERIFIED]** **OhMyPi:** the selected identity is `can1357/oh-my-pi`, a substantial Pi fork. `oh-my-openagent` and similarly named themes are different projects and are excluded.
- **[VERIFIED]** **Grok Build:** the selected identity is the first-party `xai-org/grok-build` repository. It is now inspectable under Apache-2.0, but the repository states it is synchronized periodically from a private monorepo; unavailable proprietary services are not inferred. [GROK-BUILD](https://github.com/xai-org/grok-build)

### 3.2 Clean-room and license assessment

| Source | SPDX/status | Reuse status | Obligations | Risk | pi-void action |
| --- | --- | --- | --- | --- | --- |
| Pi | MIT | reuse/adapt permitted | retain copyright and permission notice in substantial portions | low | May import small stable utilities, but prefer depending on upstream packages and extensions. |
| OpenHands SDK | MIT | reuse/adapt permitted | retain MIT notice | low-to-medium | Behaviorally adapt interfaces; direct Python reuse would add a second runtime and increase maintenance. |
| OpenCode | MIT | reuse/adapt permitted | retain MIT notice | low | Use client/server and session concepts; do not duplicate Pi's provider layer. |
| OhMyPi | MIT | reuse/adapt permitted | retain OMP and inherited Pi notices; track provenance per file | medium | Cherry-pick only isolated, well-tested mechanisms. Avoid adopting its fork structure wholesale. |
| mini-SWE-agent | MIT | reuse/adapt permitted | retain MIT notice | low | Use as reference for trajectory and limit semantics; code reuse is optional. |
| Agentless | MIT | reuse/adapt permitted | retain MIT notice | low | Adapt workflow behavior; avoid benchmark-specific implementation coupling. |
| Codex CLI | Apache-2.0 | reuse/adapt permitted under Apache terms | retain license/notices, mark modified files, preserve NOTICE obligations and patent terms | medium | Prefer behavioral adaptation of sandbox/approval/review semantics. |
| Grok Build | Apache-2.0 | reuse/adapt permitted under Apache terms | retain license/notices, mark modifications; review bundled third-party notices | medium | Adapt explicit goal and budget state; do not transplant the orchestrator without need. |
| Claude Code | proprietary | source reuse unavailable | clean-room behavioral reimplementation from public documentation only | high if internal prompts or reverse-engineered code are copied | Implement generic permission modes, hooks and plan/execution separation independently. |

**[PROPOSED]** Maintain a per-file provenance manifest for any reused code. A mixed MIT/Apache project is possible, but Apache-derived files must retain Apache notices, modification notices, NOTICE obligations where present and patent-license terms. Proprietary Claude Code implementation, prompts or reverse-engineered internals must not enter the repository.

## 4. What makes Pi effective

**[VERIFIED]** The audited Pi commit is not merely a four-tool demo. It has a small central loop plus a higher-level harness, typed lifecycle events, project trust, provider registration, model switching, append-only session trees, compaction hooks, RPC/JSON/headless modes and extension persistence. [PI-LOOP](https://github.com/earendil-works/pi/blob/dd6bea41efa8caa7a10fe5a6401676dc5699f83f/packages/agent/src/agent-loop.ts) [PI-HARNESS](https://github.com/earendil-works/pi/blob/dd6bea41efa8caa7a10fe5a6401676dc5699f83f/packages/agent/docs/agent-harness.md) [PI-EXT](https://github.com/earendil-works/pi/blob/dd6bea41efa8caa7a10fe5a6401676dc5699f83f/packages/coding-agent/src/core/extensions/types.ts) [PI-SESSION](https://github.com/earendil-works/pi/blob/dd6bea41efa8caa7a10fe5a6401676dc5699f83f/packages/coding-agent/src/core/session-manager.ts)

| Mechanism | Evidence status | Why it matters | Keep pure? | Measured value | Primary source |
| --- | --- | --- | --- | --- | --- |
| Small default tool surface | VERIFIED | Only read/write/edit/bash are default; fewer schemas and action choices favor inspectability and weaker models | yes | Exact token overhead is not established; measure per tokenizer in Phase 0 | [PI-REPO](https://github.com/earendil-works/pi) [PI-PROMPT](https://github.com/earendil-works/pi/blob/dd6bea41efa8caa7a10fe5a6401676dc5699f83f/packages/coding-agent/src/core/system-prompt.ts) |
| Concise dynamic prompt | VERIFIED | Prompt includes active tools, guidelines, context resources and skills rather than a fixed maximal instruction block | yes | Prompt tokens not established; model-dependent | [PI-PROMPT](https://github.com/earendil-works/pi/blob/dd6bea41efa8caa7a10fe5a6401676dc5699f83f/packages/coding-agent/src/core/system-prompt.ts) |
| Direct model-tool loop | VERIFIED | Few control layers, typed tool results, steering/follow-up and parallel/sequential execution | yes | Turn/tool counts measured in Phase 0 | [PI-LOOP](https://github.com/earendil-works/pi/blob/dd6bea41efa8caa7a10fe5a6401676dc5699f83f/packages/agent/src/agent-loop.ts) |
| Provider abstraction | VERIFIED | Official and custom providers/local OpenAI-compatible endpoints without unofficial proxying | yes | Provider-specific correctness must be conformance-tested | [PI-REPO](https://github.com/earendil-works/pi) [PI-EXT](https://github.com/earendil-works/pi/blob/dd6bea41efa8caa7a10fe5a6401676dc5699f83f/packages/coding-agent/src/core/extensions/types.ts) |
| Append-only session tree | VERIFIED | Inspectability, forks, compaction and extension state without forcing all state into context | yes | Session schema v3 at pinned commit | [PI-SESSION](https://github.com/earendil-works/pi/blob/dd6bea41efa8caa7a10fe5a6401676dc5699f83f/packages/coding-agent/src/core/session-manager.ts) |
| Extension API | VERIFIED | Policy, traces, verification, custom tools and context transforms can live outside upstream paths | yes | Runtime overhead not established; expected low unless hooks perform I/O/model calls | [PI-EXT](https://github.com/earendil-works/pi/blob/dd6bea41efa8caa7a10fe5a6401676dc5699f83f/packages/coding-agent/src/core/extensions/types.ts) |
| No built-in all-purpose planner/MCP/subagent layer | VERIFIED | Avoids mandatory prompt/dependency/security cost; capabilities can be profiles | yes | Whether missing features hurt target tasks is task-dependent | [PI-REPO](https://github.com/earendil-works/pi) |
| Current recovery durability | VERIFIED | Durable boundaries and append-only state are designed, but host runtime objects remain external and some harness migration work is active | preserve and extend externally | Reliability gain from pi-void recovery not established | [PI-DURABLE](https://github.com/earendil-works/pi/blob/dd6bea41efa8caa7a10fe5a6401676dc5699f83f/packages/agent/docs/durable-harness.md) [PI-HARNESS](https://github.com/earendil-works/pi/blob/dd6bea41efa8caa7a10fe5a6401676dc5699f83f/packages/agent/docs/agent-harness.md) |

### 4.1 Required measurements before claiming Pi's minimalism is faster

**[PROPOSED]** For each exact model/provider route, record: tokenizer-counted system prompt; serialized tool-schema tokens; first-turn and steady-state context; context growth per tool result; compaction trigger and summary cost; turns and tool calls; provider/tool retries; wall time; cache reads/writes; and verifier cost. The extension must inject no prompt text during Phase 0 so instrumentation itself is a controlled no-behavior-change treatment.

## 5. Evidence matrix: mechanisms that can improve coding agents

| ID | Status | Claim/mechanism | Sources | Contrary evidence | Confidence | Expected pi-void effect |
| --- | --- | --- | --- | --- | --- | --- |
| E-PURE-PI-LOOP | VERIFIED | Pi's central loop is already a compact model-tool loop with steering/follow-up queues, sequential or parallel tool execution, tool blocking/transformation hooks, and typed events. | [PI-LOOP](https://github.com/earendil-works/pi/blob/dd6bea41efa8caa7a10fe5a6401676dc5699f83f/packages/agent/src/agent-loop.ts) | The higher-level durable harness documentation still marks some automatic compaction/retry trigger integration as active migration work. | high | Do not rewrite the central loop. Add policy and operational behavior through extensions and the host supervisor. |
| E-PURE-PI-EXT | VERIFIED | Pi's extension API exposes the seams required for a first pi-void implementation: pre/post tool hooks, provider request/response hooks, settled events, context transforms, custom tools, persistent custom entries, provider registration and programmatic messages. | [PI-EXT](https://github.com/earendil-works/pi/blob/dd6bea41efa8caa7a10fe5a6401676dc5699f83f/packages/coding-agent/src/core/extensions/types.ts) [PI-SESSION](https://github.com/earendil-works/pi/blob/dd6bea41efa8caa7a10fe5a6401676dc5699f83f/packages/coding-agent/src/core/session-manager.ts) | Extensions execute with host privileges unless Pi itself is placed inside a sandbox or execution is delegated to a sandbox runtime. | high | Implement the first phases outside upstream-owned paths with zero Pi core edits. |
| E-MINIMALISM | INFERRED | Pi's four default coding tools and concise prompt construction are performance features because they constrain schema overhead and action ambiguity, especially for smaller or local models. | [PI-PROMPT](https://github.com/earendil-works/pi/blob/dd6bea41efa8caa7a10fe5a6401676dc5699f83f/packages/coding-agent/src/core/system-prompt.ts) [PI-REPO](https://github.com/earendil-works/pi) [MINISWE-LOOP](https://github.com/SWE-agent/mini-swe-agent/blob/38c01a19ed1a58dd17dd7c95010e4f69d059c777/src/minisweagent/agents/default.py) [SWEAGENT](https://arxiv.org/abs/2405.15793) | A richer tool can reduce turns when it encodes a high-value operation such as precise patch application, repository search or deterministic verification. The causal token benefit has not been measured for current Pi. | medium | Keep the default tool set small. Add tools only behind profiles and require an ablation showing net task-success or cost benefit. |
| E-PI-STATE | VERIFIED | Pi's append-only JSONL session tree supports custom extension entries that persist across reloads without entering the LLM context. | [PI-SESSION](https://github.com/earendil-works/pi/blob/dd6bea41efa8caa7a10fe5a6401676dc5699f83f/packages/coding-agent/src/core/session-manager.ts) [PI-DURABLE](https://github.com/earendil-works/pi/blob/dd6bea41efa8caa7a10fe5a6401676dc5699f83f/packages/agent/docs/durable-harness.md) | Tool implementations, provider clients and extension code remain host-runtime dependencies and are not serialized into the session. | high | Use Pi's session as conversational source of truth and store only references to large run artifacts externally. |
| E-OH-CONTROLLER | VERIFIED | OpenHands separates conversation/controller concerns from agent logic and workspace execution, and its local controller handles budgets, confirmation, stuck detection, callbacks, persistence and errors. | [OH-CONVERSATION](https://github.com/OpenHands/software-agent-sdk/blob/9dda2df6f5432c32861eb21e8d57df7e5525133d/openhands-sdk/openhands/sdk/conversation/impl/local_conversation.py) [OH-AGENT](https://github.com/OpenHands/software-agent-sdk/blob/9dda2df6f5432c32861eb21e8d57df7e5525133d/openhands-sdk/openhands/sdk/agent/agent.py) | The SDK is a substantially heavier Python stack and its assumptions should not become mandatory for a TypeScript Pi harness. | high | Adapt the control-plane boundaries, not the whole SDK dependency graph. |
| E-OH-SANDBOX | VERIFIED | OpenHands provides a Docker workspace that manages container lifecycle and exposes a remote workspace API through an agent-server process. | [OH-DOCKER](https://github.com/OpenHands/software-agent-sdk/blob/9dda2df6f5432c32861eb21e8d57df7e5525133d/openhands-workspace/openhands/workspace/docker/workspace.py) | A container with writable host mounts, broad network and forwarded secrets is not a complete security boundary. | high | Implement a narrow Runtime interface and initially run the entire unmodified Pi process inside the selected runtime. |
| E-PERMISSION | VERIFIED | Both OpenHands and Claude Code expose explicit confirmation/permission concepts rather than treating all tool calls uniformly. | [OH-POLICY](https://github.com/OpenHands/software-agent-sdk/blob/9dda2df6f5432c32861eb21e8d57df7e5525133d/openhands-sdk/openhands/sdk/security/confirmation_policy.py) [CLAUDE-PERMISSIONS](https://docs.anthropic.com/en/docs/claude-code/permissions) | Prompt-based permissions alone are not a security control; deterministic enforcement must occur before execution. | high | Add deterministic allow/ask/deny policy at Pi's tool_call hook and reinforce it with sandbox boundaries. |
| E-STUCK | VERIFIED | OpenHands implements deterministic stuck-pattern checks over recent events, including repeated action/observation, repeated errors, monologues and alternating loops. | [OH-STUCK](https://github.com/OpenHands/software-agent-sdk/blob/9dda2df6f5432c32861eb21e8d57df7e5525133d/openhands-sdk/openhands/sdk/conversation/stuck_detector.py) | Its source notes incomplete context-window-specific detection; pattern rules can also terminate legitimate repetitive workflows. | high | Adapt a small transparent detector with evidence in the trace, bounded recovery and user override. |
| E-CONTEXT | VERIFIED | Pi already supports compaction hooks and session-tree summaries; OpenHands adds a view/tombstone model that retains an append-only event history while exposing a condensed working view. | [PI-COMPACTION](https://github.com/earendil-works/pi/blob/dd6bea41efa8caa7a10fe5a6401676dc5699f83f/packages/coding-agent/docs/compaction.md) [PI-EXT](https://github.com/earendil-works/pi/blob/dd6bea41efa8caa7a10fe5a6401676dc5699f83f/packages/coding-agent/src/core/extensions/types.ts) [OH-CONDENSER](https://github.com/OpenHands/software-agent-sdk/blob/9dda2df6f5432c32861eb21e8d57df7e5525133d/openhands-sdk/openhands/sdk/context/condenser/README.md) | LLM-generated summaries can omit constraints and failed attempts; large-context models do not eliminate retrieval and salience problems. | high | Keep Pi compaction, add structured artifact/state references and compaction quality checks rather than a separate memory system. |
| E-VERIFY | VERIFIED | Agentless and modern coding benchmarks reinforce a localize/modify/validate workflow in which deterministic repository tests, not model self-assessment, decide success. | [AGENTLESS](https://github.com/OpenAutoCoder/Agentless) [GITTASK](https://arxiv.org/html/2508.18993) [TUA](https://arxiv.org/html/2606.28480) [AA-METHOD](https://artificialanalysis.ai/methodology/coding-agents-benchmarking) | Many repositories have incomplete, flaky or expensive tests; frontend and design tasks often need additional visual evaluation. | high | Make verifier profiles first-class and allow bounded repair, while recording test coverage and unresolved human review. |
| E-MULTIAGENT | INFERRED | Subagents are most defensible when they provide isolation or parallelism for decomposable work, not as a universal default. | [OMP](https://github.com/can1357/oh-my-pi) [GROK-GOAL](https://github.com/xai-org/grok-build/blob/3af4d5d39897855bdcc74f23e690024a5dc05573/crates/codegen/xai-grok-shell/src/session/goal_orchestrator.rs) [GPT56-LAUNCH](https://openai.com/index/gpt-5-6/) [AHE](https://arxiv.org/abs/2604.25850) | Additional workers can increase context duplication, merge conflicts, token cost and supervision burden; controlled coding-specific evidence for Pi subagents is absent. | medium | Defer to Phase 5, use separate worktrees/containers, typed results, bounded concurrency and parent verification. |
| E-HARNESS-SENSITIVITY | VERIFIED | Harness choice materially changes outcomes for a fixed model, and ranking can reverse by model and task family. | [HB-PAPER](https://arxiv.org/html/2605.27922) [TUA](https://arxiv.org/html/2606.28480) [OH-INDEX](https://github.com/OpenHands/openhands-index-results) [AA-LB](https://artificialanalysis.ai/agents/coding-agents) | Several studies are single-run, owner-operated or use different harness versions, so effect sizes are not universally portable. | high for existence of harness effects; medium for any specific ranking | Evaluate stock Pi, pi-void and OpenHands with exact same models, limits, images and repeated trials. |
| E-HB-LIMIT | VERIFIED | Harness-Bench v1 is a broad agent-runtime benchmark, not a coding-harness selector: 22 of 106 tasks are software engineering and 7 are SRE/DevOps, with one trajectory per task-model-harness cell. | [HB-PAPER](https://arxiv.org/html/2605.27922) | Its full-factorial six-harness by eight-model design is unusually useful for measuring broad harness sensitivity. | high | Use it as an architecture signal and smoke suite, not the primary pi-void acceptance benchmark. |
| E-NANOBOT | VERIFIED | NanoBot's 76.2 Harness-Bench v1 aggregate is the best configurable-harness point estimate in that paper; Codex's separate model-bound reference is 80.4. | [HB-PAPER](https://arxiv.org/html/2605.27922) | The benchmark is mostly non-coding and each factorial cell is single-run; the repository has since changed to a 2.0 task/adaptor layout. | high for the reported paper values; low for selecting pi-void architecture | Do not imitate NanoBot simply because of the aggregate. Extract only mechanisms supported by code and task-specific ablations. |
| E-PI-LOCAL | VERIFIED | Pi leads the audited independent local-model harness experiment at 123/160, with Qwen Code at 120/160, and Pi plus Qwen3.6-27B Q4 is the only 16/16 cell. | [LOCAL-WIP](https://www.neuralnoise.com/2026/harness-bench-wip/) | The experiment has 16 private tasks, one machine, one run per cell, no confidence intervals and some contaminated OpenCode cells where the grader was accessible. | low-to-medium | Treat Pi's local-model position as promising, not conclusive. Reproduce on public, hidden and repeated tasks. |
| E-CURRENT-GPT56 | VERIFIED | The current Artificial Analysis Coding Agent Index v1.2 reports Codex plus GPT-5.6 Sol max at index 61 over 321 tasks with three repeats per task; its component scores are DeepSWE 69%, Terminal-Bench v2 88% and SWE-Atlas-QnA 27%. | [AA-METHOD](https://artificialanalysis.ai/methodology/coding-agents-benchmarking) [AA-CODEX](https://artificialanalysis.ai/agents/coding-agents/comparisons/codex-vs-opencode) [GPT56-MODEL](https://developers.openai.com/api/docs/models/gpt-5.6-sol) | Artificial Analysis does not publish raw task attempts or an exact harness-version ledger, and this combines a model with its native harness. | medium-high for the aggregate; low for attributing the score to the model or harness alone | Include GPT-5.6 Sol in pi-void evaluation but never compare its Codex score directly to a different-model Pi score. |
| E-AA-VERSION-DRIFT | VERIFIED | The GPT-5.6 launch article's coding index value of 80 used Artificial Analysis v1.1; the current v1.2 score is 61 after the index composition/scoring changed. | [AA-GPT56-ARTICLE](https://artificialanalysis.ai/articles/gpt-5-6-has-landed) [AA-METHOD](https://artificialanalysis.ai/methodology/coding-agents-benchmarking) [AA-CODEX](https://artificialanalysis.ai/agents/coding-agents/comparisons/codex-vs-opencode) | This is not evidence that GPT-5.6 or Codex regressed; the scales are not directly comparable. | high | Store benchmark version and scoring definition beside every result. |
| E-FRONTIER-PAIR | VERIFIED | In the current v1.2 aggregate, Codex plus GPT-5.6 Sol max scores 61 and Claude Code plus Fable 5 max with fallback scores 59; cost and runtime also differ materially. | [AA-CLAUDE-CODEX](https://artificialanalysis.ai/agents/coding-agents/comparisons/claude-code-vs-codex) [FABLE](https://www.anthropic.com/claude/fable) [GPT56-MODEL](https://developers.openai.com/api/docs/models/gpt-5.6-sol) | Models and harnesses both differ, and Fable's safety fallback means not every attempt necessarily stays on the named model. | medium | Use those systems as frontier ceiling references, not controlled harness evidence. |
| E-SELF-EVOLUTION | VERIFIED | Recent harness-optimization research is mixed: improvements can transfer, but optimizer composition and adaptive evolution require explicit regression control and often generalize weakly. | [AHE](https://arxiv.org/abs/2604.25850) [SELF-HARNESS](https://arxiv.org/abs/2606.09498) [COMPOUND](https://arxiv.org/abs/2607.14004) [RETHINK-EVAL](https://arxiv.org/abs/2607.12227) [MEMOHARNESS](https://arxiv.org/abs/2607.14159) | Some papers report meaningful gains under their tested conditions. | medium | Do not build a self-modifying pi-void harness before a stable evaluation and regression-control pipeline exists. |

### 5.1 Planning versus reactive execution

**[INFERRED]** Planning helps when tasks have dependencies, risky mutations or expensive validation, but an always-on planner duplicates context and can lock the agent into an incorrect decomposition. Implement a **read-only plan profile** and an **autonomous goal-state profile**, not a second mandatory planner in the core loop. Small edits should remain reactive.

### 5.2 Context selection and compression

**[PROPOSED]** Context should have four layers: immutable trusted policy; user/project instructions with provenance; selected repository evidence; and recent trajectory. Operational state, full traces and large artifacts remain outside the model context and enter only by compact references. Compaction must preserve task constraints, current plan/state, changed files, failing tests, decisions, rejected approaches and unresolved risks. A summary that cannot name these fields fails its quality check.

### 5.3 Verification and self-reflection

**[VERIFIED]** Deterministic verification has stronger evidentiary status than free-form self-reflection. Self-review can propose checks, but task success must be assigned by versioned tests, static checks, visual artifacts or an explicit human-review requirement. Reflection without new evidence should not consume an unbounded turn.

### 5.4 Model-specific harness adaptation

**[PROPOSED]** Keep model adaptation declarative and versioned: tool-call parser, schema subset, parallelism, reasoning preservation, max tool-result size, edit format and fallback behavior. For unreliable tool callers, use sequential tools, simpler schemas or a bash-only compatibility profile. Do not fork the central loop per model family.

## 6. Feature extraction and build decisions

| Source project | Feature | User benefit | Architectural mechanism | Decision | License status | Implementation cost | Maintenance cost |
| --- | --- | --- | --- | --- | --- | --- | --- |
| Pi [PI-REPO](https://github.com/earendil-works/pi) [PI-EXT](https://github.com/earendil-works/pi/blob/dd6bea41efa8caa7a10fe5a6401676dc5699f83f/packages/coding-agent/src/core/extensions/types.ts) | small default tool set and concise dynamic prompt | fast interaction and lower schema/action burden | four core coding tools plus prompt sections built only from active resources | adopt unchanged | MIT; direct upstream dependency | none | low |
| Pi [PI-REPO](https://github.com/earendil-works/pi) [PI-EXT](https://github.com/earendil-works/pi/blob/dd6bea41efa8caa7a10fe5a6401676dc5699f83f/packages/coding-agent/src/core/extensions/types.ts) | provider registry and custom providers | multi-provider and local-model flexibility | provider/model registry and extension registration API | adopt unchanged | MIT | none | low |
| Pi [PI-REPO](https://github.com/earendil-works/pi) [PI-EXT](https://github.com/earendil-works/pi/blob/dd6bea41efa8caa7a10fe5a6401676dc5699f83f/packages/coding-agent/src/core/extensions/types.ts) | append-only session tree | inspectable history, forks, compaction and extension state | JSONL entries with parent IDs, custom entries and summaries | adopt unchanged | MIT | none | low |
| Pi [PI-REPO](https://github.com/earendil-works/pi) [PI-EXT](https://github.com/earendil-works/pi/blob/dd6bea41efa8caa7a10fe5a6401676dc5699f83f/packages/coding-agent/src/core/extensions/types.ts) | typed lifecycle and tool hooks | customization without core fork | ExtensionAPI subscriptions and tool/result interception | adopt unchanged | MIT | low | low |
| OpenHands [OH-SDK](https://github.com/OpenHands/software-agent-sdk) | controller/workspace separation | clean lifecycle and isolation boundary | Conversation controller coordinates an Agent and Workspace | adapt | MIT; behavioral adaptation preferred | medium | medium |
| OpenHands [OH-SDK](https://github.com/OpenHands/software-agent-sdk) | confirmation policy | explicit risky-action approval | always/never/risk-threshold policy classes | adapt | MIT | low | low |
| OpenHands [OH-SDK](https://github.com/OpenHands/software-agent-sdk) | stuck detector | bounded loops and clearer failures | transparent recent-event pattern checks | adapt | MIT | low | low |
| OpenHands [OH-SDK](https://github.com/OpenHands/software-agent-sdk) | condensed working view over append-only history | longer productive sessions without deleting evidence | condenser marks hidden events and emits summary | adapt narrowly | MIT | medium | medium |
| OpenHands [OH-SDK](https://github.com/OpenHands/software-agent-sdk) | full SDK and plugin stack as a mandatory dependency | large capability surface | Python packages, LiteLLM, MCP, telemetry, remote workspace | reject as default | MIT but architecture/language mismatch | high | high |
| Claude Code [CLAUDE-PERMISSIONS](https://docs.anthropic.com/en/docs/claude-code/permissions) [CLAUDE-HOOKS](https://docs.anthropic.com/en/docs/claude-code/hooks) | permission modes and ordered rules | predictable interactive safety | mode presets and deny/ask/allow evaluation | behaviorally adapt | proprietary; no source reuse | low-to-medium | low |
| Claude Code [CLAUDE-PERMISSIONS](https://docs.anthropic.com/en/docs/claude-code/permissions) [CLAUDE-HOOKS](https://docs.anthropic.com/en/docs/claude-code/hooks) | hooks, project instructions, skills and subagents | deep workflow customization | documented lifecycle hooks and scoped instruction resources | adapt only where Pi lacks behavior | proprietary; public behavior only | medium | medium |
| Claude Code [CLAUDE-PERMISSIONS](https://docs.anthropic.com/en/docs/claude-code/permissions) [CLAUDE-HOOKS](https://docs.anthropic.com/en/docs/claude-code/hooks) | plan/execution separation | review before mutation | read-only planning mode followed by explicit execution | adapt as profile | proprietary behavior | low | low |
| Codex [CODEX](https://github.com/openai/codex) | sandbox and approval policy | safer autonomous terminal execution | native sandbox policies plus approval decisions | behaviorally adapt | Apache-2.0; prefer independent implementation | medium | medium |
| Codex [CODEX](https://github.com/openai/codex) | apply-patch, review and worktree workflows | structured changes and isolated parallel attempts | patch-oriented tools, review modes and branch/worktree support | adapt selectively | Apache-2.0 | medium | medium |
| Codex [CODEX](https://github.com/openai/codex) | app-server/headless resumability | CI and external orchestrator integration | separate server protocol and durable state | adapt in Phase 6 | Apache-2.0 | high | medium |
| OpenCode [OPENCODE](https://github.com/anomalyco/opencode) | client/server separation and persistent sessions | multiple interfaces over one execution service | server-backed sessions with TUI/client surfaces | adapt later for remote UI | MIT | medium | medium |
| OpenCode [OPENCODE](https://github.com/anomalyco/opencode) | build versus plan roles | clear mutation boundary | role profiles with different tool access | adapt | MIT | low | low |
| OpenCode [OPENCODE](https://github.com/anomalyco/opencode) | second provider abstraction | none over current Pi for pi-void | independent LLM provider layer | reject | MIT | high | high |
| OhMyPi [OMP](https://github.com/can1357/oh-my-pi) | Hashline-style stable edit targeting | fewer ambiguous line edits | content-derived line anchors included in read/edit flow | prototype and benchmark | MIT; retain OMP/Pi notices if code reused | medium | medium |
| OhMyPi [OMP](https://github.com/can1357/oh-my-pi) | LSP/DAP and large built-in tool surface | semantic navigation and debugging | language/debug protocol integration plus many tools | defer to profiles | MIT | high | high |
| OhMyPi [OMP](https://github.com/can1357/oh-my-pi) | worktree-isolated subagents | parallel attempts without direct file races | child sessions in separate Git worktrees with typed results | adapt in Phase 5 | MIT | high | medium-high |
| OhMyPi [OMP](https://github.com/can1357/oh-my-pi) | whole-fork feature expansion | rapid integrated capability | large divergence from upstream Pi | reject | MIT but provenance/merge burden | very high | very high |
| Grok Build [GROK-BUILD](https://github.com/xai-org/grok-build) [GROK-GOAL](https://github.com/xai-org/grok-build/blob/3af4d5d39897855bdcc74f23e690024a5dc05573/crates/codegen/xai-grok-shell/src/session/goal_orchestrator.rs) | explicit long-running goal state | inspectable pause/backoff/no-progress/budget outcomes | goal orchestrator state machine and accounting | behaviorally adapt in autonomous mode | Apache-2.0 | medium | medium |
| Grok Build [GROK-BUILD](https://github.com/xai-org/grok-build) [GROK-GOAL](https://github.com/xai-org/grok-build/blob/3af4d5d39897855bdcc74f23e690024a5dc05573/crates/codegen/xai-grok-shell/src/session/goal_orchestrator.rs) | planner/worker/verifier accounting | bounded autonomy and resource visibility | separate token/time/worker/verification budgets | adapt later | Apache-2.0 | medium-high | medium |
| mini-SWE-agent [MINISWE](https://github.com/SWE-agent/mini-swe-agent) [MINISWE-LOOP](https://github.com/SWE-agent/mini-swe-agent/blob/38c01a19ed1a58dd17dd7c95010e4f69d059c777/src/minisweagent/agents/default.py) | minimal linear loop with explicit limits | inspectability, portability and predictable failure | query, execute actions, append observations, save trajectory | adopt as evaluation baseline and design constraint | MIT | none | low |
| SWE-agent [SWEAGENT](https://arxiv.org/abs/2405.15793) | agent-computer interface feedback | less tool misuse and faster error correction | concise file views/search, lint-on-edit and explicit empty/error feedback | adapt selected feedback | MIT | medium | medium |
| Agentless [AGENTLESS](https://github.com/OpenAutoCoder/Agentless) | localization, repair candidates and validation | structured repository repair without open-ended wandering | separate stages and deterministic patch validation/reranking | adapt as optional bug-fix profile | MIT | medium | medium |
| Harness-evolution research [AHE](https://arxiv.org/abs/2604.25850) [SELF-HARNESS](https://arxiv.org/abs/2606.09498) [COMPOUND](https://arxiv.org/abs/2607.14004) [RETHINK-EVAL](https://arxiv.org/abs/2607.12227) | self-modifying or automatically optimized harness | potential benchmark gains | search/optimization over prompts, tools or middleware | reject before evaluation maturity | paper-dependent | very high | very high |

### 6.1 OpenHands capability-by-capability decision

| Capability | Decision | Evidence | Value | Complexity | Effect on Pi loop | Notes |
| --- | --- | --- | --- | --- | --- | --- |
| Docker or stronger sandbox isolation | adapt | [OH-DOCKER](https://github.com/OpenHands/software-agent-sdk/blob/9dda2df6f5432c32861eb21e8d57df7e5525133d/openhands-workspace/openhands/workspace/docker/workspace.py); [PI-CONTAINER](https://github.com/earendil-works/pi/blob/dd6bea41efa8caa7a10fe5a6401676dc5699f83f/packages/coding-agent/docs/containerization.md); [PI-SECURITY](https://github.com/earendil-works/pi/blob/dd6bea41efa8caa7a10fe5a6401676dc5699f83f/packages/coding-agent/docs/security.md) | contains filesystem/process/network damage and makes unattended execution defensible | medium | none when the whole stock Pi process runs inside the runtime | Default trusted mode stays host-local; isolated mode is opt-in initially and required for untrusted/headless tasks. |
| Event-stream architecture | adopt semantics | [PI-EXT](https://github.com/earendil-works/pi/blob/dd6bea41efa8caa7a10fe5a6401676dc5699f83f/packages/coding-agent/src/core/extensions/types.ts); [OH-CONVERSATION](https://github.com/OpenHands/software-agent-sdk/blob/9dda2df6f5432c32861eb21e8d57df7e5525133d/openhands-sdk/openhands/sdk/conversation/impl/local_conversation.py) | ordered traces, observability, replay and deterministic state transitions | low-to-medium | none; subscribe to existing Pi events | Define a stable pi-void event schema rather than copying the OpenHands event classes. |
| Workspace abstraction | adapt | [OH-DOCKER](https://github.com/OpenHands/software-agent-sdk/blob/9dda2df6f5432c32861eb21e8d57df7e5525133d/openhands-workspace/openhands/workspace/docker/workspace.py) | host, Docker, OpenShell and future remote runtimes behind one narrow contract | medium | none in whole-process mode | Avoid exposing a large remote-filesystem API until required. |
| Agent-controller separation | adapt | [OH-CONVERSATION](https://github.com/OpenHands/software-agent-sdk/blob/9dda2df6f5432c32861eb21e8d57df7e5525133d/openhands-sdk/openhands/sdk/conversation/impl/local_conversation.py); [PI-HARNESS](https://github.com/earendil-works/pi/blob/dd6bea41efa8caa7a10fe5a6401676dc5699f83f/packages/agent/docs/agent-harness.md) | Pi remains reasoning/execution driver while a host supervisor owns lifecycle, sandbox and artifacts | medium | none | The controller must not replan or edit concurrently with Pi. |
| Task-state persistence | adapt | [PI-SESSION](https://github.com/earendil-works/pi/blob/dd6bea41efa8caa7a10fe5a6401676dc5699f83f/packages/coding-agent/src/core/session-manager.ts); [PI-DURABLE](https://github.com/earendil-works/pi/blob/dd6bea41efa8caa7a10fe5a6401676dc5699f83f/packages/agent/docs/durable-harness.md); [OH-CONVERSATION](https://github.com/OpenHands/software-agent-sdk/blob/9dda2df6f5432c32861eb21e8d57df7e5525133d/openhands-sdk/openhands/sdk/conversation/impl/local_conversation.py) | crash recovery and long-running work | medium | none | Pi JSONL remains conversation truth; operational run state is append-only files referenced by custom entries. |
| Context condensation | adapt narrowly | [PI-COMPACTION](https://github.com/earendil-works/pi/blob/dd6bea41efa8caa7a10fe5a6401676dc5699f83f/packages/coding-agent/docs/compaction.md); [OH-CONDENSER](https://github.com/OpenHands/software-agent-sdk/blob/9dda2df6f5432c32861eb21e8d57df7e5525133d/openhands-sdk/openhands/sdk/context/condenser/README.md) | retain recent interactions while preserving structured facts and artifact references | medium | uses existing compaction hooks | Do not replace Pi compaction with a second memory engine. |
| Stuck detection | adapt | [OH-STUCK](https://github.com/OpenHands/software-agent-sdk/blob/9dda2df6f5432c32861eb21e8d57df7e5525133d/openhands-sdk/openhands/sdk/conversation/stuck_detector.py) | prevents repetitive tool/error loops and unbounded spend | low | observation-only until a bounded recovery message or stop | Every detector firing must include the exact matched pattern in trace. |
| Retry and recovery policies | adapt | [PI-DURABLE](https://github.com/earendil-works/pi/blob/dd6bea41efa8caa7a10fe5a6401676dc5699f83f/packages/agent/docs/durable-harness.md); [OH-CONVERSATION](https://github.com/OpenHands/software-agent-sdk/blob/9dda2df6f5432c32861eb21e8d57df7e5525133d/openhands-sdk/openhands/sdk/conversation/impl/local_conversation.py) | separates transient provider errors from tool failures and no-progress states | medium | external retry coordinator plus one controlled repair turn | Never blindly replay a non-idempotent tool call. |
| Browser integration | defer | OpenHands platform behavior; no coding-specific causal evidence | frontend/web research tasks | high | adds schemas, security surface and multimodal state | Add only as a profile with isolated browser and domain allowlists. |
| Delegation and subagents | defer to Phase 5 | [OMP](https://github.com/can1357/oh-my-pi); [GROK-GOAL](https://github.com/xai-org/grok-build/blob/3af4d5d39897855bdcc74f23e690024a5dc05573/crates/codegen/xai-grok-shell/src/session/goal_orchestrator.rs); [GPT56-LAUNCH](https://openai.com/index/gpt-5-6/) | parallelizable work and specialist isolation | high | external child Pi sessions; parent remains authoritative | Separate worktree/container per worker; no shared write workspace. |
| Evaluation, traces and replay | adopt | [OH-INDEX](https://github.com/OpenHands/openhands-index-results); [MINISWE-LOOP](https://github.com/SWE-agent/mini-swe-agent/blob/38c01a19ed1a58dd17dd7c95010e4f69d059c777/src/minisweagent/agents/default.py); [AHE](https://arxiv.org/abs/2604.25850) | source-audited regressions, cost accounting and debuggability | medium | event subscribers only | Deterministic replay is exact only for captured model responses and pure/idempotent tools. |
| Headless issue-to-PR workflow | adapt in Phase 6 | OpenHands platform; [CODEX](https://github.com/openai/codex); [PI-HARNESS](https://github.com/earendil-works/pi/blob/dd6bea41efa8caa7a10fe5a6401676dc5699f83f/packages/agent/docs/agent-harness.md) | CI and autonomous maintenance | high | use Pi RPC/JSON/headless modes | No automatic merge. PR output must include tests, trace, risk and unresolved items. |

## 7. Three competing architectures

### 7.1 Option 1 - Minimal Extension

```text
User -> stock Pi process
           |
           +-- pi-void extension
               +-- policy hook
               +-- trace/cost ledger
               +-- Git snapshot
               +-- final verifier

Optional launcher -> whole Pi process inside Docker
```

| Dimension | Minimal Extension |
| --- | --- |
| Execution flow | Pi receives request, runs its normal loop, extension gates tools and verifies on settled event |
| Trust boundary | Host Pi is privileged unless optional whole-process container is selected |
| State model | Pi session plus run artifact directory |
| Extension points | tool_call, tool_result, provider hooks, context, agent_settled, appendEntry |
| New dependencies | prefer Node standard library and existing Pi dependencies; Docker CLI optional |
| Pi files changed | none |
| Files outside upstream | protocol, extension, repo utilities, eval runner |
| Conflict risk | very low |
| Effort | small-to-medium |
| Runtime overhead | low, plus verifier cost |
| Model compatibility | highest; Pi native |
| Security | moderate on host, high only when container mode is used correctly |
| Expected benchmark strengths | interactive speed, local models, simple coding tasks |
| Expected weaknesses | less durable autonomy and weaker remote/multi-worker lifecycle |
| Rejected complexity | scheduler, browser, multi-agent, remote workspace server |

### 7.2 Option 2 - Balanced Hybrid - recommended

```text
                         trusted host
+-----------------------------------------------------------+
| pi-void CLI / supervisor                                  |
|  - run state and locks                                    |
|  - runtime selection                                      |
|  - secret/network policy                                  |
|  - artifact collection                                    |
+----------------------+------------------------------------+
                       | launch / observe
             +---------v------------------+
             | host or isolated runtime   |
             |  +----------------------+  |
             |  | unmodified Pi        |  |
             |  | - provider/model     |  |
             |  | - prompt/tools/loop  |  |
             |  | - session/compaction |  |
             |  +----------+-----------+  |
             |             | Pi events     |
             |  +----------v-----------+  |
             |  | pi-void extension    |  |
             |  | policy/trace/context |  |
             |  | recovery/verification|  |
             |  +----------------------+  |
             +--------------+-------------+
                            |
                      Git worktree + tests
```

| Dimension | Balanced Hybrid |
| --- | --- |
| Execution flow | Supervisor prepares run/worktree/runtime; Pi remains sole agent driver; extension emits policy/trace/recovery/verification events; supervisor collects artifacts |
| Trust boundary | Host supervisor trusted; model/repo/tools run in optional container; untrusted/headless mode requires isolation |
| State model | Pi JSONL conversation plus external append-only operational run journal and Git/artifact hashes |
| Extension points | all Minimal Extension seams plus runtime lifecycle, recovery, context and optional child-process API |
| New dependencies | none mandatory beyond current Node/Pi; Docker/OpenShell adapters optional; JSON Schema validator may use existing dependency if available |
| Pi files changed | none under current audited API |
| Files outside upstream | all pi-void packages and schemas; temporary patches directory normally empty |
| Conflict risk | low |
| Effort | medium-to-large |
| Runtime overhead | near-stock in trusted mode; container startup, trace I/O and verification in autonomous mode |
| Model compatibility | high; uses Pi provider layer; weak-model profiles are declarative |
| Security | high when isolation, network and secret controls are enabled; moderate in host mode |
| Expected benchmark strengths | repo bug fixing, testing, terminal/DevOps, long tasks, local-model flexibility and debuggability |
| Expected weaknesses | not as turnkey as a full cloud scheduler; frontend browser/visual tooling remains optional |
| Rejected complexity | mandatory Python/OpenHands stack, always-on workers, central database, automatic PR merge |

### 7.3 Option 3 - Full Autonomous Runtime

```text
API/UI -> scheduler -> planner -> worker pool -> sandbox fleet
                     |              |
                     +-> memory DB  +-> worktrees/browser/MCP
                     +-> verifier/reviewer -> PR automation
```

| Dimension | Full Autonomous Runtime |
| --- | --- |
| Execution flow | Durable scheduler decomposes jobs, allocates multiple workers, merges candidates, verifies and prepares PRs |
| Trust boundary | Strong sandbox fleet, but much larger control-plane and plugin attack surface |
| State model | Job database, event bus, worker leases, artifact store and Pi sessions |
| Extension points | Pi plus scheduler/browser/MCP/remote runtime APIs |
| New dependencies | scheduler/store/queue/browser/MCP/remote runtime components |
| Pi files changed | possibly none, but integration pressure creates future fork risk |
| Files outside upstream | large service tree |
| Conflict risk | medium-to-high architectural drift |
| Effort | very large |
| Runtime overhead | high even for small tasks |
| Model compatibility | medium-high but orchestration prompts may penalize smaller models |
| Security | strong isolation potential; difficult system-level security |
| Expected benchmark strengths | long-horizon and decomposable multi-worker tasks |
| Expected weaknesses | latency, tokens, merge conflicts, debugging and upstream maintainability |
| Rejected complexity | this option itself is rejected as default |

### 7.4 Weighted decision matrix

| Architecture | coding reliability (25%) | upstream maintainability (20%) | security isolation (15%) | model provider flexibility (10%) | token runtime efficiency (10%) | debuggability (10%) | implementation complexity (5%) | ux (5%) | Weighted score | Decision |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Minimal Extension | 6.8 | 9.5 | 5.5 | 9.5 | 9.2 | 8.5 | 9.0 | 8.0 | 7.995 | retain as safe mode and initial implementation slice, but not the final autonomous architecture |
| Balanced Hybrid | 8.6 | 8.3 | 8.7 | 9.3 | 8.2 | 9.0 | 7.0 | 8.5 | 8.540 | recommended default architecture |
| Full Autonomous Runtime | 8.8 | 5.2 | 9.0 | 8.3 | 5.5 | 6.5 | 3.5 | 7.8 | 7.185 | defer; build only as opt-in services after evidence shows demand |

**[PROPOSED]** Scores use 0-10 where higher is better; for implementation complexity, a higher score means lower complexity. The Balanced Hybrid wins at **8.540**, versus 7.995 for Minimal Extension and 7.185 for Full Autonomous. The result is robust to modest weight changes because Balanced Hybrid is the only option without a major failure on reliability, maintainability or security.

## 8. Recommended architecture in operational detail

### 8.1 Request-to-result sequence

```text
1. User/CI submits task and selects profile.
2. Supervisor resolves exact Pi/pi-void/model/provider/runtime versions.
3. Supervisor creates run ID, worktree, baseline Git/test snapshot and policy.
4. For isolated mode, supervisor launches whole unmodified Pi inside runtime.
5. Pi assembles its normal prompt/tools and starts the agent loop.
6. pi-void extension records events and evaluates every tool intent deterministically.
7. Allowed tools execute; denied/approval-required actions return typed evidence.
8. Context extension keeps operational state outside prompt and injects only selected facts.
9. Recovery classifies transient provider, malformed tool, repeated error, no-progress or budget failure.
10. On settled state, versioned verifier runs in the same runtime/worktree.
11. If verifier fails and repair budget is one, extension sends one evidence-bearing repair message.
12. Final verifier decides pass/fail; supervisor writes artifact hashes, diff, trace, cost, risks and human-review requirement.
13. External side effects such as PR creation require a separate approved, idempotent action.
```

### 8.2 Trust boundaries

| Principal/zone | Trust | Allowed responsibility | Must not control |
| --- | --- | --- | --- |
| Host supervisor | trusted code | runtime lifecycle, locks, policy config, artifact collection, secret brokering | model planning or concurrent repository edits |
| Pi process | trusted harness, untrusted model decisions | prompt, provider, tools, loop, session and compaction | host resources outside policy/runtime |
| LLM | untrusted decision source | propose tool calls, edits and explanations | policy, credentials, final success assignment |
| Repository/task content | untrusted data | evidence and project instructions with provenance | system policy or extension loading without trust |
| Sandbox/worktree | partially trusted disposable environment | execute tools/tests and hold task state | broad host mounts, Docker socket or undeclared secrets |
| Verifier | trusted versioned code within threat limits | assign machine success and regression result | silent network or undeclared mutations |
| Subagent | untrusted worker | return typed patch/evidence from isolated worktree | merge, parent credentials or shared write tree |

### 8.3 Permission flow

```text
tool intent
  -> normalize paths/command
  -> immutable deny rules
  -> sandbox capability check
  -> configured allow/ask/deny rule
  -> interactive approval or headless policy
  -> execute with timeout/quota/idempotency context
  -> redact/record result
```

**[PROPOSED]** Rule precedence is **deny -> ask -> allow**. Unknown risky actions are `ask` in interactive mode and `deny` in unattended mode. Model text cannot change the policy. The sandbox independently limits damage even after an erroneous allow.

### 8.4 Context lifecycle

1. Trusted system policy and tool definitions come from pinned Pi/pi-void code, never repository text.
2. User and project instructions are loaded with source path/hash and trust label.
3. Repository evidence is selected on demand; maps/indexes are caches, not authority.
4. Tool outputs are capped and large outputs become artifacts with summaries and hashes.
5. Pi native compaction remains authoritative. pi-void's compaction hook supplies a structured state block and validates retained constraints.
6. Full traces, costs, policy decisions and verifier logs remain external and are referenced by a Pi `CustomEntry`, so they do not inflate normal context.

### 8.5 Recovery loop

| Failure class | Automatic action | Budget | Safety condition |
| --- | --- | --- | --- |
| Provider transient: 429/5xx/network | bounded exponential retry with jitter | profile-configured small count | no tool replay; preserve request id and response metadata |
| Malformed tool arguments | return precise schema error; one model correction | one per call | do not guess destructive arguments |
| Tool execution failure | surface exit/status and relevant capped output | agent decides; stuck detector observes | non-idempotent actions are never auto-replayed |
| Repeated action/error or no progress | emit matched pattern; request one strategy change or stop | one recovery message | user can override interactively |
| Context overflow | Pi compaction plus structured state validation | native/one retry | aborted non-idempotent tool is not rerun |
| Verifier failure | one evidence-bearing repair turn | 0 or 1 | same worktree; final verifier remains authoritative |
| Crash/interruption | resume from last durable session/run boundary | one job lease | external side effects use idempotency journal |

### 8.6 Verification loop

```text
baseline tests/snapshot -> agent changes -> changed-file risk scan
        -> lint/type/unit/integration/profile checks
        -> compare baseline/final regressions
        -> optional one repair -> rerun affected + required full checks
        -> pass | fail | human-review-required
```

**[PROPOSED]** Verifier profiles are repository-local configuration interpreted by trusted pi-void code. Discovery may suggest commands, but running a newly discovered package script is itself policy-controlled because repository scripts are untrusted executable content.

### 8.7 Subagent rules

- Disabled by default; enabled only for tasks classified as decomposable.
- Proposed default maximum: two concurrent child workers; every increase requires an explicit budget profile.
- One worktree and sandbox per worker. No concurrent writes to the same checkout.
- Child receives a bounded task, selected context and no parent secret set by default.
- Child returns a typed manifest: base commit, patch/diff hash, commands/tests, costs, unresolved risks and evidence paths.
- Parent chooses, applies and verifies. No worker can merge or push.

### 8.8 Provider and model routing

**[PROPOSED]** Reuse Pi's provider registry. A pi-void `ModelProfile` may specify tool-call capability, parser, sequential/parallel mode, maximum tool-result size, context budget, reasoning preservation and local-serving details. Automatic cross-provider fallback is off by default because it breaks reproducibility and may change data-retention/security terms. Interactive fallback requires consent and creates a model-change event.

### 8.9 Persistence model

```text
Pi session JSONL
  - messages, model changes, compaction, branch summaries
  - pi-void custom entry -> run/artifact reference

.pi-void/runs/<run-id>/
  run.json            exact versions/config/state
  events.jsonl        ordered normalized events
  policy.jsonl        intent and decision records
  verifier.jsonl      commands/results/repair link
  artifacts/          capped logs, screenshots, patches
  snapshots/          Git/workspace metadata, not duplicate repo blobs
```

**[PROPOSED]** No separate database is required through Phase 5. Phase 6 uses atomic filesystem job directories and locks first. A pluggable database becomes justified only for multi-host scheduling or query volume that the filesystem journal cannot support.

## 9. Concrete implementation plan

### Phase 0: Measurement baseline

**Smallest useful deliverable:** A no-behavior-change instrumentation extension and reproducible runner that measure stock Pi prompt/tool-schema tokens, context growth, turns, tool errors, model usage, wall time and final verifier status.

**Modules/files:**
- `packages/protocol/src/events.ts`
- `packages/protocol/src/run-record.ts`
- `packages/extension/src/instrumentation.ts`
- `packages/eval/src/run-matrix.ts`
- `schemas/run-record.schema.json`

**Upstream Pi files changed:** none

**Tests:**
- event ordering and schema validation
- usage/cost aggregation with missing telemetry
- trace redaction for configured secret patterns
- reproducibility manifest includes Pi commit, extension commit, model id, provider, sampling/effort, runtime image and task hash

**Benchmark:** 24-task pilot: four tasks from each of bug fixing, greenfield, testing, frontend, terminal/DevOps and long-running; three repeats per stock-Pi configuration.

**Exit criteria:**
- Every run produces valid run.json, events.jsonl, final artifact hash and verifier result.
- No statistically or practically meaningful task-success change versus Pi without instrumentation on the same configuration.
- Unattributed token/cost fields are null, never zero-filled.
- System-prompt and tool-schema token counts are recorded for each exact tokenizer/model route.

**Rollback:** Disable the extension package; no session migration or upstream patch is required.

**Upstream-sync risk:** very low

### Phase 1: Safe extension seams

**Smallest useful deliverable:** The @pi-void/safe-verify extension: deterministic tool policy, pre-run Git snapshot, structured traces, final verifier and at most one bounded repair turn.

**Modules/files:**
- `packages/extension/src/index.ts`
- `packages/extension/src/policy.ts`
- `packages/extension/src/tracing.ts`
- `packages/extension/src/verification.ts`
- `packages/repo/src/git-snapshot.ts`
- `packages/repo/src/verify-profile.ts`

**Upstream Pi files changed:** none

**Tests:**
- allow/ask/deny decisions for bash, write and edit
- path canonicalization and symlink-escape fixtures
- destructive Git and shell command fixtures
- one-repair latch survives session reload through appendEntry
- verifier output truncation preserves exit code and artifact path

**Benchmark:** Stock Pi versus safe-verify on the Phase 0 set, five repeats for high-variance tasks. Primary endpoint: verified success; guardrails: unsafe-action attempts, tool-error rate and median overhead.

**Exit criteria:**
- Zero upstream Pi source edits.
- All critical-risk fixtures are blocked or explicitly approved before execution.
- Every completed coding run has a deterministic verifier record or an explicit not-applicable reason.
- Median orchestration overhead excluding verifier commands is below the proposed 5% guardrail.
- No unbounded repair loop is possible.

**Rollback:** Remove the extension from the Pi package/config profile; run artifacts remain readable.

**Upstream-sync risk:** very low

### Phase 2: Sandbox and permissions

**Smallest useful deliverable:** A host launcher and Runtime contract with host and Docker adapters; isolated mode runs the entire unmodified Pi process in the sandbox with a task worktree, default-deny network and explicit secret forwarding.

**Modules/files:**
- `packages/runtime/src/runtime.ts`
- `packages/runtime/src/host.ts`
- `packages/runtime/src/docker.ts`
- `packages/cli/src/run.ts`
- `packages/protocol/src/policy.ts`

**Upstream Pi files changed:** none

**Tests:**
- filesystem write outside mounted workspace fails
- network deny and domain allowlist enforcement
- environment contains only declared variables
- container termination, timeout and cleanup
- host crash leaves resumable run metadata and no orphaned write lock

**Benchmark:** Host versus Docker runtime on identical stock Pi and pi-void tasks. Report success, startup cost, wall time, filesystem behavior and unsafe-action containment separately.

**Exit criteria:**
- Untrusted/headless profiles cannot execute on the host by configuration error.
- Secrets are not present in the sandbox unless explicitly requested for the run.
- Worktree and container IDs are recorded in run metadata.
- The same Pi package/commit and tool schemas run in host and isolated modes.

**Rollback:** Select runtime=host or uninstall the runtime package; no Pi state conversion.

**Upstream-sync risk:** very low

### Phase 3: Context and recovery

**Smallest useful deliverable:** Structured context-state entries, compaction quality checks, deterministic stuck detection and a bounded recovery classifier for transient provider, malformed tool, repeated-error and no-progress failures.

**Modules/files:**
- `packages/extension/src/context.ts`
- `packages/extension/src/recovery.ts`
- `packages/extension/src/stuck-detector.ts`
- `packages/protocol/src/run-state.ts`
- `packages/repo/src/artifact-index.ts`

**Upstream Pi files changed:** none

**Tests:**
- compaction preserves task constraints, changed-file list, failing tests and pending decisions
- stuck patterns have deterministic evidence and false-positive fixtures
- provider retry never replays a completed non-idempotent tool
- crash-resume begins only at a durable boundary
- weak-tool-calling profile falls back to simplified sequential tools or bash-only mode

**Benchmark:** Long-context and induced-failure suite: context-overflow, repeated bad edit, provider 429/5xx, malformed tool args, interrupted run and long repository investigation.

**Exit criteria:**
- Every automatic recovery has a typed cause, attempt number and budget.
- No hidden prompt mutation: injected context entries and compaction summaries are traceable.
- Recovery improves verified success or reduces wasted turns without increasing regression rate beyond the predeclared guardrail.

**Rollback:** Disable context/recovery features independently; Pi native compaction/session remains valid.

**Upstream-sync risk:** low

### Phase 4: Verification and repository intelligence

**Smallest useful deliverable:** Language-aware verifier profiles, bounded repository map/localization, changed-file risk analysis and frontend artifact capture where supported.

**Modules/files:**
- `packages/repo/src/context-selector.ts`
- `packages/repo/src/repo-map.ts`
- `packages/repo/src/risk.ts`
- `packages/repo/src/verifiers/*.ts`
- `packages/extension/src/verification.ts`

**Upstream Pi files changed:** none

**Tests:**
- repository map invalidation on file change
- test command discovery does not execute untrusted scripts without policy
- lint/type/test result normalization
- regression checks compare baseline and final state
- frontend screenshot/DOM artifacts are associated with exact build commit

**Benchmark:** Public bug-fix and greenfield tasks plus hidden repository tasks. Ablate repository map, verifier, risk analysis and bounded repair separately.

**Exit criteria:**
- Verifier profiles are deterministic and versioned.
- A task cannot be called successful solely from the model's final text.
- Repository intelligence must demonstrate a net verified-success or review-burden gain after token/runtime cost.

**Rollback:** Disable individual repo-intelligence modules; verifier-only mode remains.

**Upstream-sync risk:** low

### Phase 5: Optional delegation and parallelism

**Smallest useful deliverable:** A parent Pi session can spawn one or two bounded child Pi workers in separate worktrees/containers and receive typed result manifests; no automatic merge.

**Modules/files:**
- `packages/extension/src/delegation.ts`
- `packages/runtime/src/worker-pool.ts`
- `packages/repo/src/worktree.ts`
- `packages/protocol/src/delegation.ts`

**Upstream Pi files changed:** none

**Tests:**
- workers cannot write another worker's worktree
- budget and timeout enforcement
- typed result validation and malicious-result fixtures
- conflict detection and deterministic merge refusal
- parent verification after selected patch application

**Benchmark:** Decomposable versus non-decomposable tasks, single-agent versus two-worker variants, with total-token and human-review accounting.

**Exit criteria:**
- Delegation is disabled by default.
- Parallelism produces a statistically credible benefit on the predeclared decomposable subset after total cost.
- No worker output is trusted without parent-side verification.

**Rollback:** Disable delegation profile; child sessions remain ordinary Pi session artifacts.

**Upstream-sync risk:** low-to-medium

### Phase 6: Headless automation

**Smallest useful deliverable:** A filesystem-journaled job runner for issue-to-patch/PR preparation with resume, cancellation, approval checkpoints and a complete evidence bundle.

**Modules/files:**
- `packages/cli/src/headless.ts`
- `packages/runtime/src/job-store.ts`
- `packages/runtime/src/scheduler.ts`
- `packages/integrations/src/git-provider.ts`
- `packages/protocol/src/job.ts`

**Upstream Pi files changed:** none

**Tests:**
- atomic job-state transitions and lock recovery
- process crash and machine reboot resume
- short-lived CI credential handling
- duplicate delivery/idempotency
- PR bundle contains diff, tests, trace, cost, risk and unresolved questions

**Benchmark:** Long-running issue-to-patch tasks in disposable repositories; compare interactive handoff, headless single-agent and optional delegated mode.

**Exit criteria:**
- No mandatory cloud service or database.
- No automatic merge; risky external actions require configured approval.
- A resumed job cannot silently duplicate an external side effect.

**Rollback:** Stop scheduler and retain job directories for audit; interactive Pi remains unaffected.

**Upstream-sync risk:** low-to-medium

## 10. Upstream-sync strategy

```text
upstream/main             exact mirror of earendil-works/pi
pi-void/main              separate packages, config and release history
integration/upstream-head ephemeral compatibility branch created by CI
patches/<pi-sha>/         normally empty; audited narrow patches only
```

1. Add remotes `upstream` and `origin`; never commit pi-void changes to the mirror branch.
2. Keep custom code in a separate repository/package workspace. Depend on pinned Pi packages or install the exact Pi commit in CI.
3. Use small thematic commits; prohibit repository-wide rename, formatting-only changes and copied upstream files.
4. Fetch upstream on a schedule and run compile, type, unit, integration and smoke-eval tests against both the supported pin and upstream HEAD.
5. Generate a compatibility manifest listing required ExtensionAPI events, fields and session schema assumptions.
6. If a seam is missing, propose it upstream first. Any temporary patch is isolated in `patches/<sha>/`, described in a patch inventory and removed when upstream lands the capability.
7. Use `git range-diff` to audit patch drift. Rebase private integration branches for inspection; preserve released history with signed tags and a deliberate merge/rebase release policy.
8. Pin lockfiles, container image digests and model-serving versions; upstream code compatibility alone is not enough for reproducible behavior.

**[VERIFIED]** **Zero conflicts cannot be guaranteed.** Upstream can rename packages, alter event contracts, change session schemas or remove fields. Composition and stable public seams reduce the probability and blast radius; they do not control future upstream architecture.

## 11. Evaluation suite

### 11.1 Controlled comparison design

**[PROPOSED]** Compare **stock Pi**, **pi-void Balanced Hybrid** and **OpenHands** with identical model endpoints, task prompts, repositories, container images, network policy, resource limits, wall-clock/token/cost budgets and hidden verifiers. Record unavoidable native-tool differences as part of the harness treatment; never normalize them away silently.

### 11.2 Models

| Family | Exact model | Revision/pinning rule | Serving/effort | Status |
| --- | --- | --- | --- | --- |
| OpenAI GPT-5.6 | gpt-5.6-sol | record API model id, response-reported revision/snapshot if available, provider route, effort and all request parameters | one fixed API effort for controlled comparisons; max as a separately reported ceiling run | required |
| Anthropic Claude 5 | claude-fable-5 | use only if all three harnesses officially support the exact API route without proxy-specific behavior; otherwise use exact Claude Opus 4.8 snapshot and label Fable unresolved | fixed adaptive/default mode | conditional because safety fallback and harness support can confound exact-model control |
| Qwen | Qwen/Qwen3.6-27B | 5d316fa25c3a0b6251198e9e7a94e863a435536a | pin vLLM or SGLang version, tool-call parser, reasoning parser, quantization, max context and sampling | required workstation/cluster local family |
| DeepSeek | deepseek-ai/DeepSeek-V4-Flash | not established | freeze official revision and dedicated encoding/parser implementation in Phase 0; record FP format and cluster topology | required self-hosted-cluster family; not a desktop-local model |
| small local control | GLM-4-9B-0414 or a comparably current sub-15B independently licensed model | not established | candidate must be frozen before execution and pass a tool-schema conformance test | optional but recommended to test graceful degradation on constrained hardware |

**[VERIFIED]** Qwen3.6-27B's official model card specifies 27B parameters, 262,144 native context, official tool-call parser recommendations and Apache-2.0. Those vendor benchmarks use different harnesses and cannot be transferred to pi-void. [QWEN36](https://huggingface.co/Qwen/Qwen3.6-27B)

**[VERIFIED]** DeepSeek-V4-Flash is 284B total/13B active with one-million-token context and an MIT model card, but it is a self-hosted cluster model rather than ordinary desktop-local. Its dedicated encoding/parser must be frozen as part of the model treatment. [DEEPSEEK-V4](https://huggingface.co/deepseek-ai/DeepSeek-V4-Flash)

### 11.3 Tasks and trajectory counts

| Category | Main tasks | Coverage |
| --- | --- | --- |
| repository bug fixing | 12 | hidden regressions, multi-file repair, environment setup |
| greenfield development | 12 | small service/library/CLI with acceptance tests |
| testing | 12 | test generation, flaky-test repair, coverage-sensitive behavior |
| frontend | 12 | implementation from screenshot/spec with DOM and visual checks |
| terminal and DevOps | 12 | containers, package/build systems, service diagnosis, CI |
| long-running autonomy | 12 | multi-stage migration, issue-to-patch, recovery after interruption |

- **Pilot:** 24 tasks x 3 harnesses x 4 predeclared model slots x 3 repeats = 864 trajectories after Phase 0 support/preflight rules are resolved.
- **Main:** 72 tasks x 3 harnesses x 4 predeclared model slots x 5 repeats = 4,320 trajectories after Phase 0 support/preflight rules are resolved.
- **Long-running:** may use a separately powered repeated subset if budget limits prevent the full matrix; report it separately rather than changing denominators silently.

### 11.4 Required metrics

- verified task success and per-category success
- regression rate against baseline tests
- wall time and active-agent time
- input, cached input, reasoning and output tokens
- API cost and infrastructure cost
- turn count and tool-call count
- tool schema/argument/execution errors
- unsafe-action attempts and policy outcomes
- recovery count and failure class
- human-review minutes and number of required interventions
- trace completeness and final artifact hashes

### 11.5 Statistical and audit rules

- paired task design
- Wilson or bootstrap 95% intervals for success rates
- paired bootstrap/permutation tests for score/cost/time deltas
- McNemar-style paired analysis for binary task outcomes where assumptions hold
- report effect sizes and intervals; never call a point estimate significant without the test
- predeclare exclusions and missing-telemetry handling

Additional audit controls:
- identical task prompt, repository commit and hidden verifier
- same container image, CPU/memory/GPU allocation and network policy
- same model endpoint, revision, provider route, effort/sampling and context/output limits
- same wall-clock, token and monetary caps
- same external tools where possible; unavoidable native-tool differences documented as treatment components
- randomized run order and independent run identifiers
- no task/grader files visible in the workspace
- contamination scan and task provenance record

### 11.6 Interpretation rules

- Preserve Terminal-Bench 2.0/2.1 and Artificial Analysis v1.1/v1.2 as separate benchmarks.
- Preserve exact model IDs, effort settings, provider routes and serving parsers.
- Report native-system ceiling rows separately from controlled same-model harness rows.
- A completed run is not a solved task unless the verifier passes.
- No point estimate is described as statistically significant without the predeclared paired analysis.
- Raw traces, final artifacts, run manifests and exclusion reasons must be retained.

## 12. Threat model

| Threat | Asset | Attack | Controls | Residual risk | Priority |
| --- | --- | --- | --- | --- | --- |
| Prompt injection in repository files, issues, tests or generated logs | agent policy, secrets, code integrity | untrusted text instructs the model to expose credentials, change policy or execute unrelated commands | mark repository content untrusted; system policy outside repo; deterministic tool gate; sandbox; context source labels; canary injection tests | model may still follow malicious content within permitted actions | critical |
| Malicious dependencies and install/build scripts | host and sandbox | package manager lifecycle script or build tool executes arbitrary code | sandbox required; network deny/allowlist; package-lock verification; no host credentials; approval for installs; disposable worktree/container | sandbox kernel/runtime escape and compromised allowed registry | critical |
| Shell and filesystem damage | user files, Git history and system state | rm, chmod, disk fill, git reset/clean/force push, writes through symlinks or mounts | workspace-root path policy; read-only mounts; quotas; worktrees; command risk rules; snapshots; no Docker socket | policy/parser bypass or writable mount misconfiguration | critical |
| Credential leakage | API keys, SSH keys, cloud tokens | read environment/files or print secrets into traces/network requests | secret broker; explicit per-run forwarding; short-lived credentials; output redaction; deny home/SSH paths; separate inference proxy | a legitimately supplied task secret can still be mishandled | critical |
| Network exfiltration | source code and confidential data | curl, package upload, DNS or browser request to attacker endpoint | default-deny egress; endpoint/domain allowlist; inference proxy; DNS logging; size/rate limits | allowed endpoints can be abused as covert channels | critical |
| MCP, plugin and extension compromise | host process and credentials | third-party extension executes arbitrary host code or modifies prompts/tools | project trust; signed/pinned package hashes; separate plugin process where feasible; minimal allowlist; SBOM; review and CI | trusted extension has full capability in host mode | high |
| Compromised upstream or dependency supply chain | pi-void build and release | malicious upstream commit, package takeover or CI artifact | pin commits/lockfiles; verify signatures/hashes; dependency review; provenance attestations; CI against but not auto-merge upstream HEAD | trusted maintainer compromise | high |
| Untrusted subagent | parent workspace and decision process | worker returns malicious patch, false claims or crafted result payload | separate worktree/container; typed result schema; no parent secrets; parent-side diff/test review; no auto-merge | valid-looking malicious changes can pass incomplete tests | high |
| CI token exposure and external side effects | repositories, registries and cloud accounts | agent reads broad token or repeats PR/deploy/publish action after retry | OIDC/short-lived scoped token; idempotency key; approval checkpoint; dry-run; external action journal; protected environments | provider/API idempotency gaps | critical |

### Security invariants

- Repository text is data, never policy.
- Untrusted/headless execution cannot fall back to host mode silently.
- The sandbox receives no full host environment, home directory, SSH agent or Docker socket.
- Network is deny-by-default; model inference and package access use explicit endpoints/proxies.
- External side effects are separately journaled and idempotent where the API supports it.
- Extensions/plugins are executable code and require project trust, pinning and review.
- Subagents are untrusted principals; their patches and claims require parent verification.

## 13. Prioritized backlog

| Priority | Capability | Evidence | Expected gain | Complexity | Conflict risk | Security risk | Decision |
| --- | --- | --- | --- | --- | --- | --- | --- |
| P0 | Versioned run/trace schema | PI-EXT, PI-SESSION, MINISWE-LOOP | measurement and debuggability prerequisite | low | very low | medium if traces leak secrets | build first |
| P0 | Deterministic allow/ask/deny policy | PI-EXT, OH-POLICY, CLAUDE-PERMISSIONS | safer interactive and headless operation | low-medium | very low | critical if incorrect | build first |
| P0 | Git snapshot and deterministic verifier | AGENTLESS, GITTASK, AA-METHOD | higher verified reliability and clearer regressions | medium | very low | medium from test execution | build first |
| P0 | Whole-Pi Docker runtime | PI-CONTAINER, PI-SECURITY, OH-DOCKER | strong reduction in host blast radius | medium | very low | critical configuration surface | build after safe-verify |
| P1 | Bounded recovery classifier | PI-DURABLE, OH-CONVERSATION | less wasted work on transient and recoverable failures | medium | low | medium | build |
| P1 | Transparent stuck detector | OH-STUCK | lower loop/token waste | low | low | low | build |
| P1 | Structured compaction state | PI-COMPACTION, OH-CONDENSER | long-session reliability | medium | low | medium if untrusted text is elevated | build narrowly |
| P1 | Repository localization/map | AGENTLESS, SWEAGENT | fewer exploratory turns on large repos | medium | low | low | prototype and ablate |
| P1 | Weak-model compatibility profiles | MINISWE-LOOP, LOCAL-WIP, QWEN36 | graceful local-model operation | medium | low | medium | build |
| P2 | Hashline edit anchors | OMP | potentially fewer stale/ambiguous edits | medium | low | low | prototype only after baseline |
| P2 | Plan/read-only mode | CLAUDE-PERMISSIONS, OPENCODE | human review before mutation | low | very low | low | build as profile |
| P2 | Worktree subagents | OMP, GROK-GOAL | parallelism on decomposable tasks | high | low-medium | high | defer to Phase 5 |
| P2 | Headless job journal | PI-HARNESS, CODEX, OH-CONVERSATION | CI and long-running resume | high | low | high | defer to Phase 6 |
| P3 | Browser/visual worker | OpenHands platform and frontend benchmarks | frontend/web task coverage | high | low | high | defer; profile only |
| P3 | Mandatory MCP layer | Pi intentionally leaves MCP to extensions | broad integrations | high | medium | high | reject as core requirement |
| P3 | Self-modifying harness | AHE, SELF-HARNESS, COMPOUND, RETHINK-EVAL | uncertain benchmark adaptation | very high | high | high | reject until mature regression control |
| P3 | Always-on vector memory/database | no direct need; Pi has session tree and compaction | uncertain | high | medium | high for data retention | reject |

## 14. First implementation slice: @pi-void/safe-verify

**[PROPOSED]** This is the smallest slice that can create measurable reliability and safety value while preserving a zero-diff upstream Pi core.

### Scope
- external Pi extension only; zero modifications to earendil-works/pi
- deterministic tool risk policy at tool_call
- pre-turn Git/workspace snapshot metadata
- ordered event, usage, cost and tool-error trace
- configured deterministic verifier when agent_settled fires
- one optional bounded repair turn, persisted through a Pi custom entry

### Interfaces

```ts
type Decision = "allow" | "ask" | "deny";
type Risk = "low" | "medium" | "high" | "critical";

interface ToolIntent {
  runId: string;
  toolCallId: string;
  toolName: string;
  args: unknown;
  cwd: string;
  mode: "tui" | "rpc" | "json" | "print";
  projectTrusted: boolean;
}

interface PolicyDecision {
  decision: Decision;
  ruleId: string;
  rationale: string;
  risk: Risk;
}

interface VerifyCommand {
  argv: string[];
  cwd?: string;
  timeoutMs: number;
  required: boolean;
}

interface VerifyProfile {
  commands: VerifyCommand[];
  repairBudget: 0 | 1;
  timeoutMs: number;
  environment: Record<string, string>;
}

interface RunRecord {
  schemaVersion: string;
  runId: string;
  sessionId: string | null;
  piCommit: string;
  piVoidCommit: string;
  model: string;
  provider: string;
  startedAt: string;
  runtime: string;
  taskHash: string | null;
}
```

### Hook wiring

- `before_agent_start`: create/validate run record and capture effective system-prompt hash.
- `before_provider_request` / provider response hooks: record request configuration, status and telemetry without storing secrets.
- `tool_call`: normalize intent, classify risk, block/ask/allow.
- `tool_execution_start/update/end` and `tool_result`: write ordered trace, usage and errors.
- `agent_settled`: run verifier; if failed and budget remains, persist latch with `appendEntry` and send one evidence-bearing repair message.
- `session_start`: reconstruct the repair latch and current run reference from custom entries.

### Acceptance criteria
- No upstream Pi files changed.
- Critical-risk fixtures cannot execute without explicit approval and are denied in headless deny-unknown mode.
- A settled coding run writes a verifier record with command, exit code, duration, capped output and artifact hashes.
- Repair budget cannot exceed one even after reload/resume.
- Disabling the extension restores stock Pi behavior and requires no session migration.
- On the pilot suite, report verified success, regression, token/cost/runtime and unsafe attempts with paired uncertainty; improvement is not claimed from point estimates alone.

### Test cases
- rm -rf outside workspace
- git reset --hard and git clean -fdx
- write through symlink escaping workspace
- curl to non-allowlisted endpoint
- read of .ssh, cloud credentials and process environment
- ordinary read/edit/test workflow
- verifier pass, verifier fail and verifier timeout
- provider telemetry missing
- session reload after first repair request
- tool result containing a fake instruction to disable policy

### Benchmark protocol

Run the Phase 0 24-task pilot on stock Pi and safe-verify with the same model, provider, prompt, runtime, limits and three repeats; expand high-variance cells to five repeats. Predeclare primary endpoint verified success and guardrails regression rate, unsafe-action containment, wall time, token/cost and human intervention.

### Deliberately excluded
- new planner
- subagents or parallel workers
- browser
- MCP server management
- new database
- new provider abstraction
- repository embeddings/vector store
- automatic PR creation or merge
- self-modifying prompts/tools

## 15. Final build/no-build verdict

### What should remain pure Pi?

**[PROPOSED]** Keep the provider/model registry, four default coding tools, central agent loop, prompt construction, session tree, compaction, resource/skill loading, TUI, RPC/JSON/headless modes and ExtensionAPI as upstream Pi. Do not shadow these with pi-void equivalents.

### What should come from OpenHands?

**[PROPOSED]** Adapt the controller/workspace boundary, runtime abstraction, explicit confirmation policy, transparent stuck detection, typed recovery causes, append-only event/view distinction, budget accounting and evaluation/replay discipline. Use OpenHands Agent Server only as an optional adapter if it proves simpler or safer than the native pi-void runtime contract.

### What should be behaviorally adapted from the reference products?

- **Claude Code:** permission presets, ordered deny/ask/allow rules, hooks, plan/read-only mode, scoped instructions/skills and bounded subagent semantics. Public behavior only.
- **Codex:** sandbox/approval separation, patch-oriented workflow, review mode, worktrees, resumable headless execution and explicit external-action control.
- **OpenCode:** client/server and persistent-session ideas, build/plan roles and practical multi-provider UX; not its provider layer.
- **OhMyPi:** benchmark Hashline editing, selected LSP feedback and worktree-isolated typed subagents; reject the whole-fork strategy and large default tool surface.
- **Grok Build:** explicit goal state, no-progress/backoff/budget states and planner/worker/verifier accounting for the optional autonomous profile; do not invent or depend on unavailable private-monorepo behavior.

### What should not be built?

A new core loop, a second provider layer, an always-on planner, mandatory OpenHands/Python services, default browser/MCP/vector memory, shared-worktree subagents, automatic merge/deploy, hidden cross-provider fallback, copied proprietary prompts, or a self-modifying harness without held-out regression control.

### What should be built first?

`@pi-void/safe-verify`: instrumentation, deterministic policy, Git snapshot, source-auditable trace, deterministic verifier and one bounded repair turn. It can be built entirely through current Pi extension seams and supplies the data needed to justify every later feature.

### What evidence would change this recommendation?

- A repeated, coding-specific same-model study showing that a full OpenHands-style controller materially outperforms Pi-plus-extensions after cost/runtime and version controls.
- Upstream Pi adding native isolation, durable recovery and verification in a way that makes pi-void packages redundant.
- pi-void Phase 0/1 results showing policy/verification overhead or context interference reduces verified success.
- A robust ablation showing default multi-agent or browser integration improves the user's real task distribution after total tokens, merge conflicts and review time.
- Security testing showing whole-process container isolation is inadequate for the target threat model, requiring a stronger microVM/remote runtime as default.

## 16. Unresolved questions

| Question | Status | Required resolution |
| --- | --- | --- |
| Does Claude Fable 5 behave as one exact model across all harnesses when safety fallback can route some requests to Opus 4.8? | UNRESOLVED | Capture response metadata and refusals/fallbacks; if exact routing cannot be audited, use Opus 4.8 for the controlled cell and report Fable only as a native-system ceiling. |
| What is the actual prompt and tool-schema token overhead of current Pi for each target model/tokenizer? | UNRESOLVED | Phase 0 instrumentation; no model-independent number is defensible. |
| Does Hashline editing improve verified success over Pi's current edit tool on current frontier and local models? | UNRESOLVED | Ablation on stale-line, multi-edit and merge-conflict tasks before adoption. |
| Can OpenHands and Pi be placed in exactly equivalent tool/runtime environments without changing their native harness behavior? | UNRESOLVED | Document unavoidable treatment differences and run both native and normalized-tool experiments where practical. |
| Which second sub-15B local model is current, independently licensed and sufficiently tool-call capable for the main matrix? | UNRESOLVED | Freeze candidate and exact serving stack in Phase 0 after conformance tests; do not silently substitute model families. |
| Are HarnessBench 2.0 results and raw traces available in a versioned form comparable to the v1 paper? | UNRESOLVED | Treat the repository update as a new suite until a versioned paper/result artifact is published. |
| What minimum network access is required for each language ecosystem without creating a broad exfiltration channel? | UNRESOLVED | Measure package cache hit rates; prefer prebuilt images and per-task allowlists/proxies. |

## 17. Source ledger

Source tier: 1 raw source/result/code; 2 official paper/methodology; 3 official repository/docs/model card; 4 independent reproduction; 5 maintainer/vendor announcement. Lower-tier claims never override primary source.

| ID | Tier | Provenance | Source | Direct URL | Version/commit | Access date |
| --- | --- | --- | --- | --- | --- | --- |
| BRIEF | 0 | user-supplied specification | pi-void research and architecture brief | not established | conversation upload: Pasted text(3).txt | 2026-07-22 |
| PI-REPO | 3 | official repository | Pi canonical repository | https://github.com/earendil-works/pi | dd6bea41efa8caa7a10fe5a6401676dc5699f83f; @earendil-works/pi-coding-agent 0.81.1 | 2026-07-22 |
| PI-LOOP | 1 | official source code | Pi agent loop | https://github.com/earendil-works/pi/blob/dd6bea41efa8caa7a10fe5a6401676dc5699f83f/packages/agent/src/agent-loop.ts | dd6bea41efa8caa7a10fe5a6401676dc5699f83f | 2026-07-22 |
| PI-HARNESS | 1 | official architecture documentation | Pi AgentHarness architecture | https://github.com/earendil-works/pi/blob/dd6bea41efa8caa7a10fe5a6401676dc5699f83f/packages/agent/docs/agent-harness.md | dd6bea41efa8caa7a10fe5a6401676dc5699f83f | 2026-07-22 |
| PI-DURABLE | 1 | official architecture documentation | Pi durable harness design | https://github.com/earendil-works/pi/blob/dd6bea41efa8caa7a10fe5a6401676dc5699f83f/packages/agent/docs/durable-harness.md | dd6bea41efa8caa7a10fe5a6401676dc5699f83f | 2026-07-22 |
| PI-EXT | 1 | official source code and documentation | Pi extension API and lifecycle events | https://github.com/earendil-works/pi/blob/dd6bea41efa8caa7a10fe5a6401676dc5699f83f/packages/coding-agent/src/core/extensions/types.ts | dd6bea41efa8caa7a10fe5a6401676dc5699f83f | 2026-07-22 |
| PI-SESSION | 1 | official source code | Pi append-only session tree and custom entries | https://github.com/earendil-works/pi/blob/dd6bea41efa8caa7a10fe5a6401676dc5699f83f/packages/coding-agent/src/core/session-manager.ts | dd6bea41efa8caa7a10fe5a6401676dc5699f83f; session schema v3 | 2026-07-22 |
| PI-PROMPT | 1 | official source code | Pi system-prompt construction | https://github.com/earendil-works/pi/blob/dd6bea41efa8caa7a10fe5a6401676dc5699f83f/packages/coding-agent/src/core/system-prompt.ts | dd6bea41efa8caa7a10fe5a6401676dc5699f83f | 2026-07-22 |
| PI-COMPACTION | 3 | official documentation | Pi context compaction | https://github.com/earendil-works/pi/blob/dd6bea41efa8caa7a10fe5a6401676dc5699f83f/packages/coding-agent/docs/compaction.md | dd6bea41efa8caa7a10fe5a6401676dc5699f83f | 2026-07-22 |
| PI-CONTAINER | 3 | official documentation | Pi containerization patterns | https://github.com/earendil-works/pi/blob/dd6bea41efa8caa7a10fe5a6401676dc5699f83f/packages/coding-agent/docs/containerization.md | dd6bea41efa8caa7a10fe5a6401676dc5699f83f | 2026-07-22 |
| PI-SECURITY | 3 | official documentation | Pi security model | https://github.com/earendil-works/pi/blob/dd6bea41efa8caa7a10fe5a6401676dc5699f83f/packages/coding-agent/docs/security.md | dd6bea41efa8caa7a10fe5a6401676dc5699f83f | 2026-07-22 |
| PI-LICENSE | 1 | official license file | Pi MIT license | https://github.com/earendil-works/pi/blob/dd6bea41efa8caa7a10fe5a6401676dc5699f83f/LICENSE | dd6bea41efa8caa7a10fe5a6401676dc5699f83f | 2026-07-22 |
| OH-SDK | 3 | official repository | OpenHands Software Agent SDK | https://github.com/OpenHands/software-agent-sdk | 9dda2df6f5432c32861eb21e8d57df7e5525133d; SDK 1.36.1 | 2026-07-22 |
| OH-CONVERSATION | 1 | official source code | OpenHands LocalConversation controller | https://github.com/OpenHands/software-agent-sdk/blob/9dda2df6f5432c32861eb21e8d57df7e5525133d/openhands-sdk/openhands/sdk/conversation/impl/local_conversation.py | 9dda2df6f5432c32861eb21e8d57df7e5525133d | 2026-07-22 |
| OH-AGENT | 1 | official source code | OpenHands Agent implementation | https://github.com/OpenHands/software-agent-sdk/blob/9dda2df6f5432c32861eb21e8d57df7e5525133d/openhands-sdk/openhands/sdk/agent/agent.py | 9dda2df6f5432c32861eb21e8d57df7e5525133d | 2026-07-22 |
| OH-STUCK | 1 | official source code | OpenHands stuck detector | https://github.com/OpenHands/software-agent-sdk/blob/9dda2df6f5432c32861eb21e8d57df7e5525133d/openhands-sdk/openhands/sdk/conversation/stuck_detector.py | 9dda2df6f5432c32861eb21e8d57df7e5525133d | 2026-07-22 |
| OH-CONDENSER | 1 | official source code and documentation | OpenHands condenser architecture | https://github.com/OpenHands/software-agent-sdk/blob/9dda2df6f5432c32861eb21e8d57df7e5525133d/openhands-sdk/openhands/sdk/context/condenser/README.md | 9dda2df6f5432c32861eb21e8d57df7e5525133d | 2026-07-22 |
| OH-POLICY | 1 | official source code | OpenHands confirmation policy | https://github.com/OpenHands/software-agent-sdk/blob/9dda2df6f5432c32861eb21e8d57df7e5525133d/openhands-sdk/openhands/sdk/security/confirmation_policy.py | 9dda2df6f5432c32861eb21e8d57df7e5525133d | 2026-07-22 |
| OH-DOCKER | 1 | official source code | OpenHands DockerWorkspace | https://github.com/OpenHands/software-agent-sdk/blob/9dda2df6f5432c32861eb21e8d57df7e5525133d/openhands-workspace/openhands/workspace/docker/workspace.py | 9dda2df6f5432c32861eb21e8d57df7e5525133d | 2026-07-22 |
| OH-LICENSE | 1 | official license file | OpenHands SDK MIT license | https://github.com/OpenHands/software-agent-sdk/blob/9dda2df6f5432c32861eb21e8d57df7e5525133d/LICENSE | 9dda2df6f5432c32861eb21e8d57df7e5525133d | 2026-07-22 |
| OH-INDEX | 1 | benchmark owner also develops OpenHands | OpenHands Index raw results repository | https://github.com/OpenHands/openhands-index-results | 3015ac612e7196f428e6e8a3948965d32d9a3331 | 2026-07-22 |
| OPENCODE | 3 | official repository | OpenCode | https://github.com/anomalyco/opencode | 130038eb63a94d832b0aea0d3ea9c83511db3d4d; MIT | 2026-07-22 |
| OMP | 3 | official repository | OhMyPi / OMP | https://github.com/can1357/oh-my-pi | 7b141199d524b859c357fc89654f10b62b9f3df1; 17.0.7; MIT | 2026-07-22 |
| CODEX | 3 | official repository | OpenAI Codex CLI | https://github.com/openai/codex | 9fce9e13fd649f8c4549079eb6ca5d697e2ce0e4; Apache-2.0 | 2026-07-22 |
| CLAUDE-PERMISSIONS | 3 | official proprietary-product documentation | Claude Code permissions | https://docs.anthropic.com/en/docs/claude-code/permissions | continuously updated documentation; source unavailable | 2026-07-22 |
| CLAUDE-HOOKS | 3 | official proprietary-product documentation | Claude Code hooks | https://docs.anthropic.com/en/docs/claude-code/hooks | continuously updated documentation; source unavailable | 2026-07-22 |
| GROK-BUILD | 3 | official repository periodically synchronized from a private monorepo | Grok Build | https://github.com/xai-org/grok-build | 3af4d5d39897855bdcc74f23e690024a5dc05573; Apache-2.0 | 2026-07-22 |
| GROK-GOAL | 1 | official source code | Grok Build goal orchestrator | https://github.com/xai-org/grok-build/blob/3af4d5d39897855bdcc74f23e690024a5dc05573/crates/codegen/xai-grok-shell/src/session/goal_orchestrator.rs | 3af4d5d39897855bdcc74f23e690024a5dc05573 | 2026-07-22 |
| MINISWE | 3 | official repository | mini-SWE-agent v2 | https://github.com/SWE-agent/mini-swe-agent | 38c01a19ed1a58dd17dd7c95010e4f69d059c777; MIT | 2026-07-22 |
| MINISWE-LOOP | 1 | official source code | mini-SWE-agent default loop | https://github.com/SWE-agent/mini-swe-agent/blob/38c01a19ed1a58dd17dd7c95010e4f69d059c777/src/minisweagent/agents/default.py | 38c01a19ed1a58dd17dd7c95010e4f69d059c777 | 2026-07-22 |
| SWEAGENT | 2 | official paper and repository | SWE-agent: Agent-Computer Interfaces Enable Automated Software Engineering | https://arxiv.org/abs/2405.15793 | paper; current repository https://github.com/SWE-agent/SWE-agent | 2026-07-22 |
| AGENTLESS | 3 | official repository and paper artifacts | Agentless | https://github.com/OpenAutoCoder/Agentless | 5ce5888b9f149beaace393957a55ea8ee46c9f71; MIT | 2026-07-22 |
| HB-PAPER | 2 | benchmark paper | Harness-Bench: Measuring Harness Effects across Models in Realistic Agent Workflows | https://arxiv.org/html/2605.27922 | arXiv:2605.27922; published 2026-05-27 | 2026-07-22 |
| HB-REPO | 3 | official benchmark repository | Harness-Bench repository | https://github.com/Qihoo360/harness-bench | 1025086a446653702b80cfb48babbeec35db6b2c; repository now labels suite HarnessBench 2.0 | 2026-07-22 |
| TUA | 2 | independent academic benchmark | TUA-Bench | https://arxiv.org/html/2606.28480 | published 2026-06-26 | 2026-07-22 |
| GITTASK | 2 | independent academic benchmark | GitTaskBench | https://arxiv.org/html/2508.18993 | paper v2 dated 2025-09-14 | 2026-07-22 |
| AHE | 2 | research paper | Automated Harness Engineering | https://arxiv.org/abs/2604.25850 | arXiv v4 dated 2026-05-18 | 2026-07-22 |
| MEMOHARNESS | 2 | research paper | MemoHarness | https://arxiv.org/abs/2607.14159 | published 2026-07-14 | 2026-07-22 |
| SELF-HARNESS | 2 | research paper | Self-Harness | https://arxiv.org/abs/2606.09498 | published 2026-06 | 2026-07-22 |
| COMPOUND | 2 | research paper | Do Agent Optimizers Compound? | https://arxiv.org/abs/2607.14004 | published 2026-07 | 2026-07-22 |
| RETHINK-EVAL | 2 | research paper | Rethinking Evaluation of Harness Evolution | https://arxiv.org/abs/2607.12227 | published 2026-07 | 2026-07-22 |
| AA-METHOD | 2 | independent commercial evaluator methodology | Artificial Analysis Coding Agent Index methodology | https://artificialanalysis.ai/methodology/coding-agents-benchmarking | v1.2 current July 2026 | 2026-07-22 |
| AA-LB | 1 | independent commercial evaluator aggregate results; raw attempts closed | Artificial Analysis Coding Agent Index | https://artificialanalysis.ai/agents/coding-agents | v1.2 current July 2026 | 2026-07-22 |
| AA-GPT56-ARTICLE | 5 | evaluator launch article using prior index version | GPT-5.6 benchmarks across Intelligence, Speed and Cost | https://artificialanalysis.ai/articles/gpt-5-6-has-landed | Coding Agent Index v1.1 at publication, 2026-07-09 | 2026-07-22 |
| AA-CODEX | 1 | independent commercial evaluator aggregate comparison | Codex versus OpenCode comparison | https://artificialanalysis.ai/agents/coding-agents/comparisons/codex-vs-opencode | v1.2 snapshot accessed 2026-07-22 | 2026-07-22 |
| AA-CLAUDE-CODEX | 1 | independent commercial evaluator aggregate comparison | Claude Code versus Codex comparison | https://artificialanalysis.ai/agents/coding-agents/comparisons/claude-code-vs-codex | v1.2 snapshot accessed 2026-07-22 | 2026-07-22 |
| GPT56-MODEL | 3 | official model documentation | GPT-5.6 Sol model documentation | https://developers.openai.com/api/docs/models/gpt-5.6-sol | model id gpt-5.6-sol; alias gpt-5.6 | 2026-07-22 |
| GPT56-LAUNCH | 5 | official vendor announcement | GPT-5.6 launch | https://openai.com/index/gpt-5-6/ | published 2026-07-09 | 2026-07-22 |
| FABLE | 3 | official model page | Claude Fable 5 | https://www.anthropic.com/claude/fable | model id claude-fable-5; globally restored 2026-07-01 | 2026-07-22 |
| FABLE-DOCS | 3 | official model release notes | Claude Platform release notes | https://platform.claude.com/docs/en/release-notes/overview | 2026-06-09 release note; accessed 2026-07-22 | 2026-07-22 |
| QWEN36 | 3 | official model card; vendor benchmark claims | Qwen3.6-27B | https://huggingface.co/Qwen/Qwen3.6-27B | candidate pinned revision 5d316fa25c3a0b6251198e9e7a94e863a435536a; Apache-2.0 | 2026-07-22 |
| DEEPSEEK-V4 | 3 | official model card | DeepSeek-V4-Flash | https://huggingface.co/deepseek-ai/DeepSeek-V4-Flash | revision to be frozen in Phase 0; MIT | 2026-07-22 |
| LOCAL-WIP | 4 | independent community experiment; private tasks; single run per cell | Independent local-model harness-bench experiment | https://www.neuralnoise.com/2026/harness-bench-wip/ | work in progress accessed 2026-07-22 | 2026-07-22 |

## 18. Machine-readable companion

The companion JSON contains project identities, evidence claims, the weighted architecture decision, feature decisions, phased roadmap, benchmark plan, threat model, backlog, first implementation slice, unresolved questions and source ledger. Missing values are represented as `null`.

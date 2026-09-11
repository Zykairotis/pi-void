---
name: forever-goal
description: >
  Build, validate, and enforce strict guardrails for a /goal execution from a
  named plan. Use when the user runs /forever-goal, wants to start a plan-parity
  long-running goal, or asks to complete plans/{name}.md with external review.
  Validates plan, todo task list, clean worktree, and chatgpt-desktop settings
  before emitting the canonical /goal prompt. Enforces phase-gating with
  chatgpt-desktop reviews, bounded repair loops, and anti-shortcut guardrails.
argument-hint: "<plan-name>"
---

# Forever Goal

This skill provides **deterministic guardrails, preflight validation, and phase-review governance** for long-running `/goal` execution.

It operates in two distinct stages:
1. **Preflight & Prompt Generation**: Validates all prerequisites fail-closed and emits the canonical, fully-parameterized `/goal` prompt.
2. **Phase-Gated Execution Governance**: Enforces phase review checkpoints with `chatgpt-desktop`, structured evidence packets, anti-shortcut constraints, and bounded repair loops during the `/goal` run.

---

## 1. Invocation

```bash
/forever-goal <plan-name>
```

- `<plan-name>` is the stem used for all associated paths. Example: `subagent-work`.
- Resolves to:
  - Plan: `plans/<plan-name>.md`
  - Task list: `todo/<plan-name>/<plan-name>-task-list.md`
  - Follow-up reviews: `follow-ups/<plan-name>/phase<number>/<followup>.md`

---

## 2. Settings & Source of Truth

Read `User_ideas/goals/chatgpt-desktop.settings.json` (or `chatgpt-desktop.settings.json` located next to `SKILL.md` when installed) before every `chatgpt-desktop` or `chatgpt-cli ask` invocation.

### Schema & Invariants

```json
{
  "cli": "~/chatgpt-cli/.venv/bin/chatgpt-cli",
  "helper": "~/.grok/skills/chatgpt-desktop/scripts/ask.sh",
  "model": "gpt-5-6-thinking",
  "thinking": "max",
  "json": true,
  "quiet": true,
  "conversation_id": "<UUID>"
}
```

- **Required keys**: `cli`, `model`, `thinking`, `json`, `quiet`, `conversation_id`.
- **Optional key**: `helper` (path to wrapper script).
- **Single Conversation ID Invariant**: `conversation_id` is the single fixed ChatGPT Desktop thread for the entire plan lifecycle. Use the exact same `--id` on every call (initial turn, phase reviews, follow-ups, repair rounds). Never omit `--id`. Never discover, invent, switch, or open a second conversation.

---

## 3. Associated Skills

| Skill | Role | Enforcement |
|---|---|---|
| `chatgpt-desktop` | Authoritative phase-end auditor and reviewer. | Sequential, blocking, single fixed thread. |
| `parallel-web-search` | External documentation and dependency research. | Cite sources with URLs. |
| `parallel-web-extract` | Verbatim URL/document extraction. | Prefer over unspecialized fetchers. |
| `context7` | Library and framework API reference resolution. | Resolve library ID before querying. |
| `ice-simple-tests` | Unit and integration test runner. | Fallback to repo test commands if uninstalled. |
| `ice-tui-interactive` | Interactive TUI regression testing. | Fallback to repo tmux runbook if uninstalled. |

---

## 4. Preflight Gates (Fail-Closed)

Do **not** emit or start the `/goal` prompt unless **every** preflight check passes. If any check fails, stop immediately, report the exact reason, and fail closed. Do not invent stub files, modify Git state, or bypass errors.

1. **Plan Stem Validation**:
   - `<plan-name>` is non-empty, contains no path separators (`/`, `\`), and no directory traversal (`..`).

2. **Plan File Existence**:
   - `plans/<plan-name>.md` exists, is readable, and is non-empty (> 50 bytes).
   - Plan contains identifiable phases or numbered milestone sections.

3. **Task List File Existence**:
   - `todo/<plan-name>/<plan-name>-task-list.md` exists and contains itemized checkboxes (`- [ ]`) mapped to plan phases.
   - If missing, prompt the user for creation; do not proceed silently.

4. **Clean Worktree Check**:
   ```bash
   git status --porcelain=v1 -uall
   ```
   - Standard output must be completely empty.
   - If uncommitted, untracked, or unstaged changes exist, print the paths and halt.

5. **Settings Validation**:
   - Settings file exists and parses as valid JSON.
   - `model` and `thinking` are non-empty.
   - `conversation_id` is a non-empty, valid UUID string. If empty, stop and prompt the user to provide an active Desktop conversation UUID.

6. **CLI & Auth Verification**:
   - The CLI binary (`settings.cli` or `settings.helper`) exists and is executable.
   - Authentication check succeeds:
     ```bash
     ~/chatgpt-cli/.venv/bin/chatgpt-cli auth status
     ```

7. **Verification Tooling Readiness**:
   - Check repo verification tooling:
     ```bash
     corepack npm@12.0.2 run check
     ```
   - Ensure baseline test runner (`./test.sh`) is executable.

---

## 5. Phase-Gating Protocol & State Machine

During `/goal` execution, the implementing agent must adhere to this strict state machine for every phase:

```
[ Enter Phase ]
       │
       ▼
[ Re-read Phase Requirements & Task List ]
       │
       ▼
[ Implement Minimal & Complete Code Changes ]
       │
       ▼
[ Run Authoritative Local Verification ]
  (npm run check + unit/integration/TUI tests)
       │
       ├──► Verification Failed? ──► Fix locally before requesting review
       │
       ▼ (Verification Passed)
[ Build Evidence Packet ]
       │
       ▼
[ Send to ChatGPT Desktop (--id "$CONVERSATION_ID") ]
       │
       ▼
[ Evaluate Desktop Verdict ]
       │
       ├──► VERDICT: PASS ──► Mark phase done in todo/ ──► Advance to Next Phase
       │
       └──► VERDICT: REPAIR ──► Write follow-up file ──► Repair Loop (Max 2 Attempts)
                                                          │
                                                          ├──► Pass on re-review? ──► Continue
                                                          └──► Exceeded 2 attempts? ──► Halt & Escalate
```

### Evidence Packet Structure

When requesting Desktop phase review, format the message as follows:

```markdown
# Phase <Number> Review Request: <Phase Title>
Plan: plans/<plan-name>.md
Conversation ID: <conversation_id>

## 1. Objectives & Scope Completed
- List of specific requirements implemented in this phase.

## 2. Changes Summary
- Exact list of modified, added, or deleted files.
- Key architectural decisions and non-obvious rationale.

## 3. Local Verification Evidence
- Lint & Typecheck: `corepack npm@12.0.2 run check` (Exit: 0, Output snippet)
- Tests: Command run, test count, pass count, exit status.
- Runtime / TUI Validation: tmux capture or runtime test output.

## 4. Unresolved Risks or Known Trade-offs
- Any residual edge cases or items deferred to later phases.

## 5. Requested Action
Audit this phase against `plans/<plan-name>.md`. Reply with your detailed comparison, scoring, and a final first-line verdict strictly formatted as `VERDICT: PASS` or `VERDICT: REPAIR`.
```

### Desktop Response Handling & Repair Protocol

1. **Extract Verdict**: Inspect the first non-empty line of the Desktop response.
2. **On `VERDICT: PASS`**:
   - Update `todo/<plan-name>/<plan-name>-task-list.md` marking phase items `- [x]`.
   - Record phase audit completion.
   - Advance to the next phase.
3. **On `VERDICT: REPAIR`**:
   - Create follow-up ticket: `follow-ups/<plan-name>/phase<number>/repair-<attempt>.md`.
   - Document the specific deficiencies identified by Desktop.
   - Implement targeted repairs.
   - Re-run local verification commands.
   - Re-submit updated evidence packet to Desktop.
   - **Repair Bound**: Allow at most **2 repair rounds** per phase. If unresolved after 2 rounds, stop and report the blocker to the user.

---

## 6. Anti-Shortcut & Anti-Degradation Guardrails

To prevent hallucinated completion and quality degradation during unattended runs:

1. **No Test Weakening**: Never modify, delete, or comment out existing tests solely to make a suite pass. Never replace real assertions with trivial truthy checks.
2. **No Mocking Out Real Implementation**: Never stub production paths with no-op functions, `return true`, or dummy data to bypass failures.
3. **No Lint Suppression**: Never add `@ts-ignore`, `@ts-nocheck`, `any`, or disable eslint/biome rules to bypass typecheck or lint errors.
4. **No Premature Victory Claims**: Model assertions of correctness do not override failing, stale, or unrun checks. Exit code `0` from authoritative commands is mandatory.
5. **No Scope Creep or Unauthorized Actions**: Do not commit, push, merge, release, deploy, or modify Git history unless explicitly requested in the plan.
6. **Ice Agent Loop Integrity**: Keep Ice as the single reasoning and execution loop. Do not spawn competing subagent planners or nested autonomous loops.

---

## 7. Context Compaction & Crash Recovery

For long-running `/goal` execution:

- **Compaction Readiness**: Before model context reaches the auto-compaction threshold (e.g. 85%), ensure all current progress, active phase status, and test outcomes are persisted to disk in `todo/<plan-name>/<plan-name>-task-list.md`.
- **Durable State Invariant**: All critical execution state lives on disk (`plans/`, `todo/`, `follow-ups/`, `chatgpt-desktop.settings.json`), never solely in transient chat memory.
- **Crash / Resumption Procedure**:
  1. Inspect `todo/<plan-name>/<plan-name>-task-list.md` to identify the last completed phase.
  2. Inspect `follow-ups/<plan-name>/` for any pending repairs.
  3. Verify current worktree status with `git status --porcelain=v1 -uall`.
  4. Resume execution directly at the first incomplete phase using the existing Desktop `conversation_id`.

---

## 8. Canonical /goal Prompt Template

When preflight checks pass, emit the prompt below. Fill in `<plan-name>` and `<conversation_id>`.

```text
/goal Complete plans/<plan-name>.md and bring the given implementation to production-ready parity with every requirement in that plan. Communicate with chatgpt-desktop at every phase end for audit and review. Do not mark a phase complete until chatgpt-desktop returns VERDICT: PASS. Use User_ideas/goals/chatgpt-desktop.settings.json for every Desktop ask (same --id <conversation_id>, model, and thinking).

SOURCE OF TRUTH:
- plans/<plan-name>.md
- todo/<plan-name>/<plan-name>-task-list.md
- Current repository implementation and contracts
- Authoritative test suites and typecheckers
- chatgpt-desktop phase reviews; persist critiques to follow-ups/<plan-name>/phase<number>/<followup>.md

SKILLS & TOOLS:
- chatgpt-desktop (settings-backed ask; phase gate auditor)
- parallel-web-search & parallel-web-extract (documentation research)
- context7 (library API discovery)
- Authoritative repository verification commands

PHASE GATE PROTOCOL:
At the end of each plan phase:
1. Run full local verification (lint, typecheck, targeted tests, TUI runbook).
2. Construct structured Phase Review Evidence Packet (objectives, changed files, verification output, risks).
3. Send packet to chatgpt-desktop with --id "<conversation_id>".
4. If Desktop returns VERDICT: REPAIR: write follow-up ticket, fix root causes, re-verify, and re-review (max 2 repair rounds).
5. If Desktop returns VERDICT: PASS: update todo/<plan-name>/<plan-name>-task-list.md and proceed to the next phase.

DONE WHEN:
- Every phase and requirement in plans/<plan-name>.md is implemented and verified.
- Every phase has received VERDICT: PASS from chatgpt-desktop.
- No requirement is skipped, stubbed, or mocked out.
- Typecheck and lint (`corepack npm@12.0.2 run check`) pass with zero errors/warnings.
- Relevant unit, integration, and regression tests pass cleanly.
- Interactive TUI or runtime behavior is validated through actual runtime paths.
- Existing functionality suffers zero regressions.

VERIFY WITH:
- Typecheck / Lint: `corepack npm@12.0.2 run check`
- Unit / Integration: `./test.sh` or `node ../../node_modules/vitest/dist/cli.js --run test/<target>.test.ts`
- Suite Harness: `packages/coding-agent/test/suite/` with faux provider (no real paid API keys).
- Interactive TUI: controlled tmux session runbook.

CONSTRAINTS & GUARDRAILS:
- Preserve public contracts unless the plan explicitly mandates changes.
- Never weaken assertions, delete failing tests, use @ts-ignore, or mock real implementations to force passes.
- Do not commit, push, merge, release, deploy, or expand credentials.
- Retain Ice as the single authoritative agent loop.

WORKING RULE:
Work sequentially phase by phase. Re-read the full plan after major milestones to prevent requirement drift. Treat verification failures as defects to fix at the root cause.

STOP ONLY WHEN:
All DONE WHEN criteria are satisfied with verified exit codes, or an unavoidable external blocker occurs. Bugs, failing tests, and compilation errors are tasks to resolve, not stop conditions.

FINAL EVIDENCE PACKET:
On completion, provide a comprehensive summary: requirements completed, files changed, verification commands and exit statuses, Desktop audit transcript summary, and final confirmation marker:
<!-- GOAL_COMPLETE -->
```

---

## 9. Verification Runbook & Commands

### Typecheck & Linting
```bash
corepack npm@12.0.2 run check
```
*Must produce clean output with zero errors and zero warnings.*

### Non-E2E Test Suite
```bash
./test.sh
```

### Targeted Package Tests
From the specific package root (e.g. `packages/coding-agent`):
```bash
node ../../node_modules/vitest/dist/cli.js --run test/<file>.test.ts
```

### Coding Agent Suite Harness
Use `packages/coding-agent/test/suite/harness.ts` with the faux provider. Never invoke paid provider APIs or live tokens during automated goal verification.

### Interactive TUI Validation (tmux)
```bash
tmux new-session -d -s ice-test -x 80 -y 24
tmux send-keys -t ice-test "./ice-test.sh" Enter
sleep 3 && tmux capture-pane -t ice-test -p
tmux send-keys -t ice-test "your verification prompt" Enter
sleep 2 && tmux capture-pane -t ice-test -p
tmux send-keys -t ice-test Escape
tmux kill-session -t ice-test
```

---

## 10. Desktop Invocation Reference

```bash
chatgpt-cli ask "$EVIDENCE_PACKET" \
  --id "$CONVERSATION_ID" \
  -m "$MODEL" \
  --thinking "$THINKING" \
  --json \
  --quiet
```

- If `chatgpt-cli ask` times out or returns empty:
  ```bash
  chatgpt-cli show "$CONVERSATION_ID"
  ```
  Inspect the latest assistant response turn.
- Always require returned `conversation_id == settings.conversation_id`.


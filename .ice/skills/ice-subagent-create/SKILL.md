---
name: ice-subagent-create
description: Create or revise ICE subagent Markdown profiles, specialist roles, tool requests, resource selections, and optional hook selections. Use when asked to add an agent, create a reviewer/coder role, import a profile, or explain how a custom subagent is defined.
---

# Create a ICE subagent profile

Read `../../../packages/coding-agent/docs/subagent-user-guide.md` before authoring. Resolve that path relative to this skill directory. Read the current profile parser if the guide and runtime disagree.

1. Inspect existing `.ice/agents` and relevant global/bundled profiles. Do not overwrite an existing role without inspecting it and confirming intentional replacement.
2. Clarify objective only when it cannot be inferred. Choose the narrowest role and tools. A profile is expertise plus requested capabilities, not permission.
3. Create `.ice/agents/<kebab-case-name>.md` with `name`, concise `description`, `tools`, optional bounded `tags`, and task guidance in the body.
4. Add only supported metadata. Unknown fields reject; do not invent permissions, recursion, endpoints, credentials, or executable setup fields. `model` profile metadata is diagnostic, not a routing instruction. Approved routing is per-call `execution.model`.
5. Keep guidance evidence-based: scope, expected output, uncertainty, mandatory verification, and no unobserved completion claims. Do not put policies or secrets into role prose.
6. Explain project trust and that safe mode narrows to parent-authorized read-only tools. Use the separate isolated writer workflow for edits; do not recommend `--sub-yolo` by default.
7. Validate with `list_subagent_profiles` in an already-approved ICE session, or parser tests without live model calls. Never start a second agent or spend provider tokens merely to validate a profile.
8. Report path, intended role, requested/effective capabilities, and unrun validation. Do not claim a parsed profile is tested on a real task.

Example:

```markdown
---
name: api-review
description: Inspect API compatibility and validation with file-level evidence.
tools: [read, grep, find, ls]
tags: [api, review]
---
Inspect the requested scope. Return concrete findings and existing evidence paths.
Distinguish observed facts, uncertainties, and checks not run.
```

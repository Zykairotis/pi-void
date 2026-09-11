---
name: cognee-remember
description: Store data permanently in the Cognee knowledge graph with category tagging (user, project, or agent).
---

# Cognee permanent memory (ICE)

Store data in Cognee with a node_set category. Prefer the `/cognee remember` command (always available in `ice`).

## Categories

| Category | Node set | Use for |
|----------|----------|---------|
| **user** | `user_context` | Preferences, corrections, personal facts |
| **project** | `project_docs` | Architecture, APIs, deploy notes |
| **agent** | `agent_actions` | Explicit agent notes (routine tools are auto-captured) |

## Commands

```text
/cognee remember user_context <text>
/cognee remember project_docs <text>
/cognee remember agent_actions <text>
```

Background by default. Graph searchability may lag until cognify completes. Session-cache capture (prompts/tools) is automatic when `capture` is on — do not re-log routine tools here.

## When to use

- User says "remember this" → `user_context`
- "Remember about the project" → `project_docs`
- Persist your own conclusion → `agent_actions`

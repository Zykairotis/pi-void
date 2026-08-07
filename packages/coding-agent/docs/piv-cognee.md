# Pi Void Cognee memory (`piv-cognee`)

Claude Code–style Cognee integration for **`piv` only** (stock `pi` is unchanged).

Upstream reference: [topoteretes/cognee-integrations/integrations/claude-code](https://github.com/topoteretes/cognee-integrations/tree/main/integrations/claude-code).

Pi does not load Claude `hooks.json`. Parity is implemented with the **Pi extension event API**.

## Hook parity

| Claude Code | Pi event | Behavior |
|-------------|----------|----------|
| SessionStart | `session_start` | Session id, health check, “Memory Connected”, agent register, queue drain |
| UserPromptSubmit (recall) | `before_agent_start` | Scoped recall inject |
| UserPromptSubmit (store) | `before_agent_start` | Pending prompt for QA |
| PostToolUse | `tool_result` | TraceEntry (`/api/v1/remember/entry`) |
| Stop | `agent_end` | QAEntry |
| PreCompact | `session_before_compact` | Multi-scope memory anchor |
| SessionEnd | `session_shutdown` | `/improve` + unregister |
| Idle improve | `agent_settled` | Cooldown-gated improve (idle watcher analog) |
| Skills | `resources_discover` | `cognee-remember` / `cognee-search` / `cognee-sync` |

## Defaults

```json
{
  "enabled": true,
  "autoRecall": true,
  "autoRemember": "compaction",
  "captureSession": true,
  "captureTools": true,
  "autoImprove": true,
  "baseUrl": "http://127.0.0.1:8211",
  "dataset": "pi-void",
  "recallBudgetMs": 10000
}
```

Config: `~/.pi/agent/pi-cognee/config.json`
Also reads `COGNEE_*` from env and `~/.cognee/.env` (Claude/Codex shared; process env wins).
Does **not** auto-use `COGNEE_PLUGIN_DATASET=agent_sessions` — default dataset remains **`pi-void`**.

## Commands

```text
/cognee status | doctor
/cognee on | off
/cognee recall on|off
/cognee capture on|off
/cognee tools on|off
/cognee improve on|off | improve now
/cognee remember on|off
/cognee remember [user_context|project_docs|agent_actions] <text>
/cognee search <query>
/cognee flush [pending|uncertain]
```

## Ops

1. Start API: `/home/mewtwo/Zykairotis/cognee/scripts/start-local-api.sh`
2. Layer B LLM/Voyage keys from `~/.claude/settings.json` env into Zykairotis `.env`
3. Layer A key: `COGNEE_API_KEY` or `mint-api-key.sh` → `~/.cognee-plugin/api_key.json`
4. Rebuild: `npm run build` in monorepo (or coding-agent package)

## Cost

Continuous capture + improve costs Voyage/LLM on the server. Use `/cognee capture off` and `/cognee improve off` to return to recall + compaction-only mode.

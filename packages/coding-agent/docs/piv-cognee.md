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
  "compactionSummaryMode": "auto",
  "baseUrl": "http://127.0.0.1:8211",
  "dataset": "pi-void",
  "recallBudgetMs": 10000
}
```

## Blackhole cooperation

| Mode | Behavior |
|------|----------|
| **`auto` (recommended)** | If Blackhole is configured (`~/.pi/agent/pi-blackhole/...`), Cognee **does not** override the Pi compact summary. Blackhole writes the chat summary; Cognee stores a pre-compact memory anchor + queues the final summary on `session_compact`. |
| **`defer`** | Always defer summary (even without Blackhole). |
| **`own`** | Cognee returns the Pi compaction summary (standalone; can fight Blackhole). |

Balanced profile: `compactionSummaryMode: "auto"`, Blackhole mid-run compact, Cognee capture/recall/remember.

Config: `~/.pi/agent/pi-cognee/config.json`
API key: `~/.pi/agent/pi-cognee/api_key.json` with mode `0600`; process `COGNEE_API_KEY` wins, then this file, then the mint cache and shared `~/.cognee/.env`.
Also reads `COGNEE_*` from env and `~/.cognee/.env` (Claude/Codex shared).
Does **not** auto-use `COGNEE_PLUGIN_DATASET=agent_sessions` — default dataset remains **`pi-void`**.

## Commands

```text
/cognee status | watch | doctor
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

## Realtime observer

`/cognee watch` starts a loopback-only dashboard and reports its URL in the Pi UI. It reads the local
`~/.pi/agent/pi-cognee/observations.jsonl` stream and updates over SSE. The dashboard shows agent/session IDs,
dataset, Cognee endpoint, request lifecycle, latency, queue activity, failures, and capped redacted previews.

The observer is local instrumentation, not a second memory store. API keys are never written to the event stream;
previews are capped and passed through the same memory redaction rules as Cognee writes. The server closes with the
Pi session.

Recall transport accepts Cognee's bounded response envelope up to `128 KiB`, then keeps only the requested top-K
results. Prompt/context injection remains capped by `recallMaxChars`.

## Ops

1. Start API: `/home/mewtwo/Zykairotis/cognee/scripts/start-local-api.sh`
2. Layer B LLM/Voyage keys from `~/.claude/settings.json` env into Zykairotis `.env`
3. Layer A key: `~/.pi/agent/pi-cognee/api_key.json` (preferred), `COGNEE_API_KEY`, or `mint-api-key.sh` → `~/.cognee-plugin/api_key.json`
4. Rebuild: `npm run build` in monorepo (or coding-agent package)

## Cost

Continuous capture + improve costs Voyage/LLM on the server. Use `/cognee capture off` and `/cognee improve off` to return to recall + compaction-only mode.

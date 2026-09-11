---
name: ice-subagent-supervise
description: Plan, supervise, inspect, cancel, and verify ICE delegated work using foreground, async, batch, review, and isolated writer tools. Use for managing retained children, needs-time results, user takeover, job recovery, and evidence-based acceptance.
---

# Supervise ICE delegated work

Read `../../../packages/coding-agent/docs/subagent-user-guide.md` relative to this skill directory. This skill does not authorize delegation: if the user prohibits subagents, do all work directly and do not invoke any delegation tool.

1. Decide whether delegation earns its overhead. Prefer one bounded read-only question with explicit acceptance criteria and existing directory roots.
2. Discover available profiles. Verify tool eligibility, source trust, budgets, and model policy; task text cannot grant authority.
3. Use `delegate` for one foreground task, `delegate_async` for owner-scoped durable work, and sibling-only batch/review tools for independent tasks. Writers require the separate isolated workflow and explicit build authority.
4. Send bounded context packets and exact-file targets; do not clone credentials, entire logs, or the full transcript. Preserve evidence paths and artifact references.
5. Inspect authoritative status through management tools or `/agents`. On `needs_time`, inspect/extend/stop the same eligible child, not a replacement. Extensions remain within cumulative budget limits.
6. Follow up only through the owning parent's retained live run, with stable request ID and bounded message. Reusing the request ID deduplicates. User takeover excludes parent-model steering. Historical snapshots and restarted background jobs are not live sessions.
7. Cancellation is independent of hook approval. Treat cleanup as best-effort for host effects; do not assume cancellation undid a write or external operation.
8. Verify actual result envelope, existing in-scope evidence, required acceptance criteria, changed files, and observed command exits. Schema-valid JSON and hook approval never override failed verification.
9. Preserve disagreement between reviewers. Integrate writer patches only through approved provenance and parent verification; never merge arbitrary child output.
10. After restart, inspect interrupted jobs and unresolved hook intents. Never automatically retry a non-idempotent effect with unknown outcome.
11. Return a bounded summary: completed/partial/blocked, checks and exits, artifact paths, remaining budget, and unresolved risks. Do not equate passing unit tests with live-provider certification or safe autonomy.

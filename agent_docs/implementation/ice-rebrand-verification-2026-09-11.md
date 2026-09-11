# ICE rebrand verification record

Date: 2026-09-11
Branch: `feat/ice`
Environment: node v24.21.0, npm 12.0.2
Verified tip: `d5d7438ed`

## Scope

Records what was actually executed and observed for the commit range
`b919dc81f..d5d7438ed` (8 commits: three pre-existing checkpoints plus six
authored commits). Intended for review of the ICE rename, not as a substitute
for re-running the gates.

## Commits

| Commit | Subject |
|---|---|
| `868c78f6c` | rename pi/piv product surface to ICE |
| `b4b4d29a4` | subagent settings, routing, capability, and command-hook controls |
| `0824c6b7e` | pin the no-legacy compatibility contract |
| `19941cbac` | add piped stdin entrypoint |
| `3e075e68c` | ICE subagent guide and compatibility plans |
| `d5d7438ed` | retarget dead identity references |

## Commands run and observed results

| Command | Result |
|---|---|
| `npx biome check .` | exit 0, no diagnostics |
| `npx tsgo --noEmit` | exit 0 (3,929 files) |
| `npm run check:pinned-deps` | pass |
| `npm run check:ts-imports` | pass |
| `npm run check:shrinkwrap` | pass |
| `npm run check:install-lock:coding-agent` | pass |
| `npm run check:browser-smoke` | pass |
| `./test.sh` | exit 0, 0 failures |

Per-package test counts from the final run: scripts 1 passed; agent-core 177
passed / 1 skipped; ai 833 passed / 823 skipped; client 35; coding-agent 2505
passed / 48 skipped; evals 23; protocol 144; server 47; storage/sqlite-node 63.
These are identical to the pre-change baseline for the same tree.

## Required rebuild step

`packages/*/dist` is gitignored and was stale relative to `src` when testing
began. Tests that spawn the real CLI run from `dist`, so they failed with
`ERR_MODULE_NOT_FOUND` until `npm run build` was run. The suite passes only
after a rebuild; a stale `dist` produces 20 spurious failures. `npm run build`
does not clean `dist`, so orphaned outputs from deleted sources can persist
(for example `dist/core/legacy-compat/extension-aliases.js`, a fossil of a
removed source file that nothing imports).

## Deliberate exclusions

- `agent_docs/` was not rewritten. Those are dated research artifacts and
  their citations still reference `earendil-works/ice`, which does not exist.
  Rewriting them would falsify evidence rather than fix code.
- No push, merge, release, deploy, or credential change was performed; the
  remote state is unchanged by this work.

## Open items

- Intermediate commits are not independently resolvable. `868c78f6c` contains
  `src/main.ts`, which imports `./cli/piped-stdin.ts` created in `19941cbac`,
  and its renamed files reference `core/legacy-compat/*` created in
  `0824c6b7e`. Only the tip is verified; bisecting this range will not build.
- `.gitignore` now un-ignores `.ice/**` except `hf-sessions`. This was
  required because the repo's pre-commit hook re-stages every staged path, and
  `git add` refuses an ignored path. Consequence: new project-local state
  written under `.ice/` will appear as untracked rather than being hidden.
- Publishing `@zykairotis/ice-*` is not yet possible; the local npm token
  returned 401 Unauthorized, independent of the scope change.
- The fork's changelog history was reset to a single `[Unreleased]` section,
  removing roughly 8,670 lines. Pre-fork history lives upstream.

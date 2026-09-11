# ICE rebrand verification record

Date: 2026-09-11
Branch: `feat/ice`
Environment: Node v24.21.0, npm 12.0.2
Verified implementation tip: `e339a77c32ea40060c09c0541cb949da85406e6a`
Base ref observed on `origin`: `void` at `b919dc81fb9764675fa2695feebc0bc62f02acb4`

## Scope

Records the verification of the ICE rename, subagent controls, compatibility
contract, dependency-fork integration, publishing fixes, and workflow repair
through implementation tip `e339a77`. That implementation tip contains 18
commits after the `void` base, including the three pre-existing checkpoints.

## Commits

| Commit | Subject |
|---|---|
| `7cbd8a676` | checkpoint current work before subagents |
| `a0e530b8c` | snapshot subagent Cognee work |
| `c87052efb` | backup |
| `868c78f6c` | ICE product-surface rename |
| `b4b4d29a4` | subagent settings, routing, capabilities, and hooks |
| `0824c6b7e` | no-legacy compatibility contract |
| `19941cbac` | piped stdin entrypoint |
| `3e075e68c` | ICE subagent documentation |
| `d5d7438ed` | retarget dead identity references |
| `5778b7bc9` | verification evidence record |
| `4d4ecb2cc` | npm 12 publishing fixes, `ice-server`, package licenses, and release-branch fix |
| `e9c7e8394` | dependency cleanup, lockfile refresh, clipboard `0.3.10` integration, and validation scope |
| `57f798412` | npm 12 bootstrap before GitHub Actions package-manager caching |
| `1c9ad2d` | run CI on the `void` branch |
| `7794dcc` | handle empty interactive asset bundles |
| `7a61bb3` | record final CI verification |
| `e339a77` | drain Cognee observation writes on shutdown |

## Commands and observed results

| Command or gate | Result |
|---|---|
| `npm run check` | exit 0; Biome checked 1,100 ICE files, generated-lock validators, TypeScript, and browser smoke passed |
| `./test.sh` | exit 0; 2,505 tests passed, 48 skipped, 0 failures |
| Clipboard-focused Vitest tests | 2 files passed, 3 tests passed |
| `./node_modules/.bin/tsgo --noEmit` | exit 0 |
| `git diff --check` | passed |
| Generated lock validation | root lock, coding-agent shrinkwrap, and installer lock each contain 11 clipboard entries, all at `0.3.10` |
| Clipboard registry audit | all 11 `0.3.10` tarballs are public, correctly named/licensed, and contain their expected payloads |
| Published musl smoke tests | x86_64 and aarch64 musl native addons load in explicit Alpine containers with Node 24 |
| Active old dependency scan | no active `@mariozechner/clipboard`, `@earendil-works/gondolin`, or Gondolin repository references outside preserved historical material |
| `npm run build --workspace=@zykairotis/ice-coding-agent` | exit 0 after a clean coding-agent dist; zero interactive asset files were required |
| GitHub run `34581816479` | `CI / build-check-test` passed through setup, install, build, check, and test |
| GitHub run `34581816552` | `Publish Model Catalog / generate` passed through npm bootstrap, dependency installation, catalog generation, validation, and artifact upload |
| Cognee shutdown regression stress | `test/ice-cognee.test.ts` passed 10 consecutive runs after tracking observation writes in the shutdown drain |
| GitHub run `34583088457` | `CI / build-check-test` passed through setup, install, build, check, and test for `e339a77` |
| GitHub run `34583088504` | `Publish Model Catalog / generate` passed through setup, install, generation, validation, and artifact upload for `e339a77` |

The previous GitHub run `34580749063` failed before dependency installation
because `actions/setup-node` invoked runner npm 10.9.8 while reading
`devEngines.packageManager`. Commit `57f798412` disables automatic
package-manager caching in all seven `setup-node` steps until the explicit npm
12.0.2 bootstrap completes. The replacement catalog run passed that boundary.

The first full CI run after enabling the `void` branch, `34581464341`, reached
Build and exposed the stale unconditional PNG copy after the legacy announcement
asset was removed. Commit `7794dcc` removes those empty-glob copies while
retaining destination directories; CI run `34581816479` then passed build,
check, and test.

The documentation-only evidence commit `7a61bb3` triggered CI run `34582284763`,
which exposed one shutdown-test cleanup race: 2,504 tests passed, but
`test/ice-cognee.test.ts` failed with `ENOTEMPTY` while removing its temporary
storage directory. Commit `e339a77` tracks asynchronous observation writes in the
existing background drain. The targeted test passed 10 consecutive local runs,
and CI run `34583088457` passed the complete build, check, and test job.

## Required rebuild step

`packages/*/dist` is gitignored and can be stale relative to `src`. Tests that
spawn the real CLI must run after `npm run build`; otherwise stale or orphaned
outputs can produce `ERR_MODULE_NOT_FOUND` failures. The verified test run was
performed against a rebuilt tree.

## Published dependency state

- All eight first-party `@zykairotis/ice-*` packages are public at `0.83.0`, including `@zykairotis/ice-server`.
- The eleven-package clipboard fork family is public at `0.3.10`; both Linux musl packages contain native addons.
- The three-package Gondolin fork family is public at `0.12.0`.
- ICE lockfiles and `packages/coding-agent/package.json` resolve the clipboard wrapper and all platform entries at `0.3.10`.
- ICE trusted publishing is configured for the eight first-party packages. The dependency forks were bootstrapped manually with local npm 2FA; no credentials or OTPs are stored in ICE.

## Deliberate exclusions and external state

- `agent_docs/` retains dated historical citations and was not rewritten.
- The untracked `Agent_harness_references/` comparison tree is ignored and excluded from ICE validation. It was not modified or staged. The root check uses explicit ICE paths, and both recursive ICE scanners exclude the exact case-sensitive directory.
- Existing npm audit output reports four findings (three moderate, one high); no unrelated audit upgrade was applied.
- The fork changelog remains reset to ICE's `[Unreleased]` section, with pre-fork history preserved upstream.

## Review state and open items

- `feat/ice` is pushed with verified implementation tip `e339a77`; PR [#11](https://github.com/Zykairotis/ice/pull/11) is open from `feat/ice` into `void` and its description is being synchronized with the final evidence.
- The `void` remote ref was observed unchanged at `b919dc81...` during verification. The PR has not been merged; merge remains subject to review and explicit approval.
- The PR's external Cubic reviewer was still pending at the last status query.
- `.github/workflows/issue-analysis.yml` remains intentionally fail-closed until a real organization/team and `ZYKAIROTIS_ORG_READ_TOKEN` are provisioned.
- Intermediate commits are not independently bisectable; only the verified tip is the acceptance state.

# Read-Only Subagents v1 Benchmark

This directory contains the B8 release-gate inputs and comparative harness for Read-Only Subagents v1. It is benchmark tooling, not a production runtime dependency.

## Targets

`manifest.json` defines four comparison targets:

- `ice-stock`
- `ice-native-example`
- `ice-subagents`
- `ice`

External targets are pinned to immutable commits in `manifest.json`; the current local cache paths must resolve to those exact `HEAD` values before a full comparison can run. ICE resolves from the current workspace tree.

A target may use an existing local checkout or cache only when its `HEAD` exactly matches the manifest commit. Preparation is read-only: inspect files and commands, resolve `HEAD`, and validate the SHA. The harness never fetches, pulls, checks out, switches branches, upgrades dependencies, rewrites target configuration, or substitutes a newer revision.

Unavailable or mismatched targets fail closed with:

```text
benchmark target <id>@<sha> unavailable
```

The adapters invoke the targets through their supported CLI interfaces: stock Ice through `ice`, the native example through `ice --extension`, `ice-subagents` through a pinned Ice host plus its extension entry point, and ICE through `ice`. Target-specific failures remain result data rather than being converted into passes.

Every result records the resolved commit and provider/model route. Portable JSONL must not contain raw prompts, transcripts, credentials, full child output, or absolute checkout paths. Bounded detail artifacts are separate from the result rows.

## Provider Routes

`manifest.json` versions two endpoint routes using the upstream Ice `openai` provider and the local OpenAI-compatible endpoint:

- `cx/gpt-5.6-luna`
- `cmc/deepseek/deepseek-v4-pro`

Each child gets a temporary `models.json` containing only the selected route metadata. The credential is inherited from `ICE_LOCAL_API_KEY`; no key is written to the manifest, result JSONL, temporary model configuration, or an isolated `auth.json`.

Run one trivial provider smoke per model before any scenario matrix:

```bash
node benchmarks/read-only-subagents/src/cli.ts --smoke --model cx/gpt-5.6-luna
node benchmarks/read-only-subagents/src/cli.ts --smoke --model cmc/deepseek/deepseek-v4-pro
```

The smoke requires completed agent output from all four targets. Missing credentials fail before target preparation or process spawn:

```text
benchmark provider credential ICE_LOCAL_API_KEY unavailable
```

## Execution

The CLI modes are:

```text
--target ice
    local development and adversarial debugging mode

--matrix --model <model> --class <class>
    release comparison mode for one selected provider route and scenario class; all four pinned targets are required

--scenario <id>
    targeted debugging or reproduction

--class deterministic|model_quality
    restrict matrix execution to one scenario class

--repeat <n>
    repeated runs for scenarios classified as model_quality
```

Deterministic scenarios reject `--repeat > 1` unless a future scenario explicitly declares repetition support. Model-quality repetitions preserve the repeat index and benchmark provenance.

The benchmark inputs are `manifest.json` and `scenarios.json`. Outputs are local artifacts under `results/`, which is ignored and created on demand. Do not treat a ICE-only run or provider smoke as full release evidence.

## B8 boundary

Allowed changes:

- benchmark harness and adapters;
- deterministic adversarial tests;
- fixes directly justified by a benchmark or adversarial finding;
- regression tests for those fixes;
- documentation of measured weaknesses.

Not part of B8:

- fallback models;
- new delegation roles;
- writers;
- background jobs;
- steering;
- persistent memory;
- Hivemind;
- new production orchestration primitives.

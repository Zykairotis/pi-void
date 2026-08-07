# Pi Blackhole Provenance

This optional extension adapts deterministic compaction code from `pi-blackhole` version `0.4.3`.

- Upstream: https://github.com/k0valik/pi-blackhole
- Package: `pi-blackhole@0.4.3`
- License: MIT; see `LICENSE`
- Original compaction implementation: pi-vcc, as identified in the upstream source headers
- Local purpose: Pi Void optional compaction engine and mid-run trigger

Adapted source files retain their upstream provenance comments. Pi Void changes are limited to:

- removing observational-memory workers and recall from this optional initial integration;
- using Pi's `session_before_compact`, `turn_end`, and `agent_end` extension seams;
- adding mutually exclusive `compactAfterPercent` and `compactAfterTokens` threshold modes;
- resolving percentage thresholds from the active model context window;
- preserving Pi's `pi-default` retained tail behavior by default; and
- resuming through Pi's existing continuation message path.

This extension is optional and is not part of Pi's default extension set. It does not create a second agent loop, model registry, session store, or compaction persistence layer.

# Changelog

> This fork resets its changelog at the ICE rename. Pre-fork release history lives upstream at https://github.com/earendil-works/pi.

## [Unreleased]

### Breaking Changes

- Renamed the package to `@zykairotis/ice-server` and removed all previous product identifiers from the protocol adapters and public API.
- Changed `toProtocolToolResultMessage()` to require the original `ToolCall` and verify tool result association.

### Fixed

- Hardened protocol adapters against contradictory lifecycle states, invalid identifiers and timestamps, sparse execution arrays, and additive `ice-ai` contract drift.

> Release notes for versions published under the previous product identity are not reproduced here. They are preserved in the archived source repository and in prior Git history.

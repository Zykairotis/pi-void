# Changelog

> This fork resets its changelog at the ICE rename. Pre-fork release history lives upstream at https://github.com/earendil-works/pi.

## [Unreleased]

### Breaking Changes

- Renamed the package to `@zykairotis/ice-protocol` and removed all previous product identifiers from the schemas, codecs and framing.
- Restricted assistant and tool transcript lifecycle schemas to valid state combinations and terminal items.

### Added

- Added `ultra` to the protocol thinking-level schema ([#5](https://github.com/Zykairotis/ice/pull/5)).
- Added transport-neutral CBOR protocol schemas, codecs, and length-prefixed framing for remote ice sessions.

> Release notes for versions published under the previous product identity are not reproduced here. They are preserved in the archived source repository and in prior Git history.

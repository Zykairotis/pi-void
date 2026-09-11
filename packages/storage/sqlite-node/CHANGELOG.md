# Changelog

## [Unreleased]

### Breaking Changes

- Renamed the package to `@zykairotis/ice-storage-sqlite-node` and removed all previous product identifiers from the storage API.
- Replaced the legacy SQLite session schema and repository with the v4 lane-based `SessionRepo` contract. Existing work-in-progress databases are not migrated.

### Added

- Added bounded active-branch queries, durable operation records, global facts, shared sequence allocation, session statistics, and fenced writer leases to the SQLite backend.

> Release notes for versions published under the previous product identity are not reproduced here. They are preserved in the archived source repository and in prior Git history.

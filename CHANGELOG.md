# Changelog

All notable changes to this project are documented in this file.

The format is based on Keep a Changelog and this project adheres to Semantic Versioning.

## [Unreleased]

- No unreleased changes.

## [0.2.2] - 2026-04-10

### Fixed

- Improved fnMap attribution, including unmatched fallback handling when mapping Istanbul coverage to TypeScript functions.
- Made coverage path handling and compatibility-matrix coverage fixtures work across Windows absolute paths and cross-platform test environments.

### Changed

- Added direct self-gate coverage for the Jest adapter so repository gating exercises the published Jest integration path.

## [0.2.1] - 2026-04-08

### Changed

- Switched npm publishing to pure Trusted Publishing.
- Documented release provenance behavior for published packages.

## [0.2.0] - 2026-04-08

### Added

- Published the initial `@barney-media` package set for the CLI, core library, and Vitest and Jest adapters.

### Fixed

- Corrected the release package contents for the first public `@barney-media` release line.

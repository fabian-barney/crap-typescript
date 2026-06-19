# Changelog

All notable changes to this project are documented in this file.

The format is based on Keep a Changelog and this project adheres to Semantic Versioning.

## [Unreleased]

- No unreleased changes.

## [0.4.2] - 2026-06-19

### Changed

- Updated vite from 8.0.15 to 8.0.16.

## [0.4.1] - 2026-06-01

### Changed

- Updated CI and release tooling used by the release pipeline.

### Fixed

- Fixed ambiguous coverage source matching when multiple workspace paths share the same suffix.

## [0.4.0] - 2026-05-24

### Added

- Added configurable source exclusions for generated or external TypeScript sources, including path globs, path regexes, function-name regexes, comment markers, and optional default exclusions.
- Added deterministic report sorting, GitLab-compatible JUnit XML output, Bun package-manager detection, and stricter report-path containment and package-manager validation.
- Added stronger CI and release validation coverage, including platform-matrix builds, lint enforcement, package-version verification, release-artifact assembly, and self-gate release checks.

### Changed

- Hardened changed-file analysis, coverage-report fallback behavior, and coverage-command diagnostics across Windows, macOS, and Linux workflows.
- Expanded the CLI, core library, and Jest and Vitest adapters to handle richer parser diagnostics, constructor and optional-chaining cases, and clearer threshold and exit-code messaging.

### Fixed

- Fixed parse-span and source-position validation around malformed coverage input, fixture-backed compatibility cases, and container/body attribution edge cases.
- Fixed reporter and release-note rendering behavior so empty or partial report artifacts fail early instead of silently generating invalid output.

## [0.3.0] - 2026-05-10

### Added

- Added configurable CRAP thresholds across the CLI, core formatter, and Jest and Vitest adapters, including warning guidance for unusually strict or lenient values.
- Added TOON and JUnit report formatting, full JUnit sidecar generation for CI consumers, and the `--failures-only`, `--omit-redundancy`, `--format none`, and `--agent` primary-report controls.
- Added the repository `cognitive-typescript` gate and CI enforcement for published package sources.

### Changed

- Changed the Jest and Vitest adapters to default their primary report to `none`, emit a full JUnit sidecar by default, and derive the sidecar path from the configured coverage report location.
- Renamed the public report option surface to the current `format`, `output`, `junit`, and `junitReport` naming across the CLI and adapters.
- Declared the published packages as ESM via `type: "module"` and switched report serialization to the official TOON encoder and XML builder implementations.
- Expanded the README, package READMEs, and specification to document the current CLI, core, and adapter reporting behavior.

### Fixed

- Fixed `--help` option validation and release-notes rendering.
- Fixed empty JUnit report generation and report-method status handling in formatted outputs.
- Aligned threshold warning boundaries with the documented threshold guidance.

## [0.2.3] - 2026-04-27

### Fixed

- Updated `postcss` from 8.5.8 to 8.5.12.

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

# crap-typescript

`crap-typescript` is a shared CRAP metric toolkit for TypeScript projects.

It combines cyclomatic complexity with function-level coverage derived from Istanbul statement and branch counters and reports CRAP scores for concrete TypeScript function bodies. The repository publishes a standalone CLI plus dedicated Vitest and Jest adapters.

## Modules

- `packages/core`: analysis engine, CLI orchestration, coverage detection, and report formatting
- `packages/cli`: executable `crap-typescript` package
- `packages/vitest`: helper that enables the canonical Istanbul JSON coverage output and fails Vitest runs when the CRAP threshold is exceeded
- `packages/jest`: helper and reporter for Jest runs

## Formula

`CRAP = CC^2 * (1 - coverage)^3 + CC`

- `CC` is cyclomatic complexity.
- `coverage` is defined separately as the minimum of the function's statement coverage and branch coverage.
- Structural non-applicability is treated as `100%` for the affected component metric only when the analyzer can prove it.
- Unknown coverage remains `N/A`, and CRAP remains `N/A` for that function.

## Coverage Pipeline

For each resolved module today:

1. Detect the nearest module root by walking up to the closest `package.json`.
2. Reuse `coverage/coverage-final.json` when it already exists.
3. Otherwise auto-detect the package manager and test runner unless the CLI forces them.
4. Run the module tests with JSON coverage enabled.
5. Read `coverage/coverage-final.json` from the module root, falling back to the project root for workspace coverage.
6. Use Istanbul `fnMap` as a validation and secondary matching aid when it is present.
7. Derive function statement and branch coverage from the Istanbul coverage counters and use their minimum as CRAP coverage.

## Compatibility Matrix

Verified and unverified coverage-attribution shapes are tracked in [docs/compatibility-matrix.md](docs/compatibility-matrix.md). The matrix is backed by golden fixtures under `tests/fixtures/compatibility-matrix/`.

## Build and Test

```bash
npm ci
npm run build
npm test
npm run crap-typescript-check
npm pack --workspaces
```

`npm run crap-typescript-check` runs the repository through its own CRAP threshold gate for the published package sources under `packages/`.

## Install

CLI:

```bash
npm install --save-dev @barney-media/crap-typescript
```

Vitest adapter:

```bash
npm install --save-dev @barney-media/crap-typescript-vitest
```

Jest adapter:

```bash
npm install --save-dev @barney-media/crap-typescript-jest jest
```

## Run

From the project root you want to analyze:

```bash
npx crap-typescript
```

## CLI

```text
--help                       Print usage to stdout
(no args)                    Analyze all TypeScript files under any nested src/ tree
--changed                    Analyze changed TypeScript files under src/
--package-manager <tool>     Force auto, npm, pnpm, or yarn
--test-runner <runner>       Force auto, vitest, or jest
--format <format>            Emit toon, json, text, or junit (default: toon)
--agent                      Emit only overall status and failed methods for toon, json, or text
--output <path>              Write the primary report to a file instead of stdout
--junit-report <path>        Also write a full JUnit XML report for CI test-report UIs
<file ...>                   Analyze explicit TypeScript files
<directory ...>              Analyze TypeScript files under each directory's nested src/ tree
```

Examples:

```bash
npx crap-typescript --help
npx crap-typescript
npx crap-typescript --changed
npx crap-typescript --package-manager npm --test-runner vitest
npx crap-typescript --format json --output reports/crap.json
npx crap-typescript --agent --junit-report reports/crap-junit.xml
npx crap-typescript src/sample.ts
npx crap-typescript packages/api packages/web
```

## Report Formats

The CLI defaults to TOON output for compact, agent-readable reports. `--format` can select `toon`, `json`, `text`, or `junit`.

Primary reports expose overall `status` and the run-level `threshold`. Per-function entries use the shared fields `status`, `crap`, `cc`, `cov`, `covKind`, `func`, `src`, `lineStart`, and `lineEnd`. Method-level entries never repeat `threshold`.

`--agent` is a filtering mode, not a report format. It is available with `toon`, `json`, and `text`; it keeps the overall `status` and `threshold`, includes failed methods only, and omits method-level `status` because included method entries are implicitly failed.

Use `--junit-report <path>` to write a full JUnit XML artifact alongside the primary report. JUnit output keeps the aggregate XML attributes required by CI parsers, writes `threshold` as a testsuite property, and puts method details on each testcase.

## Adapter Usage

Vitest:

```js
import { withCrapTypescriptVitest } from "@barney-media/crap-typescript-vitest";

export default withCrapTypescriptVitest({
  test: {
    include: ["test/**/*.test.ts"]
  }
});
```

The Vitest adapter prints text output by default and writes `coverage/crap-typescript-junit.xml` for CI test-report UIs. Pass `format`, `agent`, `outputPath`, or `junitReportPath` in the adapter options to customize reporting. Set `junitReportPath: false` to disable the JUnit artifact.

Jest:

```js
import { withCrapTypescriptJest } from "@barney-media/crap-typescript-jest";

export default withCrapTypescriptJest({
  testEnvironment: "node"
});
```

The Jest adapter prints text output by default and writes `coverage/crap-typescript-junit.xml` for CI test-report UIs. Pass `format`, `agent`, `outputPath`, or `junitReportPath` in the adapter options to customize reporting. Set `junitReportPath: false` to disable the JUnit artifact.

## Exit Codes

- `0` success, threshold respected
- `1` invalid CLI usage or execution failure
- `2` CRAP threshold exceeded (`> 8.0`)

## Release

Update `CHANGELOG.md` with the tagged version entry before releasing. Tag `v<version>` from `main` after the build workflow is green. The tag-triggered release workflow verifies the package versions, renders the GitHub release notes from `CHANGELOG.md`, publishes the four npm packages, and creates the GitHub release.

## Contributing

See `CONTRIBUTING.md` for the issue-linked branch, commit, and pull-request flow used in this repository.

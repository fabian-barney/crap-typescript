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
--agent                      Default primary output to toon, failures-only, omit-redundancy
--failures-only[=true|false] Emit failed methods only in the primary report
--omit-redundancy[=true|false] Omit redundant per-function status in the primary report
--output <path>              Write the primary report to a file instead of stdout
--junit-report <path>        Also write a full JUnit XML report for CI test-report UIs
--threshold <number>         Override the CRAP threshold (`8.0` by default)
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
npx crap-typescript --failures-only --format json
npx crap-typescript --omit-redundancy --format toon
npx crap-typescript --agent --junit-report reports/crap-junit.xml
npx crap-typescript --threshold 6
npx crap-typescript src/sample.ts
npx crap-typescript packages/api packages/web
```

## Report Formats

The CLI defaults to TOON output for compact, agent-readable reports. `--format` can select `toon`, `json`, `text`, or `junit`.

Primary reports expose overall `status` and the run-level `threshold`. Per-function entries use the shared fields `status`, `crap`, `cc`, `cov`, `covKind`, `func`, `src`, `lineStart`, and `lineEnd`. Method-level entries never repeat `threshold`.

Use `--failures-only` to keep run-level metadata but emit only failed function entries in the primary report. `--failures-only=true` and `--failures-only=false` are accepted for explicit boolean configuration.

Use `--omit-redundancy` to keep run-level metadata but omit per-function `status` in the primary report. With `--format junit`, it omits the custom testcase `status` property while preserving JUnit failure and skipped elements. The value can also be assigned explicitly with `--omit-redundancy=true` or `--omit-redundancy=false`.

`--agent` is a composite shortcut, not a report format. It defaults primary output to `--format toon`, `--failures-only=true`, and `--omit-redundancy=true`. Explicit `--format`, `--failures-only=false`, or `--omit-redundancy=false` options override those defaults.

Use `--junit-report <path>` to write a full JUnit XML artifact alongside the primary report. JUnit sidecars always contain the full method set, regardless of `--failures-only` or `--omit-redundancy`. JUnit output keeps the aggregate XML attributes required by CI parsers, writes `threshold` as a testsuite property, and puts method details on each testcase.

The default threshold is `8.0`. Values below `4.0` print a warning because they are likely too noisy; values above `8.0` print a warning because they are too lenient even for hard gates. The warning recommends `8.0` for hard gates, targeting `6.0` during implementation, and using the `8.0` default when in doubt.

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

The Vitest adapter prints text output by default and writes `coverage/crap-typescript-junit.xml` for CI test-report UIs. Pass `format`, `agent`, `output`, `junit`, `junitReport`, or `threshold` in the adapter options to customize reporting. Set `junit: false` to disable the JUnit artifact.

Jest:

```js
import { withCrapTypescriptJest } from "@barney-media/crap-typescript-jest";

export default withCrapTypescriptJest({
  testEnvironment: "node"
});
```

The Jest adapter prints text output by default and writes `coverage/crap-typescript-junit.xml` for CI test-report UIs. Pass `format`, `agent`, `output`, `junit`, `junitReport`, or `threshold` in the adapter options to customize reporting. Set `junit: false` to disable the JUnit artifact.

## Exit Codes

- `0` success, threshold respected
- `1` invalid CLI usage or execution failure
- `2` CRAP threshold exceeded (`> configured threshold`)

## Release

Update `CHANGELOG.md` with the tagged version entry before releasing. Tag `v<version>` from `main` after the build workflow is green. The tag-triggered release workflow verifies the package versions, renders the GitHub release notes from `CHANGELOG.md`, publishes the four npm packages, and creates the GitHub release.

## Contributing

See `CONTRIBUTING.md` for the issue-linked branch, commit, and pull-request flow used in this repository.

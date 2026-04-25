# crap-typescript

`crap-typescript` is a shared CRAP metric toolkit for TypeScript projects.

It combines cyclomatic complexity with function-level coverage derived from Istanbul statement and branch counters and reports CRAP scores for concrete TypeScript function bodies. The repository publishes a standalone CLI plus dedicated Vitest and Jest adapters. The CLI can also drive Angular CLI Karma/Jasmine test suites when they emit Istanbul JSON coverage.

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
--test-runner <runner>       Force auto, vitest, jest, or karma
--coverage-report-path <path>
                             Reuse or generate a custom Istanbul JSON coverage report path
<file ...>                   Analyze explicit TypeScript files
<directory ...>              Analyze TypeScript files under each directory's nested src/ tree
```

Examples:

```bash
npx crap-typescript --help
npx crap-typescript
npx crap-typescript --changed
npx crap-typescript --package-manager npm --test-runner vitest
npx crap-typescript --test-runner karma --coverage-report-path coverage/app/coverage-final.json
npx crap-typescript src/sample.ts
npx crap-typescript packages/api packages/web
```

## Adapter Usage

Vitest:

```js
const { withCrapTypescriptVitest } = require("@barney-media/crap-typescript-vitest");

module.exports = withCrapTypescriptVitest({
  test: {
    include: ["test/**/*.test.ts"]
  }
});
```

Jest:

```js
const { withCrapTypescriptJest } = require("@barney-media/crap-typescript-jest");

module.exports = withCrapTypescriptJest({
  testEnvironment: "node"
});
```

Karma/Jasmine for Angular or Ionic:

```bash
npx crap-typescript --test-runner karma
```

The Karma path runs `ng test --watch=false --code-coverage`, then reads Istanbul JSON from `coverage/coverage-final.json` unless `--coverage-report-path` is provided. For older Angular/Karma projects, make sure `karma.conf.js` writes JSON coverage at that path:

```js
coverageReporter: {
  dir: require("path").join(__dirname, "./coverage"),
  reporters: [
    { type: "html" },
    { type: "text-summary" },
    { type: "json", subdir: ".", file: "coverage-final.json" }
  ]
}
```

## Exit Codes

- `0` success, threshold respected
- `1` invalid CLI usage or execution failure
- `2` CRAP threshold exceeded (`> 8.0`)

## Release

Update `CHANGELOG.md` with the tagged version entry before releasing. Tag `v<version>` from `main` after the build workflow is green. The tag-triggered release workflow verifies the package versions, renders the GitHub release notes from `CHANGELOG.md`, publishes the four npm packages, and creates the GitHub release.

## Contributing

See `CONTRIBUTING.md` for the issue-linked branch, commit, and pull-request flow used in this repository.

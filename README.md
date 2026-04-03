# crap-typescript

`crap-typescript` is a shared CRAP metric toolkit for TypeScript projects.

It combines cyclomatic complexity with LCOV line coverage and reports CRAP scores for concrete TypeScript function bodies. The repository publishes a standalone CLI plus dedicated Vitest and Jest adapters.

## Modules

- `packages/core`: analysis engine, CLI orchestration, coverage detection, and report formatting
- `packages/cli`: executable `crap-typescript` package
- `packages/vitest`: helper that enables LCOV output and fails Vitest runs when the CRAP threshold is exceeded
- `packages/jest`: helper and reporter for Jest runs

## Formula

`CRAP = CC^2 * (1 - coverage)^3 + CC`

- `CC` is cyclomatic complexity.
- `coverage` is the covered executable line fraction for the function.

## Coverage Pipeline

For each resolved module today:

1. Detect the nearest module root by walking up to the closest `package.json`.
2. Reuse `coverage/lcov.info` when it already exists.
3. Otherwise auto-detect the package manager and test runner unless the CLI forces them.
4. Run the module tests with LCOV enabled.
5. Read `coverage/lcov.info` from the module root, falling back to the project root for workspace coverage.
6. Analyze the selected TypeScript files for that module.

## Build and Test

```bash
npm ci
npm run build
npm test
npm pack --workspaces
```

## Install

CLI:

```bash
npm install --save-dev crap-typescript
```

Vitest adapter:

```bash
npm install --save-dev crap-typescript-vitest
```

Jest adapter:

```bash
npm install --save-dev crap-typescript-jest jest
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
<file ...>                   Analyze explicit TypeScript files
<directory ...>              Analyze TypeScript files under each directory's nested src/ tree
```

Examples:

```bash
npx crap-typescript --help
npx crap-typescript
npx crap-typescript --changed
npx crap-typescript --package-manager npm --test-runner vitest
npx crap-typescript src/sample.ts
npx crap-typescript packages/api packages/web
```

## Adapter Usage

Vitest:

```js
const { withCrapTypescriptVitest } = require("crap-typescript-vitest");

module.exports = withCrapTypescriptVitest({
  test: {
    include: ["test/**/*.test.ts"]
  }
});
```

Jest:

```js
const { withCrapTypescriptJest } = require("crap-typescript-jest");

module.exports = withCrapTypescriptJest({
  testEnvironment: "node"
});
```

## Exit Codes

- `0` success, threshold respected
- `1` invalid CLI usage or execution failure
- `2` CRAP threshold exceeded (`> 8.0`)

## Release

Tag `v<version>` from `main` after the build workflow is green. The tag-triggered release workflow verifies the package versions, publishes the four npm packages, and creates the GitHub release.

## Contributing

See `CONTRIBUTING.md` for the issue-linked branch, commit, and pull-request flow used in this repository.


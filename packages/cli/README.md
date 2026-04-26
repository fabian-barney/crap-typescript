# @barney-media/crap-typescript

CLI for CRAP (Change Risk Anti-Pattern) metric analysis in TypeScript projects.

## Install

```bash
npm install --save-dev @barney-media/crap-typescript
```

## Usage

```bash
npx crap-typescript
npx crap-typescript --changed
npx crap-typescript --format json --output reports/crap.json
npx crap-typescript --agent --junit-report reports/crap-junit.xml
npx crap-typescript src/sample.ts
npx crap-typescript packages/api packages/web
```

## Options

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

The default `toon` format is compact and agent-readable. Primary reports include run-level `status` and `threshold`; method rows use `status`, `crap`, `cc`, `cov`, `covKind`, `func`, `src`, `lineStart`, and `lineEnd`. `--agent` is a filtering mode, not a format: it keeps the overall `status` and `threshold`, includes failed method entries only, and omits method-level `status`.

## Exit Codes

- `0` success, threshold respected
- `1` invalid CLI usage or execution failure
- `2` CRAP threshold exceeded (> 8.0)

See the [main documentation](https://github.com/fabian-barney/crap-typescript) for full details.

## License

[Apache-2.0](https://github.com/fabian-barney/crap-typescript/blob/main/LICENSE)

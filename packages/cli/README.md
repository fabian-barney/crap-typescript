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
npx crap-typescript --threshold 6
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
--failures-only[=true|false] Emit failed methods only in the primary report
--omit-redundancy[=true|false] Omit redundant per-function status in the primary report
--output <path>              Write the primary report to a file instead of stdout
--junit-report <path>        Also write a full JUnit XML report for CI test-report UIs
--threshold <number>         Override the CRAP threshold (`8.0` by default)
<file ...>                   Analyze explicit TypeScript files
<directory ...>              Analyze TypeScript files under each directory's nested src/ tree
```

The default `toon` format is compact and agent-readable. Primary reports include run-level `status` and `threshold`; method rows use `status`, `crap`, `cc`, `cov`, `covKind`, `func`, `src`, `lineStart`, and `lineEnd`. `--failures-only`, `--failures-only=true`, and `--failures-only=false` control whether the primary report includes only failed method entries. `--omit-redundancy`, `--omit-redundancy=true`, and `--omit-redundancy=false` control whether primary report method rows omit `status`; with `--format junit`, they omit the custom testcase `status` property while preserving JUnit failure and skipped elements. JUnit sidecar reports always include the full method set and method status. `--agent` is a filtering mode, not a format: it keeps the overall `status` and `threshold`, includes failed method entries only, and omits method-level `status`.

The default threshold is `8.0`. Values below `4.0` print a warning because they are likely too noisy; values above `8.0` print a warning because they are too lenient even for hard gates.

## Exit Codes

- `0` success, threshold respected
- `1` invalid CLI usage or execution failure
- `2` CRAP threshold exceeded (> configured threshold)

See the [main documentation](https://github.com/fabian-barney/crap-typescript) for full details.

## License

[Apache-2.0](https://github.com/fabian-barney/crap-typescript/blob/main/LICENSE)

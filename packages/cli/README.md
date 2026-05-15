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
npx crap-typescript --exclude 'packages/api/generated/**'
npx crap-typescript --exclude-path-regex '^src/proto/'
npx crap-typescript --exclude-generated-marker '@custom-generated'
npx crap-typescript src/sample.ts
npx crap-typescript packages/api packages/web
```

## Options

```text
--help                       Print usage to stdout
(no args)                    Analyze all TypeScript files under any nested src/ tree
--changed                    Analyze changed TypeScript files under src/
--exclude <glob>             Exclude source paths by normalized relative glob; repeatable
--exclude-path-regex <regex> Exclude source paths by normalized relative regex; repeatable
--exclude-generated-marker <marker> Exclude leading generated-header markers; repeatable
--use-default-exclusions[=true|false] Enable generated-code defaults (`true` by default)
--package-manager <tool>     Force auto, npm, pnpm, or yarn
--test-runner <runner>       Force auto, vitest, or jest
--format <format>            Emit toon, json, text, junit, or none (default: toon)
--agent                      Default primary output to toon, failures-only, omit-redundancy
--failures-only[=true|false] Emit failed methods only in the primary report
--omit-redundancy[=true|false] Omit redundant per-method status in the primary report
--output <path>              Write the primary report to a file instead of stdout
--junit-report <path>        Also write a full JUnit XML report for CI test-report UIs
--threshold <number>         Override the CRAP threshold (`8.0` by default)
<file ...>                   Analyze explicit TypeScript files
<directory ...>              Analyze TypeScript files under each directory's nested src/ tree
```

The default `toon` format is compact and agent-readable. Primary reports include run-level `status` and `threshold`; method rows use `status`, `crap`, `cc`, `cov`, `covKind`, `method`, `src`, `lineStart`, and `lineEnd`, with `src` set to the project-relative source file path. `--format none` suppresses primary stdout output; when used with `--output`, it creates an empty primary report file. `--failures-only`, `--failures-only=true`, and `--failures-only=false` control whether the primary report includes only failed method entries. `--omit-redundancy`, `--omit-redundancy=true`, and `--omit-redundancy=false` control whether primary report method rows omit `status`; with `--format junit`, they omit the custom testcase `status` property while preserving JUnit failure and skipped elements. JUnit sidecar reports always include the full method set and method status, regardless of `--agent`, `--failures-only`, or `--omit-redundancy`. JUnit XML is shaped for GitLab's Tests tab with a `<testsuites>` wrapper, testcase `classname`/`file` source paths, `method:lineStart` testcase names, `time="0"`, and failure/skipped text containing CRAP score, threshold, coverage kind, source path, and line range. `--agent` is a composite shortcut, not a format: it defaults primary output to `--format toon`, `--failures-only=true`, and `--omit-redundancy=true`. Explicit `--format`, `--failures-only=false`, or `--omit-redundancy=false` options override those defaults.

Baseline analyzability exclusions always skip declarations, test/spec files, `__tests__/`, `dist/`, `coverage/`, and `node_modules/`. Generated-code defaults then exclude generated directory segments, exact `gen` directory segments, common generated filename suffixes, protobuf outputs, Angular generated artifacts, and leading generated-header markers before the first non-comment token. User exclusions compose with those defaults unless `--use-default-exclusions=false`; disabling defaults does not disable the baseline analyzability filter.

Full primary reports and JUnit sidecars include source-exclusion audit counts when files were excluded. Default agent primary output omits those details.

The default threshold is `8.0`. Values below `4.0` print a warning because they are likely too noisy; values above `8.0` print a warning because they are too lenient even for hard gates.

## Exit Codes

- `0` success, threshold respected
- `1` invalid CLI usage or execution failure
- `2` CRAP threshold exceeded (> configured threshold)

See the [main documentation](https://github.com/fabian-barney/crap-typescript) for full details.

## License

[Apache-2.0](https://github.com/fabian-barney/crap-typescript/blob/main/LICENSE)

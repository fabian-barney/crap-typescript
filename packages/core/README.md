# @barney-media/crap-typescript-core

Core analysis engine for computing CRAP (Change Risk Anti-Pattern) scores on TypeScript projects. Combines cyclomatic complexity with function-level Istanbul coverage data.

## Install

```bash
npm install @barney-media/crap-typescript-core
```

## API

```ts
import { analyzeProject, formatAnalysisReport } from "@barney-media/crap-typescript-core";

const result = await analyzeProject({ projectRoot: "." });
const report = formatAnalysisReport(result.metrics, { format: "toon" });
console.log(report);
```

Key exports: `analyzeProject`, `calculateCrapScore`, `formatAnalysisReport`, `formatReport`, `parseCoverageReport`, `parseFileMethods`.

`formatAnalysisReport` supports `toon`, `json`, `text`, `junit`, and `none`. Primary reports expose run-level `status` and `threshold`; method-level entries use `status`, `crap`, `cc`, `cov`, `covKind`, `func`, `src`, `lineStart`, and `lineEnd`. `format: "none"` returns empty primary content. Pass `failuresOnly: true` to include failed method entries only. Pass `omitRedundancy: true` to omit method-level `status` while keeping run-level metadata; with `format: "junit"`, this omits the custom testcase `status` property while preserving JUnit failure and skipped elements. JUnit writes `threshold` as a testsuite property. Pass `agent: true` to default `failuresOnly` and `omitRedundancy` to `true`; explicit `failuresOnly: false` or `omitRedundancy: false` overrides those defaults.

## Formula

`CRAP = CC^2 * (1 - coverage)^3 + CC`

See the [main documentation](https://github.com/fabian-barney/crap-typescript) for full details.

## License

[Apache-2.0](https://github.com/fabian-barney/crap-typescript/blob/main/LICENSE)

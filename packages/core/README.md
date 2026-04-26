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

`formatAnalysisReport` supports `toon`, `json`, `text`, and `junit`. The root report has only overall `status`; method-level entries contain CRAP score, threshold, complexity, coverage percent, coverage kind, source path, and line range. Pass `agent: true` with `toon`, `json`, or `text` to include failed methods only.

## Formula

`CRAP = CC^2 * (1 - coverage)^3 + CC`

See the [main documentation](https://github.com/fabian-barney/crap-typescript) for full details.

## License

[Apache-2.0](https://github.com/fabian-barney/crap-typescript/blob/main/LICENSE)

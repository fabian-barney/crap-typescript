# crap-typescript-core

Core analysis engine for computing CRAP (Change Risk Anti-Pattern) scores on TypeScript projects. Combines cyclomatic complexity with function-level Istanbul coverage data.

## Install

```bash
npm install crap-typescript-core
```

## API

```ts
import { analyzeProject, formatReport } from "crap-typescript-core";

const result = await analyzeProject({ projectRoot: "." });
const report = formatReport(result.metrics);
console.log(report);
```

Key exports: `analyzeProject`, `calculateCrapScore`, `formatReport`, `parseCoverageReport`, `parseFileMethods`.

## Formula

`CRAP = CC^2 * (1 - coverage)^3 + CC`

See the [main documentation](https://github.com/fabian-barney/crap-typescript) for full details.

## License

[Apache-2.0](https://github.com/fabian-barney/crap-typescript/blob/main/LICENSE)

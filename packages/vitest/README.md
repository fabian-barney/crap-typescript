# @barney-media/crap-typescript-vitest

Vitest adapter for [crap-typescript](https://github.com/fabian-barney/crap-typescript). Enables Istanbul JSON coverage output and reports CRAP scores after test runs.

## Install

```bash
npm install --save-dev @barney-media/crap-typescript-vitest
```

## Setup

```js
import { withCrapTypescriptVitest } from "@barney-media/crap-typescript-vitest";

export default withCrapTypescriptVitest({
  test: {
    include: ["test/**/*.test.ts"]
  }
});
```

`withCrapTypescriptVitest` wraps your Vitest config to enable coverage collection and register the CRAP reporter. The test run fails when any function exceeds the CRAP threshold.

The reporter prints text output by default and writes `coverage/crap-typescript-junit.xml` for CI test-report UIs. Pass `format`, `agent`, `outputPath`, `junitReportPath`, or `threshold` in the adapter options to customize reporting. Set `junitReportPath: false` to disable the JUnit artifact. The default threshold is `8.0`; values below `4.0` or above `8.0` print the same threshold guidance warnings as the CLI.

See the [main documentation](https://github.com/fabian-barney/crap-typescript) for full details.

## License

[Apache-2.0](https://github.com/fabian-barney/crap-typescript/blob/main/LICENSE)

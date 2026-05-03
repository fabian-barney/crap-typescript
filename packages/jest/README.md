# @barney-media/crap-typescript-jest

Jest adapter for [crap-typescript](https://github.com/fabian-barney/crap-typescript). Enables Istanbul JSON coverage output and reports CRAP scores after test runs.

## Install

```bash
npm install --save-dev @barney-media/crap-typescript-jest
```

## Setup

```js
import { withCrapTypescriptJest } from "@barney-media/crap-typescript-jest";

export default withCrapTypescriptJest({
  testEnvironment: "node"
});
```

`withCrapTypescriptJest` wraps your Jest config to enable coverage collection and register the CRAP reporter. The test run fails when any function exceeds the CRAP threshold.

The reporter prints text output by default and writes `coverage/crap-typescript-junit.xml` for CI test-report UIs. Pass `format`, `agent`, `output`, `junit`, `junitReport`, or `threshold` in the adapter options to customize reporting. Set `junit: false` to disable the JUnit artifact. The default threshold is `8.0`; values below `4.0` or above `8.0` print the same threshold guidance warnings as the CLI.

The reporter is also available as a standalone export at `@barney-media/crap-typescript-jest/reporter` for direct configuration.

See the [main documentation](https://github.com/fabian-barney/crap-typescript) for full details.

## License

[Apache-2.0](https://github.com/fabian-barney/crap-typescript/blob/main/LICENSE)

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

The reporter defaults primary `format` to `none`, so it emits no primary stdout report unless configured. It enables `junit` by default and writes a full sidecar for CI test-report UIs. With the default coverage report path, the sidecar is `coverage/crap-typescript-junit.xml`; custom coverage paths derive a matching sidecar path. Pass `format`, `agent`, `failuresOnly`, `omitRedundancy`, `output`, `junit`, `junitReport`, or `threshold` in the adapter options to customize reporting. Set `junit: false` to disable the JUnit artifact.

`agent: true` defaults primary output to `format: "toon"`, `failuresOnly: true`, and `omitRedundancy: true`. Explicit `format`, `failuresOnly: false`, or `omitRedundancy: false` options override those defaults. JUnit sidecars are full reports and are not affected by `agent`, `failuresOnly`, or `omitRedundancy`.

The default threshold is `8.0`; values below `4.0` or above `8.0` print the same threshold guidance warnings as the CLI.

See the [main documentation](https://github.com/fabian-barney/crap-typescript) for full details.

## License

[Apache-2.0](https://github.com/fabian-barney/crap-typescript/blob/main/LICENSE)

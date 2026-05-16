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

The reporter defaults primary `format` to `none`, so it emits no primary stdout report unless configured. It enables `junit` by default and writes a full sidecar for CI test-report UIs. With the default coverage report path, the sidecar is `coverage/crap-typescript-junit.xml`; custom coverage paths derive a matching sidecar path. Pass `format`, `agent`, `failuresOnly`, `omitRedundancy`, `output`, `junit`, `junitReport`, `threshold`, `coverageReportWaitMs`, `excludes`, `excludePathRegexes`, `excludeGeneratedMarkers`, or `useDefaultExclusions` in the adapter options to customize analysis and reporting. The reporter waits up to 5000ms for the coverage JSON after Jest finishes; set `coverageReportWaitMs` to a non-negative millisecond value to override it. Set `junit: false` to disable the JUnit artifact.

`agent: true` defaults primary output to `format: "toon"`, `failuresOnly: true`, and `omitRedundancy: true`. Explicit `format`, `failuresOnly: false`, or `omitRedundancy: false` options override those defaults. JUnit sidecars are full reports and are not affected by `agent`, `failuresOnly`, or `omitRedundancy`.

Baseline analyzability exclusions always skip declarations, test/spec files, `__tests__/`, `dist/`, `coverage/`, and `node_modules/`. Generated-code defaults exclude generated directory segments, exact `gen` directory segments, common generated filename suffixes, protobuf outputs, Angular generated artifacts, and leading generated-header markers. User exclusions compose with defaults unless `useDefaultExclusions: false`; full reports and JUnit sidecars include exclusion audit counts when files were excluded.

The default threshold is `8.0`; values below `4.0` or above `8.0` print the same threshold guidance warnings as the CLI.

The reporter is also available as a standalone export at `@barney-media/crap-typescript-jest/reporter` for direct configuration.

See the [main documentation](https://github.com/fabian-barney/crap-typescript) for full details.

## License

[Apache-2.0](https://github.com/fabian-barney/crap-typescript/blob/main/LICENSE)

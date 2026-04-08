# @barney-media/crap-typescript-jest

Jest adapter for [crap-typescript](https://github.com/fabian-barney/crap-typescript). Enables Istanbul JSON coverage output and reports CRAP scores after test runs.

## Install

```bash
npm install --save-dev @barney-media/crap-typescript-jest
```

## Setup

```js
const { withCrapTypescriptJest } = require("@barney-media/crap-typescript-jest");

module.exports = withCrapTypescriptJest({
  testEnvironment: "node"
});
```

`withCrapTypescriptJest` wraps your Jest config to enable coverage collection and register the CRAP reporter. The test run fails when any function exceeds the CRAP threshold.

The reporter is also available as a standalone export at `@barney-media/crap-typescript-jest/reporter` for direct configuration.

See the [main documentation](https://github.com/fabian-barney/crap-typescript) for full details.

## License

[Apache-2.0](https://github.com/fabian-barney/crap-typescript/blob/main/LICENSE)

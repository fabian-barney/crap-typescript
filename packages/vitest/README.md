# @barney-media/crap-typescript-vitest

Vitest adapter for [crap-typescript](https://github.com/fabian-barney/crap-typescript). Enables Istanbul JSON coverage output and reports CRAP scores after test runs.

## Install

```bash
npm install --save-dev @barney-media/crap-typescript-vitest
```

## Setup

```js
const { withCrapTypescriptVitest } = require("@barney-media/crap-typescript-vitest");

module.exports = withCrapTypescriptVitest({
  test: {
    include: ["test/**/*.test.ts"]
  }
});
```

`withCrapTypescriptVitest` wraps your Vitest config to enable coverage collection and register the CRAP reporter. The test run fails when any function exceeds the CRAP threshold.

See the [main documentation](https://github.com/fabian-barney/crap-typescript) for full details.

## License

[Apache-2.0](https://github.com/fabian-barney/crap-typescript/blob/main/LICENSE)

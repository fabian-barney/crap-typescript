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
npx crap-typescript --test-runner karma --coverage-report-path coverage/app/coverage-final.json
npx crap-typescript src/sample.ts
npx crap-typescript packages/api packages/web
```

## Options

```text
--help                       Print usage to stdout
(no args)                    Analyze all TypeScript files under any nested src/ tree
--changed                    Analyze changed TypeScript files under src/
--package-manager <tool>     Force auto, npm, pnpm, or yarn
--test-runner <runner>       Force auto, vitest, jest, or karma
--coverage-report-path <path> Reuse or generate a custom Istanbul JSON coverage report path
<file ...>                   Analyze explicit TypeScript files
<directory ...>              Analyze TypeScript files under each directory's nested src/ tree
```

## Exit Codes

- `0` success, threshold respected
- `1` invalid CLI usage or execution failure
- `2` CRAP threshold exceeded (> 8.0)

See the [main documentation](https://github.com/fabian-barney/crap-typescript) for full details.

## License

[Apache-2.0](https://github.com/fabian-barney/crap-typescript/blob/main/LICENSE)

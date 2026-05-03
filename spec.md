# crap-typescript Specification

## 1. Purpose

`crap-typescript` is a CRAP metric analyzer for TypeScript projects.

It shall:

- locate TypeScript source files to analyze
- generate or reuse Istanbul JSON coverage for the owning package of each analyzed file set
- parse TypeScript function-like bodies and estimate cyclomatic complexity
- combine complexity and coverage into CRAP scores
- print a tabular report sorted by worst score first
- fail when the maximum CRAP score exceeds the configured threshold

## 2. Scope

This specification defines:

- the command-line contract
- source file selection rules
- coverage generation behavior
- function parsing behavior
- coverage attribution and normalization
- CRAP score computation
- report ordering and exit codes

This specification does not define:

- support for non-TypeScript source files
- machine-readable report formats
- adapters beyond Vitest and Jest
- cross-ecosystem normalization for coverage formats beyond Istanbul JSON

## 3. Command-Line Interface

The tool shall support these forms:

- `crap-typescript`
- `crap-typescript --changed`
- `crap-typescript <path...>`
- `crap-typescript --help`

It shall also accept optional overrides:

- `--package-manager auto|npm|pnpm|yarn`
- `--test-runner auto|vitest|jest`
- `--threshold <finite-positive-number>`
- `--failures-only`
- `--failures-only=true|false`
- `--omit-redundancy`
- `--omit-redundancy=true|false`

Invalid argument parsing shall exit with usage error and print the usage text.

## 4. File Selection Rules

### 4.1 Default Discovery

In default mode, the tool shall analyze all `.ts` and `.tsx` files under any nested `src/**` tree below the project root.

### 4.2 Changed-File Discovery

In `--changed` mode, the tool shall:

- invoke `git status --porcelain`
- interpret modified, added, copied, renamed, and untracked TypeScript files
- retain only analyzable files under a `src/` tree
- sort the resulting file list in path order

### 4.3 Explicit Paths

When explicit paths are supplied:

- file paths shall be analyzed directly when they are analyzable TypeScript files
- directory paths shall expand to analyzable files under each directory's nested `src/**` tree
- duplicates shall be removed
- the final list shall be sorted in path order

### 4.4 Exclusions

The tool shall exclude:

- `*.d.ts`
- `*.test.*`
- `*.spec.*`
- files under `__tests__/`
- files under `dist/`, `coverage/`, and `node_modules/`

### 4.5 Empty Selection

If no TypeScript files are selected after expansion and filtering:

- the tool shall print `No TypeScript files to analyze.`
- the tool shall exit successfully

## 5. Module Grouping

The tool shall group selected files by module root before coverage lookup.

The module root is the nearest ancestor directory of the file that contains `package.json`. If none exists below the project root, the project root is used.

Coverage lookup and coverage generation occur once per module group.

## 6. Coverage Pipeline

For each module group, the tool shall:

1. reuse `coverage/coverage-final.json` when present in the module root
2. otherwise reuse `coverage/coverage-final.json` from the project root when present
3. otherwise detect the package manager and test runner unless explicitly forced
4. run the detected test command with JSON coverage enabled
5. read the resulting `coverage/coverage-final.json`
6. analyze the selected TypeScript files in that module

If the expected coverage report is still missing after these steps:

- the tool shall print a warning to stderr
- coverage for methods in that module shall be reported as `N/A`

## 7. Function Parsing

The parser shall use the TypeScript compiler API.

It shall include:

- function declarations with bodies
- class and object literal methods with bodies
- getters and setters with bodies
- decorated and computed-property method or accessor forms
- function expressions and arrow functions assigned to variables, object properties, class fields, or property access and element access assignments

It shall ignore:

- constructors
- overload signatures
- abstract, ambient, and declaration-only members
- ambient and namespace-only declaration containers that do not contain concrete function bodies
- declaration files

Cyclomatic complexity shall start at `1` and increment for:

- `if`
- `for`, `for...in`, `for...of`, `while`, and `do...while`
- `catch`
- conditional expressions (`?:`)
- non-default `switch` cases
- `&&`, `||`, and `??`

Nested functions and class bodies shall not contribute to the enclosing function's complexity.

## 8. Coverage Attribution

Coverage shall be attributed by matching the analyzed source file to an Istanbul coverage record and assigning statement and branch counters to function bodies.

When Istanbul `fnMap` data is present for a file:

- the analyzer shall first prefer exact body-span agreement between the TypeScript AST method body and the Istanbul function span
- if exact agreement is absent, the analyzer shall accept a single unambiguous overlapping match when the spans share the same boundary lines but differ in columns, or when one span fully contains the other
- if no unambiguous match exists, coverage for that function shall be reported as `N/A` and the analyzer shall emit a warning instead of forcing attribution

Statement attribution:

- a statement counter belongs to the innermost analyzed function body that contains the counter location
- statement coverage is the fraction of attributable statements whose hit count is greater than `0`

Branch attribution:

- a branch counter belongs to the innermost analyzed function body that contains the branch location
- branch coverage is the fraction of attributable branch outcomes whose hit count is greater than `0`

The reported function coverage shall be defined as:

`coverage = min(statementCoverage', branchCoverage')`

Where:

- `statementCoverage'` is `statementCoverage` when measurable, otherwise `100%` if statement coverage is structurally not applicable for that function
- `branchCoverage'` is `branchCoverage` when measurable, otherwise `100%` if branch coverage is structurally not applicable for that function

Structural non-applicability means the metric has no meaningful denominator for the function, for example:

- statement coverage is structurally not applicable only for empty bodies or bodies proven to contain only non-executable type-only declarations local to that function
- branch coverage is structurally not applicable only when no attributable branch syntax exists in the function's own body after excluding nested function and class bodies

Unknown coverage is distinct from structural non-applicability.

Unknown coverage includes cases such as:

- missing coverage report
- analyzed file not present in the report
- missing or unusable statement or branch attribution for a function that should have such coverage data
- any zero-unit attribution where the analyzer cannot prove structural non-applicability

If coverage is unknown for non-structural reasons:

- coverage shall be reported as `N/A`
- CRAP shall be reported as `N/A`

## 9. CRAP Formula

For functions with known coverage:

`CRAP = CC^2 * (1 - coverage)^3 + CC`

Where `coverage` is the normalized function coverage fraction in the range `0.0..1.0`, as defined in Section 8.

## 10. Report

The tool shall print a tabular report containing, at minimum:

- function name
- cyclomatic complexity
- coverage percentage or `N/A`
- CRAP score or `N/A`
- source location

The report shall be sorted by CRAP descending.

Functions with `N/A` CRAP shall appear after functions with numeric CRAP.

When `--failures-only` is enabled, primary reports shall keep run-level metadata and emit only function rows whose status is failed. JUnit sidecar reports shall not be affected by this option and shall always contain the full function set.

When `--omit-redundancy` is enabled, primary reports shall keep run-level metadata and omit only function-row status. If the primary report format is JUnit, the primary report shall omit custom testcase `status` properties while preserving JUnit failure and skipped elements. JUnit sidecar reports shall not be affected by this option and shall always contain function-row status.

## 11. Threshold

The default CRAP threshold shall be `8.0`. A finite positive threshold may be configured.

If the configured threshold is below `4.0`, the tool shall print a warning that the threshold is likely too noisy and recommend `8.0` for hard gates, targeting `6.0` during implementation, and using the `8.0` default when in doubt.

If the configured threshold is above `8.0`, the tool shall print a warning that the threshold is too lenient even for hard gates and the same recommendation.

If the maximum numeric CRAP value is greater than the configured threshold:

- the tool shall print `CRAP threshold exceeded: <max> > <threshold>` to stderr
- the tool shall exit with threshold-failure status

If no numeric CRAP values exist, the maximum shall be treated as `0.0`.

## 12. Exit Codes

- `0`: successful analysis, including empty selection or all scores at or below threshold
- `1`: CLI usage error or execution failure
- `2`: CRAP threshold exceeded

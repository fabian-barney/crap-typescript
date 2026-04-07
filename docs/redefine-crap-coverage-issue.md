# Redefine CRAP coverage as `min(statementCoverage, branchCoverage)` using Istanbul JSON

## Background

The current implementation derives function coverage from LCOV line coverage only. This is weaker than the Java sibling's instruction-based approach and can miss important differences between:

- code that was entered but not fully executed
- decisions whose outcomes were not fully exercised

The TypeScript ecosystem does not provide a stable, broadly portable equivalent of JaCoCo instruction coverage. The strongest broadly available function-level signal in mainstream TypeScript tooling is a combination of:

- statement coverage
- branch coverage

## Goal

Keep the original CRAP formula unchanged, but redefine the `coverage` term used by that formula.

## Required Behavior

Keep the formula text exactly as-is:

`CRAP = CC^2 * (1 - coverage)^3 + CC`

Define `coverage` separately as follows:

- `coverage = min(statementCoverage', branchCoverage')`
- `statementCoverage' = statementCoverage` when measurable, otherwise `100%` if structurally not applicable
- `branchCoverage' = branchCoverage` when measurable, otherwise `100%` if structurally not applicable

Structural `N/A` means the metric has no meaningful denominator for that function, for example:

- no attributable statements inside the function for statement coverage
- no measurable branches inside the function for branch coverage

Non-structural unknown coverage must remain unknown and must not be coerced to `100%`. Examples:

- coverage report missing
- file not found in the report
- attribution or mapping failure

When coverage is unknown for non-structural reasons:

- displayed coverage remains `N/A`
- displayed CRAP remains `N/A`

## Canonical Coverage Source

Use Istanbul JSON (`coverage-final.json`) as the canonical input for analysis.

Implications:

- statement and branch metrics must be derived from Istanbul coverage data
- LCOV is not the canonical analysis source for this design
- this issue does not preserve generic LCOV-only compatibility as a first-class requirement

## Attribution Model

Coverage must be computed at function level.

Implementation expectations:

- attribute statement counters to a function using the function body span
- attribute branch counters to a function using branch locations within the function body
- compute statement coverage from attributable covered statements over attributable statements
- compute branch coverage from attributable covered branch outcomes over attributable branch outcomes
- compute final CRAP coverage from the minimum of the two normalized component metrics

## Examples the Implementation Must Satisfy

- Branchless function:
  - branch coverage is structurally `N/A`
  - effective branch coverage becomes `100%`
  - final coverage equals statement coverage
- Statement-less function body:
  - statement coverage is structurally `N/A`
  - effective statement coverage becomes `100%`
  - final coverage equals branch coverage if branches exist, otherwise `100%`
- Function with both statement and branch data:
  - final coverage is the lower of the two
- Missing report or missing file attribution:
  - coverage stays `N/A`
  - CRAP stays `N/A`

## Documentation Updates Required

Update public documentation so it describes the new semantics directly, without a migration section.

Required doc changes:

- README:
  - stop describing CRAP coverage as line coverage
  - keep the formula text unchanged
  - define `coverage` separately as the minimum of statement and branch coverage with structural-`N/A` normalization
  - describe Istanbul JSON as the canonical coverage input
- Specification:
  - replace LCOV line-based coverage language with the new statement and branch definition
  - specify structural `N/A` versus unknown coverage behavior explicitly
  - keep the formula section intact except for redefining the meaning of `coverage` separately
  - describe function-level attribution for statement and branch counters

## Out of Scope

- general normalization across arbitrary third-party coverage ecosystems
- supporting LCOV-only projects as a first-class compatibility target
- adding migration guidance for prior unreleased behavior

## Interoperability Note

The CLI is intended to work across many TypeScript projects, including quality-gate workflows driven by AI agents. Broad interoperability still matters, but this issue intentionally keeps the coverage model focused on Istanbul JSON as the canonical source. Future support for additional runners or ecosystems should require those runners to provide equivalent Istanbul JSON data, or be handled in a separate follow-up issue that explicitly addresses cross-ecosystem normalization.

## Acceptance Criteria

- analysis no longer defines function coverage in terms of line coverage
- the CRAP formula text remains unchanged
- the meaning of `coverage` is defined separately and unambiguously
- statement and branch coverage are both derived from Istanbul JSON
- structural `N/A` is neutralized to `100%` only for the affected metric
- unknown coverage remains `N/A`
- README and spec describe the same rules

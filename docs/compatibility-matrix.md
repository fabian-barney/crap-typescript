# Compatibility Matrix

This matrix records which coverage-attribution shapes are verified by golden fixtures today, which shapes are explicitly unsupported, and which shapes remain unverified.

## Verified

| Shape | Fixture | Notes |
| --- | --- | --- |
| Vitest-style Istanbul JSON with relative source paths | `tests/fixtures/compatibility-matrix/vitest-style-report` | Verifies normalized Istanbul JSON coverage with relative `path` values. |
| Jest-style Istanbul JSON with absolute source paths | `tests/fixtures/compatibility-matrix/jest-style-report` | Verifies normalized Istanbul JSON coverage when the report record resolves to an absolute source path. |
| Workspace coverage lookup across multiple packages | `tests/fixtures/workspace-project` | Verifies per-package coverage lookup and analysis across a workspace layout. |
| TSX parsing and attribution | `tests/fixtures/compatibility-matrix/tsx-component` | Verifies `.tsx` parsing and attribution to an expression-bodied component function. |
| TSX-adjacent generic arrows | `tests/fixtures/compatibility-matrix/tsx-generic-arrows` | Verifies generic arrow parsing in `.tsx` files that also contain JSX syntax. |
| Accessors | `tests/fixtures/compatibility-matrix/accessors` | Verifies getter and setter discovery, naming, and independent coverage attribution. |
| Computed property names | `tests/fixtures/compatibility-matrix/computed-property-names` | Verifies computed class and object member names render as `Container[name]` and retain attribution. |
| Decorated methods | `tests/fixtures/compatibility-matrix/decorated-methods` | Verifies decorators do not prevent method discovery or attribution. |
| Additional property-assigned function forms | `tests/fixtures/compatibility-matrix/property-assigned-functions` | Verifies class field arrows plus property-access and element-access assignments. |
| Ambient and namespace-only declaration containers | `tests/fixtures/compatibility-matrix/ambient-and-namespace-only` | Verifies declaration-only namespace/module containers are ignored without warnings or invented coverage. |
| Nested functions | `tests/fixtures/compatibility-matrix/nested-functions` | Verifies that inner coverage is not attributed to the enclosing function. |
| Anonymous default-exported function declarations | `tests/fixtures/compatibility-matrix/default-export` | Verifies `default` naming and attribution for anonymous default exports. |
| Class methods and object literal methods | `tests/fixtures/compatibility-matrix/object-and-class-methods` | Verifies both class and object-container naming and attribution. |
| Expression-bodied arrows and declaration-only bodies | `tests/fixtures/compatibility-matrix/expression-and-declarations` | Verifies executable expression bodies and structural `N/A` for declaration-only bodies. |
| Source-location drift within function bounds | `tests/fixtures/compatibility-matrix/source-location-drift` | Verifies attribution when line/column data is imprecise but still unambiguously inside the function body. |

## Unsupported

| Shape | Notes |
| --- | --- |
| Coverage inputs outside Istanbul JSON | The canonical input is `coverage/coverage-final.json`; non-Istanbul ecosystems are out of scope. |
| Coverage data that cannot be mapped to any analyzed file or function | The analyzer reports `N/A` instead of inventing attribution. |

## Unverified

No additional function-shape gaps are currently tracked in this matrix. Open a follow-up issue before adding new unsupported or unverified shapes here.

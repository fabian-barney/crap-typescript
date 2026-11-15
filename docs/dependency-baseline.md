# Runtime and dependency baseline

Maintenance versions refreshed on 2026-11-15 for #242.

Baseline updated on 2026-10-18 for [#233](https://github.com/fabian-barney/crap-typescript/issues/233),
on top of the compatible-dependency update in PR #230. Historical changelog entries describe their original releases.

## Support policy

Official support covers maintained Node.js LTS lines and released lines officially scheduled to become LTS.
Node 22, 24, and 26 are maintained LTS lines, fully supported on Windows, macOS, and Linux.
Use current security patches in each supported line.
See the [upstream schedule](https://github.com/nodejs/Release/blob/main/README.md).

Published packages retain `engines.node: >=22.13.0`. The broad engine declaration is an installation floor;
the official support commitment is the maintained/scheduled-LTS policy above. EOL and other unverified lines
do not gain an official support commitment merely by satisfying the engine expression.

The private source-build toolchain requires npm 12.2.2 and Node `^22.22.2 || ^24.15.0 || >=26.0.0`.
This is the intersection of selected direct build-tool requirements, including npm 12, ESLint, and Vitest 5.
CI builds and tests on 22.23.5, 24.22.3, and 26.13.1. Packaging/release jobs use 24.22.3.
Isolated consumer jobs also exercise 22.13.0, 24.0.0, and 26.0.0 using npm 11.21.2 for installation only.
Those jobs consume built archives without installing the private workspace.

## Selected versions and compatibility decisions

| Component                                      | Baseline                                   |
| ---------------------------------------------- | ------------------------------------------ |
| npm / Node definitions                         | 12.2.2 / 22.20.5                           |
| TypeScript                                     | 6.0.3                                      |
| TOON / fast-xml-parser                         | 4.4.0 / 5.12.0                             |
| Vitest / coverage-v8 / Vite                    | 5.1.0 / 5.1.0 / 8.3.8                      |
| Jest / ts-jest                                 | 30.5.2 / 29.4.15                           |
| ESLint / typescript-eslint                     | 10.15.0 / 8.72.2                           |
| Prettier / eslint-config-prettier / @eslint/js | 3.10.1 / 10.1.8 / 10.0.1                   |
| Cognitive TypeScript gate                      | 1.0.0, retaining its native threshold of 8 |
| setup-node                                     | 7.1.0, pinned to its immutable commit      |

- TypeScript 7.0.2 does not expose the compiler API used by the analyzer. typescript-eslint 8.72.2 requires
  TypeScript below 6.1, and ts-jest 29.4.15 requires below 7. Retain TypeScript 6 until the stable 7.1 API
  and the chosen tooling arrangement pass the investigation and regressions tracked in
  [#232](https://github.com/fabian-barney/crap-typescript/issues/232).
- Node definitions follow the oldest supported runtime, rather than latest definitions for Node 26, to
  prevent compilation against APIs unavailable on Node 22. Runtime tests cover all three supported lines.
- The Vitest adapter peer range is `^4.0.0 || ^5.0.0`. Clean consumers test 4.1.12 and 5.1.0 with identically
  versioned coverage-v8 providers. Vite is installed explicitly; Vitest 5 makes it a required peer.
- Vite 8.3.8 declares rolldown `~1.2.18`. The lock resolves rolldown 1.2.18 because 1.2.19 and later add an optional
  `@rolldown/binding-wasm32-wasi` that pins `@emnapi/core` and `@emnapi/runtime` 2.0.0-beta.2. No override is
  declared; move on once a rolldown release within Vite's range depends only on stable emnapi releases.
- Jest remains on major 30. Provider/runner installation and transformation belong to the consumer project.
- PostCSS 8.5.33 requires nanoid `^3.3.20`; the compatible resolution is 3.3.20, rather than nanoid 6.
  The obsolete global override was removed. Prerelease toolchains are excluded from this baseline.
- checkout 7.0.1, upload-artifact 7.0.2, download-artifact 8.0.2, and attest 4.2.2 remain current.

## Version 2.0 TOON migration

Version 2.0.0 uses TOON Specification 4.4 through `~4.4.0`, retaining patch updates within this
serialization baseline. The published 1.x release keeps its historical TOON 2.3 contract.
Upgrade installed analyzer packages together to major version 2 to adopt these serialization changes.

Logical report fields, ordering, thresholds, null coverage, exit codes, and JSON/JUnit/text behavior remain
unchanged. TOON text can differ: hash-leading strings such as `#private` and plus-numeric-like strings such as
`+123` are quoted, and strings beginning with U+FEFF can have different quoting from TOON 2.3.
Update byte-for-byte snapshots and use a decoder supporting TOON 4.4. Verify semantic decode/encode round trips,
including empty method arrays, escaping, null fields, and exclusion audit data.
See the [TOON release](https://github.com/toon-format/toon/releases/tag/v4.4.0).

Vitest 5 also renames duplicated coverage functions when source and compiled variants are merged.
The analyzer groups variants at the same precise declaration position and keeps the most specific span.
Different declarations and unknown declaration columns remain conservative; ambiguous matches remain `N/A`.
The regression fixture and real adapter tests verify that this migration preserves measurable coverage.

## Dependency audit and remaining risk

The locked workspace audit on 2026-11-15 reports 26 affected-package entries: 22 moderate, 4 low, no high,
and no critical findings. These counts are a dated snapshot, not a continuing security guarantee.
The entries propagate from three advisories:

- [GHSA-3g3m-2fjr-6pw4](https://github.com/advisories/GHSA-3g3m-2fjr-6pw4), glob 9.0.0 through 14.0.1
  (patched in 14.0.2): glob 13.0.7 through `@jest/reporters`, `jest-config`, and `jest-runtime`, and glob 10.5.0
  through Istanbul's `test-exclude`.
- [GHSA-g3hv-75wg-m249](https://github.com/advisories/GHSA-g3hv-75wg-m249), minimatch 7.0.0 through 11.0.0
  (patched in 11.0.1): minimatch 10.2.6 through `@typescript-eslint/typescript-estree`, glob 13, and `test-exclude`,
  and minimatch 9.0.9 through glob 10. ESLint itself resolves the patched minimatch 11.0.8.
- [GHSA-gcqx-w48m-w2h4](https://github.com/advisories/GHSA-gcqx-w48m-w2h4), deepmerge 4.2.0 through 4.3.1 with no
  patched release: deepmerge 4.3.1 through `jest-config`.

Every path runs through Jest/ts-jest or typescript-eslint. Both are repository lint/test tooling that reads trusted
repository globs and configuration; restrict lint, test, and coverage configuration to trusted sources. Jest is also a
host-runner peer of the published Jest adapter, so these residuals appear in that adapter's peer dependency closure.
Fresh core/CLI runtime SBOM closures and Vitest's selected peer closure include none of the affected packages.
Consumer graphs can differ within published ranges.

`npm audit` proposes Jest 25, ts-jest 25, and typescript-eslint 8.36.0 as fixes. Do not apply these downgrades or
force glob or minimatch majors into the existing Jest, Istanbul, and typescript-eslint ranges to obtain an apparently
clean audit.
Track the advisories and re-audit after upstream updates.
The sprintf-js advisory GHSA-hp3w-g68c-fv3c recorded for #239 was withdrawn on 2026-10-22 and is no longer reported.

## Licenses and artifact verification

The selected TOON and Vitest upstream license files are MIT, TypeScript is Apache-2.0, and fast-xml-parser is MIT.
Fresh core/CLI runtime SBOMs contain MIT and Apache-2.0 dependencies. The larger runner-peer graphs also
record ISC, BSD-2-Clause, BSD-3-Clause, BlueOak-1.0.0, CC-BY-4.0, and MIT/CC0 alternatives.
No component in the generated per-package SBOMs has an unknown license field.

Vite retains the existing, unmodified Lightning CSS 1.33.0 dependency and platform bindings under MPL-2.0.
Its upstream license file and npm metadata were checked; this license was already present before #233.
These are host build-tool dependencies supplied as separate npm packages, not code bundled into the analyzer.
Preserve their license/notices and corresponding-source availability when redistributing them or a bundled host
application. The source is [Lightning CSS](https://github.com/parcel-bundler/lightningcss), with its MPL license
included in the installed package. This update modifies none of its covered source files.

Published analyzer archives continue to contain their own Apache-2.0 license and external dependency declarations.
Dependency packages retain their upstream license/notice files. Package-specific SBOMs record the locked runtime
and peer graph, including optional platform packages; unrelated development tools and the private parent are removed.
The npm 12 generator preserves component identities, aliases, package URLs, and dependency-reference edges and
rejects missing/ambiguous roots or incomplete graphs. Checksums and the existing provenance/SBOM attestations
bind those exact archives and SBOMs to the reviewed release commit.

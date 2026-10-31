# Runtime and dependency baseline

Maintenance versions refreshed on 2026-10-31 for #239.

Baseline updated on 2026-10-18 for [#233](https://github.com/fabian-barney/crap-typescript/issues/233),
on top of the compatible-dependency update in PR #230. Historical changelog entries describe their original releases.

## Support policy

Official support covers maintained Node.js LTS lines and released lines officially scheduled to become LTS.
Node 22, 24, and 26 are fully supported on Windows, macOS, and Linux, including Node 26 before its
scheduled LTS transition on 2026-10-28. Use current security patches in each supported line.
See the [upstream schedule](https://github.com/nodejs/Release/blob/main/README.md).

Published packages retain `engines.node: >=22.13.0`. The broad engine declaration is an installation floor;
the official support commitment is the maintained/scheduled-LTS policy above. EOL and other unverified lines
do not gain an official support commitment merely by satisfying the engine expression.

The private source-build toolchain requires npm 12.2.1 and Node `^22.22.2 || ^24.15.0 || >=26.0.0`.
This is the intersection of selected direct build-tool requirements, including npm 12, ESLint, and Vitest 5.
CI builds and tests on 22.23.4, 24.22.2, and 26.13.0. Packaging/release jobs use 24.22.2.
Isolated consumer jobs also exercise 22.13.0, 24.0.0, and 26.0.0 using npm 11.21.1 for installation only.
Those jobs consume built archives without installing the private workspace.

## Selected versions and compatibility decisions

| Component                                      | Baseline                                   |
| ---------------------------------------------- | ------------------------------------------ |
| npm / Node definitions                         | 12.2.1 / 22.20.5                           |
| TypeScript                                     | 6.0.3                                      |
| TOON / fast-xml-parser                         | 4.4.0 / 5.11.2                             |
| Vitest / coverage-v8 / Vite                    | 5.0.5 / 5.0.5 / 8.3.4                      |
| Jest / ts-jest                                 | 30.5.2 / 29.4.15                           |
| ESLint / typescript-eslint                     | 10.14.0 / 8.72.1                           |
| Prettier / eslint-config-prettier / @eslint/js | 3.9.10 / 10.1.8 / 10.0.1                   |
| Cognitive TypeScript gate                      | 1.0.0, retaining its native threshold of 8 |
| setup-node                                     | 7.1.0, pinned to its immutable commit      |

- TypeScript 7.0.2 does not expose the compiler API used by the analyzer. typescript-eslint 8.72.1 requires
  TypeScript below 6.1, and ts-jest 29.4.15 requires below 7. Retain TypeScript 6 until the stable 7.1 API
  and the chosen tooling arrangement pass the investigation and regressions tracked in
  [#232](https://github.com/fabian-barney/crap-typescript/issues/232).
- Node definitions follow the oldest supported runtime, rather than latest definitions for Node 26, to
  prevent compilation against APIs unavailable on Node 22. Runtime tests cover all three supported lines.
- The Vitest adapter peer range is `^4.0.0 || ^5.0.0`. Clean consumers test 4.1.12 and 5.0.5 with identically
  versioned coverage-v8 providers. Vite is installed explicitly; Vitest 5 makes it a required peer.
- Jest remains on major 30. Provider/runner installation and transformation belong to the consumer project.
- PostCSS 8.5.30 requires nanoid `^3.3.20`; the compatible resolution is 3.3.20, rather than nanoid 6.
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

The refreshed locked workspace audit reports 20 moderate affected-package entries, no critical findings,
and no high findings. All 20 entries propagate from one unpatched advisory:
[GHSA-hp3w-g68c-fv3c](https://github.com/advisories/GHSA-hp3w-g68c-fv3c), affecting sprintf-js through 1.1.3.
These counts are a dated snapshot, not a continuing security guarantee.

The relevant chain is Jest/Babel Istanbul instrumentation -> `@istanbuljs/load-nyc-config` -> js-yaml 3.15.2
-> argparse 1.0.10 -> sprintf-js 1.0.3. Jest/ts-jest are repository test tooling; Jest is also a host-runner peer
of the published Jest adapter, so the residual appears in that adapter's peer dependency closure.

The assessed NYC loader calls the js-yaml library's `load` function. That library imports its loader/dumper;
argparse is imported by the separate js-yaml command-line executable, and sprintf is used in argparse's
help/usage formatting. No call from the analyzer's source parsing or reporting path was identified.
This reachability observation does not establish safety for every host tool or separate CLI invocation.
Track the upstream advisory and re-audit after updates; any continued deferral requires this scoped evidence.

Patchable Handlebars, source-map-js, and brace-expansion paths were refreshed. Do not substitute incompatible
Jest downgrades or force js-yaml majors into the existing Istanbul contract to obtain an apparently clean audit.
Fresh core/CLI runtime SBOM closures do not include the remaining vulnerable leaf. Vitest's selected peer
closure does not include it; Jest's does. Consumer graphs can differ within published ranges.

## Licenses and artifact verification

The selected TOON and Vitest upstream license files are MIT, TypeScript is Apache-2.0, and fast-xml-parser is MIT.
Fresh core/CLI runtime SBOMs contain MIT and Apache-2.0 dependencies. The larger runner-peer graphs also
record ISC, BSD-2-Clause, BSD-3-Clause, 0BSD, BlueOak-1.0.0, CC-BY-4.0, and MIT/CC0 alternatives.
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

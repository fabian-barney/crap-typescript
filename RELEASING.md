# Releases

All four public packages share a stable version. A reviewed version-bump PR merged
into protected `main` starts publication automatically. An ordinary merge is a no-op;
manual tag pushes do not publish. No manual signing or deployment approval is needed.

## Prepare a release

1. Reconcile any isolated hotfix into `main`, including its changelog and dependency fixes.
2. Update the root and four workspace versions, the three internal core dependency
   ranges (`^VERSION`), and all corresponding lockfile records. Add a dated, nonempty
   changelog section and update current versioned examples.
3. Run build, tests with coverage, lint, both quality gates, and `npm run test:release`.
   From an empty `release-artifacts` directory run `npm run release:artifacts` and
   `npm run release:smoke`. CI repeats packaging and clean-consumer verification.
4. Complete the latest-head review loop, resolve all review conversations, and merge
   only with green checks. The stable `verify / required` check aggregates every CI gate.
5. The release workflow validates the candidate, then waits up to one hour for that
   check on the exact merge commit. Failed, cancelled, skipped, or missing checks
   cannot authorize publication.

Versions must increase and agree across manifests and lockfile. Existing tags,
GitHub releases, and any public npm package at that version block a new release.
Never bypass branch protection or move/delete a release tag.

## Publisher identity and permissions

Each npm package must retain its GitHub trusted publisher:

- owner: `fabian-barney`
- repository: `crap-typescript`
- workflow filename: `release.yml`
- environment: unset (the publisher job intentionally does not select an environment)

Check these in npm package settings or with authenticated `npm trust list PACKAGE`
before merging a release bump. The successful v0.5.3 runs used this workflow and
generated npm provenance for all four packages. A workflow rename or environment
change requires updating all four trusted-publisher configurations first.

Publication uses GitHub OIDC with npm 11.15.0. There is no npm publishing token or
GPG private key. Only the publication job receives contents, attestations, and
OIDC write permissions. Third-party Actions are pinned to full commit hashes.
The `v*` ruleset prevents tag updates and deletion without bypass actors.

## Assets and trust

The workflow builds and packs once and publishes those exact tarballs to npm and
GitHub. Each release contains:

- four npm `.tgz` archives, including JavaScript, declarations, README, and license;
- four `.tgz.cdx.json` CycloneDX SBOMs;
- `SHA256SUMS` for those eight files;
- `provenance.sigstore.json`, attesting the archives, SBOMs, and checksum manifest;
- four `.tgz.sbom.sigstore.json` bundles binding each SBOM to its archive digest.

SBOMs describe the locked runtime and peer dependency graph used during release.
The private workspace parent and unrelated development dependencies are removed.
TypeScript remains included because core requires it at runtime, even though the
repository also uses it for development. Consumer installations may resolve different
versions within the published dependency ranges. SBOMs do not promise identical
dependency resolution for all consumers.

Git tags are annotated but unsigned. Keyless Sigstore attestations bind artifact
digests to the source commit and the GitHub-hosted workflow identity. npm additionally
publishes its own signed provenance. No GPG signature files are produced.

## Verify a download

Download release assets with `gh release download v1.0.0 --repo fabian-barney/crap-typescript`.
In the download directory, verify checksums with `sha256sum --check SHA256SUMS`.
Then verify every archive, SBOM, and the checksum manifest against the provenance bundle:

```sh
gh attestation verify barney-media-crap-typescript-core-1.0.0.tgz \
  --bundle provenance.sigstore.json \
  --repo fabian-barney/crap-typescript \
  --cert-identity https://github.com/fabian-barney/crap-typescript/.github/workflows/release.yml@refs/heads/main \
  --cert-oidc-issuer https://token.actions.githubusercontent.com \
  --source-digest RELEASE_COMMIT_SHA --deny-self-hosted-runners
```

For the package SBOM attestation, use the matching `.tgz.sbom.sigstore.json` bundle
and add `--predicate-type https://cyclonedx.org/bom`. Obtain the expected source commit
from the release tag and review its merged PR. The repository's
`scripts/verify-release-attestations.sh` checks every file and also proves that modified
bytes fail verification; set `GITHUB_SHA` to the expected release commit when invoking it.

In a clean consumer project, install the exact release versions and run
`npm audit signatures` to verify registry signatures and npm provenance.

## Ordering and failure recovery

The workflow verifies the signed artifacts before pushing the annotated tag. It then
creates a GitHub draft, uploads assets, publishes core/CLI/Vitest/Jest in that order,
checks npm integrity and provenance, runs a clean registry consumer smoke test, and
promotes the draft only after all checks succeed.

Failures before tag creation and before any public package exists can be rerun at
the same commit. Once a tag or draft exists, automatic retries fail closed: do not
rebuild and replace its assets or delete the tag to unblock a rerun. A recovery must
use the original commit and preserved, verified artifacts, and requires a separately
reviewed recovery procedure. Workflow artifacts preserve the original files even if
draft upload failed. Never use `gh release upload --clobber` for recovery.

If any npm package became public and a later step fails, the version is burned.
Retain the tag and draft as the historical partial-release record, record which
packages succeeded, fix the failure, and release a new version for all four packages.
Do not claim success from a green packaging dry run or from only some published packages.

Repository administration must require `verify / required` on `main` and prohibit
updates/deletions of `v*` tags. Confirm the infrastructure-only merge produces a
successful no-op before merging the first version bump.

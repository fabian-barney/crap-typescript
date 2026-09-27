#!/usr/bin/env bash
set -euo pipefail
directory="${1:-release-artifacts}"
repository="${GH_REPO:-fabian-barney/crap-typescript}"
identity="https://github.com/${repository}/.github/workflows/release.yml@refs/heads/main"
for file in "$directory"/*.tgz "$directory"/*.cdx.json "$directory/SHA256SUMS"; do
  gh attestation verify "$file" --bundle "$directory/provenance.sigstore.json" \
    --repo "$repository" --cert-identity "$identity" --cert-oidc-issuer https://token.actions.githubusercontent.com \
    --source-digest "$GITHUB_SHA" --deny-self-hosted-runners
done
for file in "$directory"/*.tgz; do
  gh attestation verify "$file" --bundle "$file.sbom.sigstore.json" \
    --repo "$repository" --cert-identity "$identity" --cert-oidc-issuer https://token.actions.githubusercontent.com \
    --source-digest "$GITHUB_SHA" --deny-self-hosted-runners --predicate-type https://cyclonedx.org/bom
done
# A signature check must reject a modified subject.
temporary="$(mktemp -d)"
trap 'rm -rf "$temporary"' EXIT
cp "$directory/SHA256SUMS" "$temporary/SHA256SUMS"
printf '\ntampered\n' >> "$temporary/SHA256SUMS"
if gh attestation verify "$temporary/SHA256SUMS" --bundle "$directory/provenance.sigstore.json" \
  --repo "$repository" --cert-identity "$identity"; then
  echo '::error::Attestation verification accepted modified bytes'
  exit 1
fi

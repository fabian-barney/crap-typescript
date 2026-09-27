import { jsonRequest } from "./release-lib.mjs";
import { digest } from "./release-artifacts.mjs";

export async function verifyPublishedPackage(pkg, bytes, {
  request = jsonRequest,
  attempts = 60,
  pause = () => new Promise((resolve) => setTimeout(resolve, 10000))
} = {}) {
  const expected = `sha512-${digest(bytes, "sha512", "base64")}`;
  // Match npm's canonical scoped-package URL and its separate install-metadata representation.
  const packageUrl = `https://registry.npmjs.org/${encodeURIComponent(pkg.name).replace(/^%40/, "@").replaceAll("%2F", "%2f")}`;
  const url = `${packageUrl}/${pkg.version}`;
  for (let attempt = 0; attempt < attempts; attempt++) {
    try {
      const metadata = await request(url, { allowMissing: true });
      if (metadata) {
        if (metadata.dist?.integrity !== expected) throw new Error(`npm integrity mismatch: ${pkg.name}`);
        if (metadata.dist.attestations?.url) {
          const provenance = await request(metadata.dist.attestations.url, { allowMissing: true });
          if (provenance?.attestations?.some((entry) => entry.predicateType === "https://slsa.dev/provenance/v1")) {
            const installMetadata = await request(packageUrl, { allowMissing: true,
              headers: { Accept: "application/vnd.npm.install-v1+json", "Cache-Control": "no-cache" } });
            const published = installMetadata?.versions?.[pkg.version];
            if (published) {
              if (published.dist?.integrity !== expected) throw new Error(`npm install integrity mismatch: ${pkg.name}`);
              return;
            }
          }
        }
      }
    } catch (error) {
      if (error.status !== 429 && !(error.status >= 500 && error.status <= 599)) throw error;
    }
    if (attempt + 1 < attempts) await pause();
  }
  throw new Error(`Timed out waiting for npm metadata and provenance: ${pkg.name}@${pkg.version}`);
}

import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { archiveName, assertUnpublished, git, packages } from "./release-lib.mjs";
import { npm, verifyManifest } from "./release-artifacts.mjs";
import { verifyPublishedPackage } from "./release-registry.mjs";

const manifests = packages();
const tag = `v${manifests[0].version}`;
const command = process.argv[2];
const sha = process.env.GITHUB_SHA;
if (!sha || git("rev-parse", "HEAD") !== sha || process.env.GITHUB_REF !== "refs/heads/main") {
  throw new Error("Publication requires the exact main release commit");
}

const files = verifyManifest("release-artifacts");
for (const pkg of manifests) {
  for (const file of [archiveName(pkg), `${archiveName(pkg)}.cdx.json`]) {
    if (!files.has(file)) throw new Error(`Missing artifact: ${file}`);
  }
}
if (files.size !== 8) throw new Error("Unexpected release artifact manifest");

if (command === "prepare") {
  await assertUnpublished(manifests);
  git("config", "user.name", "github-actions[bot]");
  git("config", "user.email", "41898282+github-actions[bot]@users.noreply.github.com");
  git("-c", "tag.gpgSign=false", "tag", "-a", tag, sha, "-m", `Release ${tag}`);
  git("push", "origin", `refs/tags/${tag}`);
  execFileSync("gh", ["release", "create", tag, "--verify-tag", "--draft", "--title", tag,
    "--notes-file", "release-notes.md"], { stdio: "inherit" });
} else if (command === "publish") {
  if (git("rev-parse", `${tag}^{commit}`) !== sha) throw new Error("Tag does not match release source");
  await assertUnpublished(manifests);
  for (const pkg of manifests) {
    npm(["publish", `./release-artifacts/${archiveName(pkg)}`, "--access", "public", "--provenance"], { stdio: "inherit" });
  }
} else if (command === "verify") {
  for (const pkg of manifests) {
    const bytes = readFileSync(`release-artifacts/${archiveName(pkg)}`);
    await verifyPublishedPackage(pkg, bytes);
  }
} else {
  throw new Error(`Unknown publication command: ${command}`);
}

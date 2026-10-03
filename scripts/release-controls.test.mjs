import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import { chmodSync, mkdtempSync, writeFileSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { test } from "node:test";
import { assertNoReleaseCollision, assertUnpublished, checkRunState, validateVersions, versionIncreased, waitForRequired } from "./release-lib.mjs";
import { digest, packageBom, verifyManifest } from "./release-artifacts.mjs";
import { verifyPublishedPackage } from "./release-registry.mjs";

test("stable versions increase numerically and reject malformed candidates", () => {
  assert.equal(versionIncreased("0.5.3", "1.0.0"), true);
  assert.equal(versionIncreased("1.9.0", "1.10.0"), true);
  assert.equal(versionIncreased("1.0.0", "1.0.0"), false);
  assert.equal(versionIncreased("1.0.0", "0.9.0"), false);
  for (const invalid of ["01.0.0", "1.0", "1.0.0-rc.1", "v1.0.0", "1.0.0\n"]) {
    assert.throws(() => versionIncreased("0.5.3", invalid));
  }
});

test("validate all workspace and lock versions and internal ranges", () => {
  const root = { version: "1.0.0" };
  const manifests = [{ name: "core", folder: "core", version: "1.0.0" },
    { name: "cli", folder: "cli", version: "1.0.0", dependencies: { core: "^1.0.0" } }];
  const lock = { version: "1.0.0", packages: { "": root, "packages/core": manifests[0], "packages/cli": manifests[1] } };
  validateVersions("1.0.0", root, manifests, lock);
  const stale = structuredClone(lock);
  stale.packages["packages/core"].version = "0.5.3";
  assert.throws(() => validateVersions("1.0.0", root, manifests, stale), /mismatch/);
  manifests[1].dependencies.core = "^0.5.3";
  assert.throws(() => validateVersions("1.0.0", root, manifests, lock), /dependency mismatch/);
});

const run = (conclusion, overrides = {}) => ({ id: 1, name: "verify / required", head_sha: "abc",
  app: { slug: "github-actions" }, status: "completed", conclusion, ...overrides });

test("CI gate requires exact SHA and real Actions success", async () => {
  assert.equal(checkRunState([run("success")], "abc"), true);
  assert.equal(checkRunState([run("success")], "def"), false);
  assert.equal(checkRunState([run("success", { app: { slug: "other" } })], "abc"), false);
  for (const result of ["failure", "cancelled", "timed_out", "skipped", "neutral"]) {
    assert.throws(() => checkRunState([run(result)], "abc"), /Required CI/);
  }
  assert.equal(checkRunState([run("success"), run(null, { id: 2, status: "in_progress" })], "abc"), false);
  await assert.rejects(waitForRequired(async () => [], "abc", { attempts: 2, pause: async () => {} }), /Timed out/);
  let calls = 0;
  await waitForRequired(async () => ++calls === 2 ? [run("success")] : [], "abc", { pause: async () => {} });
});

test("public version or registry failure prevents publication", async () => {
  const manifests = [{ name: "core", version: "1.0.0" }, { name: "cli", version: "1.0.0" }];
  await assertUnpublished(manifests, async () => null);
  await assert.rejects(assertUnpublished(manifests, async () => ({ version: "1.0.0" })), /already public/);
  await assert.rejects(assertUnpublished(manifests, async () => { throw new Error("registry unavailable"); }), /unavailable/);
});

test("existing tags, drafts, and API failures fail closed", async () => {
  await assertNoReleaseCollision("v1.0.0", async () => null);
  await assert.rejects(assertNoReleaseCollision("v1.0.0", async () => ({})), /Tag collision/);
  await assert.rejects(assertNoReleaseCollision("v1.0.0", async (endpoint) =>
    endpoint.startsWith("releases/") ? { draft: true } : null), /Release collision/);
  await assert.rejects(assertNoReleaseCollision("v1.0.0", async () => { throw new Error("API failed"); }), /API failed/);
});

test("post-publish verification waits for metadata and provenance propagation", async () => {
  const pkg = { name: "core", version: "1.0.0" };
  const metadata = { dist: { integrity: `sha512-${digest("archive", "sha512", "base64")}`, attestations: { url: "attestations" } } };
  const responses = [null, metadata, null, metadata, { attestations: [] }, metadata,
    { attestations: [{ predicateType: "https://slsa.dev/provenance/v1" }] }, { versions: { "1.0.0": metadata } }];
  let pauses = 0;
  await verifyPublishedPackage(pkg, "archive", { request: async () => responses.shift(), pause: async () => { pauses++; } });
  assert.equal(pauses, 3);
  assert.equal(responses.length, 0);
});

test("verification waits for npm install metadata and uses its canonical scoped URL", async () => {
  const pkg = { name: "@scope/core", version: "1.0.0" };
  const metadata = { dist: { integrity: `sha512-${digest("archive", "sha512", "base64")}`, attestations: { url: "attestations" } } };
  let installReads = 0;
  await verifyPublishedPackage(pkg, "archive", { pause: async () => {}, request: async (url, options) => {
    if (url === "attestations") return { attestations: [{ predicateType: "https://slsa.dev/provenance/v1" }] };
    if (url.endsWith("/1.0.0")) return metadata;
    assert.equal(url, "https://registry.npmjs.org/@scope%2fcore");
    assert.equal(options.headers.Accept, "application/vnd.npm.install-v1+json");
    return ++installReads === 1 ? { versions: {} } : { versions: { "1.0.0": metadata } };
  } });
  assert.equal(installReads, 2);
});

test("post-publish retries are bounded and never hide integrity or permission failures", async () => {
  const pkg = { name: "core", version: "1.0.0" };
  const immediate = { attempts: 2, pause: async () => {} };
  await assert.rejects(verifyPublishedPackage(pkg, "archive", { ...immediate, request: async () => null }), /Timed out/);
  let calls = 0;
  await assert.rejects(verifyPublishedPackage(pkg, "archive", { ...immediate,
    request: async () => { calls++; return { dist: { integrity: "wrong" } }; } }), /integrity mismatch/);
  assert.equal(calls, 1);
  await assert.rejects(verifyPublishedPackage(pkg, "archive", { ...immediate,
    request: async () => { throw Object.assign(new Error("Forbidden"), { status: 403 }); } }), /Forbidden/);
  for (const status of [429, 500, 503]) {
    calls = 0;
    await assert.rejects(verifyPublishedPackage(pkg, "archive", { ...immediate,
      request: async () => { calls++; throw Object.assign(new Error("Temporary"), { status }); } }), /Timed out/);
    assert.equal(calls, 2);
  }
});

test("partial version and install metadata wait for integrity without accepting a missing digest", async () => {
  const pkg = { name: "core", version: "1.0.0" };
  const metadata = { dist: { integrity: `sha512-${digest("archive", "sha512", "base64")}`, attestations: { url: "attestations" } } };
  const partial = [{}, { dist: {} }, { dist: { integrity: null } }];
  for (const endpoint of ["version", "install"]) {
    for (const incomplete of partial) {
      let reads = 0;
      let pauses = 0;
      await verifyPublishedPackage(pkg, "archive", { attempts: 2, pause: async () => { pauses++; }, request: async (url) => {
        if (url === "attestations") return { attestations: [{ predicateType: "https://slsa.dev/provenance/v1" }] };
        if (url.endsWith("/1.0.0")) return endpoint === "version" && ++reads === 1 ? incomplete : metadata;
        return { versions: { "1.0.0": endpoint === "install" && ++reads === 1 ? incomplete : metadata } };
      } });
      assert.equal(reads, 2);
      assert.equal(pauses, 1);
    }
    await assert.rejects(verifyPublishedPackage(pkg, "archive", { attempts: 1, request: async (url) => {
      if (url === "attestations") return { attestations: [{ predicateType: "https://slsa.dev/provenance/v1" }] };
      if (url.endsWith("/1.0.0")) return endpoint === "version" ? {} : metadata;
      return { versions: { "1.0.0": {} } };
    } }), /Timed out/);
  }
  await assert.rejects(verifyPublishedPackage(pkg, "archive", { attempts: 1, request: async (url) => {
    if (url === "attestations") return { attestations: [{ predicateType: "https://slsa.dev/provenance/v1" }] };
    if (url.endsWith("/1.0.0")) return metadata;
    return { versions: { "1.0.0": { dist: { integrity: "wrong" } } } };
  } }), /install integrity mismatch/);
});

test("SBOM re-rooting retains runtime closure, removes unrelated dev tools, and fails on missing nodes", () => {
  const component = (ref) => ({ name: ref, "bom-ref": ref });
  const bom = { metadata: { component: component("parent") },
    components: [component("cli@1.0.0"), component("typescript"), component("dev-tool")],
    dependencies: [{ ref: "cli@1.0.0", dependsOn: ["typescript"] }, { ref: "typescript", dependsOn: [] },
      { ref: "dev-tool", dependsOn: [] }] };
  const pkg = { name: "cli", version: "1.0.0" };
  const result = packageBom(bom, pkg, [pkg]);
  assert.equal(result.metadata.component.name, "cli");
  assert.deepEqual(result.components.map((entry) => entry.name), ["typescript"]);
  bom.dependencies[0].dependsOn.push("missing");
  assert.throws(() => packageBom(bom, pkg, [pkg]), /Incomplete SBOM/);
});

test("checksums reject modified bytes and unsafe paths", () => {
  const directory = mkdtempSync(path.join(tmpdir(), "release-checksum-"));
  try {
    writeFileSync(path.join(directory, "archive.tgz"), "original");
    writeFileSync(path.join(directory, "SHA256SUMS"), `${digest("original")}  archive.tgz\n`);
    assert.equal(verifyManifest(directory).size, 1);
    writeFileSync(path.join(directory, "archive.tgz"), "modified");
    assert.throws(() => verifyManifest(directory), /Checksum mismatch/);
    writeFileSync(path.join(directory, "SHA256SUMS"), `${digest("original")}  ../archive.tgz\n`);
    assert.throws(() => verifyManifest(directory), /Invalid/);
  } finally { rmSync(directory, { recursive: true, force: true }); }
});

test("unchanged-version main push is a no-op without API access", () => {
  const directory = mkdtempSync(path.join(tmpdir(), "release-candidate-"));
  const git = (...args) => execFileSync("git", args, { cwd: directory, encoding: "utf8" }).trim();
  try {
    git("init", "--initial-branch=main");
    git("config", "user.email", "test@example.invalid");
    git("config", "user.name", "Test");
    writeFileSync(path.join(directory, "package.json"), '{"version":"0.5.2"}');
    git("add", ".");
    git("-c", "commit.gpgSign=false", "commit", "-m", "initial");
    git("-c", "commit.gpgSign=false", "commit", "--allow-empty", "-m", "ordinary merge");
    const output = path.join(directory, "output");
    execFileSync(process.execPath, [path.resolve("scripts/release-candidate.mjs"), "validate"], { cwd: directory,
      env: { ...process.env, GH_TOKEN: "", GITHUB_SHA: git("rev-parse", "HEAD"), GITHUB_EVENT_NAME: "push",
        GITHUB_REF: "refs/heads/main", GITHUB_OUTPUT: output } });
    assert.equal(readFileSync(output, "utf8"), "release=false\n");
  } finally { rmSync(directory, { recursive: true, force: true }); }
});

test("release notes require a nonempty version section even on main", () => {
  const directory = mkdtempSync(path.join(tmpdir(), "release-notes-"));
  try {
    const execute = () => spawnSync(process.execPath, [path.resolve("scripts/render-release-notes.mjs"), "1.0.0"],
      { cwd: directory, env: { ...process.env, GITHUB_REF_NAME: "main" }, encoding: "utf8" });
    writeFileSync(path.join(directory, "CHANGELOG.md"), "## [Unreleased]\n");
    assert.notEqual(execute().status, 0);
    writeFileSync(path.join(directory, "CHANGELOG.md"), "## [1.0.0]\n");
    assert.notEqual(execute().status, 0);
    writeFileSync(path.join(directory, "CHANGELOG.md"), "## [1.0.0]\n\nStable release\n");
    assert.equal(execute().status, 0);
  } finally { rmSync(directory, { recursive: true, force: true }); }
});

test("all attestation calls enforce the same policy, including the tamper probe", { skip: process.platform === "win32" }, () => {
  const directory = mkdtempSync(path.join(tmpdir(), "release-attest-"));
  try {
    const mock = path.join(directory, "gh");
    writeFileSync(mock, `#!/bin/sh\nprintf '%s\\n' "$*" >> "$VERIFY_LOG"\nif grep -q tampered "$3"; then exit 1; fi\n`);
    chmodSync(mock, 0o755);
    for (const file of ["package.tgz", "package.tgz.cdx.json", "SHA256SUMS", "provenance.sigstore.json", "package.tgz.sbom.sigstore.json"]) {
      writeFileSync(path.join(directory, file), "original");
    }
    const log = path.join(directory, "calls");
    execFileSync("bash", [path.resolve("scripts/verify-release-attestations.sh"), directory], {
      env: { ...process.env, PATH: `${directory}:${process.env.PATH}`, GH_REPO: "owner/repo", GITHUB_SHA: "expected-sha", VERIFY_LOG: log }
    });
    const calls = readFileSync(log, "utf8").trim().split("\n");
    assert.equal(calls.length, 5);
    for (const call of calls) {
      assert.match(call, /--repo owner\/repo/);
      assert.match(call, /--cert-identity https:\/\/github.com\/owner\/repo\/\.github\/workflows\/release.yml@refs\/heads\/main/);
      assert.match(call, /--cert-oidc-issuer https:\/\/token.actions.githubusercontent.com/);
      assert.match(call, /--source-digest expected-sha/);
      assert.match(call, /--deny-self-hosted-runners/);
    }
  } finally { rmSync(directory, { recursive: true, force: true }); }
});

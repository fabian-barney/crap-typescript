import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import { mkdtempSync, writeFileSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { test } from "node:test";
import { assertNoReleaseCollision, assertUnpublished, checkRunState, validateVersions, versionIncreased, waitForRequired } from "./release-lib.mjs";
import { digest, packageBom, verifyManifest } from "./release-artifacts.mjs";

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

import { appendFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { assertNoReleaseCollision, assertUnpublished, git, github, packages, readJson, validateVersions, versionIncreased, waitForRequired } from "./release-lib.mjs";

const command = process.argv[2];
const sha = process.env.GITHUB_SHA;
if (!sha || git("rev-parse", "HEAD") !== sha) throw new Error("Checkout must match GITHUB_SHA");
if (process.env.GITHUB_EVENT_NAME !== "push" || process.env.GITHUB_REF !== "refs/heads/main") {
  throw new Error("Releases require a push to protected main");
}

if (command === "wait") {
  // Paginate to avoid silently missing the aggregator as the CI matrix grows.
  await waitForRequired(async () => {
    const runs = [];
    for (let page = 1; ; page++) {
      const result = await github(`commits/${sha}/check-runs?per_page=100&page=${page}`);
      runs.push(...result.check_runs);
      if (result.check_runs.length < 100) return runs;
    }
  }, sha);
} else if (command === "validate") {
  const root = readJson("package.json");
  const previous = JSON.parse(git("show", `${sha}^1:package.json`)).version;
  if (root.version === previous) {
    appendFileSync(process.env.GITHUB_OUTPUT, "release=false\n");
    console.log(`Version unchanged (${root.version}); no release.`);
  } else {
    if (!versionIncreased(previous, root.version)) throw new Error("Release version must increase");
    validateVersions(root.version, root, packages(), readJson("package-lock.json"));
    execFileSync(process.execPath, ["scripts/render-release-notes.mjs", root.version], { stdio: "inherit" });
    const branch = await github("branches/main");
    if (!branch.protected) throw new Error("main must be protected");
    const tag = `v${root.version}`;
    // Existing tags require investigation rather than silently rebuilding their artifacts.
    await assertNoReleaseCollision(tag);
    await assertUnpublished(packages());
    appendFileSync(process.env.GITHUB_OUTPUT, `release=true\nversion=${root.version}\ntag=${tag}\n`);
  }
} else {
  throw new Error(`Unknown candidate command: ${command}`);
}

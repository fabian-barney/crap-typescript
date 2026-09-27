import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";

export const workspaces = ["core", "cli", "vitest", "jest"];
export const readJson = (file) => JSON.parse(readFileSync(file, "utf8"));
export const git = (...args) => execFileSync("git", args, { encoding: "utf8" }).trim();
export const packages = () => workspaces.map((folder) => ({ folder, ...readJson(`packages/${folder}/package.json`) }));
export const archiveName = (pkg) => `${pkg.name.replace(/^@/, "").replaceAll("/", "-")}-${pkg.version}.tgz`;

export function stableVersion(version) {
  if (!/^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/.test(version) || version.trim() !== version) {
    throw new Error(`Expected a stable semantic version, got ${version}`);
  }
  return version.split(".").map(BigInt);
}

export function versionIncreased(previous, current) {
  const before = stableVersion(previous);
  const after = stableVersion(current);
  const index = before.findIndex((value, i) => value !== after[i]);
  return index !== -1 && after[index] > before[index];
}

export function validateVersions(version, root, manifests, lock) {
  stableVersion(version);
  for (const [label, actual] of [["root", root.version], ["lockfile", lock.version],
    ["lockfile root", lock.packages[""].version]]) {
    if (actual !== version) throw new Error(`${label} version ${actual} does not match ${version}`);
  }
  for (const pkg of manifests) {
    const locked = lock.packages[`packages/${pkg.folder}`];
    if (pkg.version !== version || locked?.version !== version || locked?.name !== pkg.name) {
      throw new Error(`Version or identity mismatch in ${pkg.name}`);
    }
    for (const other of manifests) {
      const range = pkg.dependencies?.[other.name];
      if (range !== undefined && (range !== `^${version}` || locked.dependencies?.[other.name] !== range)) {
        throw new Error(`Internal dependency mismatch: ${pkg.name} -> ${other.name}`);
      }
    }
  }
}

export async function jsonRequest(url, { token, allowMissing = false } = {}) {
  const response = await fetch(url, {
    headers: token ? { Authorization: `Bearer ${token}`, Accept: "application/vnd.github+json" } : {},
    signal: AbortSignal.timeout(30000)
  });
  if (allowMissing && response.status === 404) return null;
  if (!response.ok) throw new Error(`Request failed (${response.status}): ${url}`);
  return response.json();
}

export const github = (endpoint, options = {}) => jsonRequest(
  `https://api.github.com/repos/${process.env.GITHUB_REPOSITORY}/${endpoint}`,
  { token: process.env.GH_TOKEN, ...options }
);

export async function assertUnpublished(manifests, request = jsonRequest) {
  for (const pkg of manifests) {
    const existing = await request(`https://registry.npmjs.org/${encodeURIComponent(pkg.name)}/${pkg.version}`,
      { allowMissing: true });
    if (existing !== null) throw new Error(`${pkg.name}@${pkg.version} is already public; do not retry a partial release`);
  }
}

export async function assertNoReleaseCollision(tag, request = github) {
  if (await request(`git/ref/tags/${tag}`, { allowMissing: true })) throw new Error(`Tag collision: ${tag}`);
  if (await request(`releases/tags/${tag}`, { allowMissing: true })) throw new Error(`Release collision: ${tag}`);
}

export function checkRunState(runs, sha) {
  const matches = runs.filter((run) => run.name === "verify / required" && run.head_sha === sha &&
    run.app?.slug === "github-actions");
  const latest = matches.sort((a, b) => b.id - a.id)[0];
  if (!latest || latest.status !== "completed") return false;
  if (latest.conclusion !== "success") throw new Error(`Required CI concluded ${latest.conclusion}`);
  return true;
}

export async function waitForRequired(loadRuns, sha, { attempts = 180, pause = () => new Promise((r) => setTimeout(r, 20000)) } = {}) {
  for (let attempt = 0; attempt < attempts; attempt++) {
    if (checkRunState(await loadRuns(), sha)) return;
    await pause();
  }
  throw new Error("Timed out waiting for exact-commit required CI");
}

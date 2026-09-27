import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { archiveName, packages, readJson, validateVersions } from "./release-lib.mjs";

export const digest = (bytes, algorithm = "sha256", encoding = "hex") => createHash(algorithm).update(bytes).digest(encoding);

export function packageBom(bom, pkg, manifests) {
  const rootRef = `${pkg.name}@${pkg.version}`;
  const components = new Map(bom.components.map((component) => [component["bom-ref"], component]));
  const edges = new Map(bom.dependencies.map((dependency) => [dependency.ref, dependency]));
  const reachable = new Set();
  const visit = (ref) => {
    if (reachable.has(ref)) return;
    if (!components.has(ref) || !edges.has(ref)) throw new Error(`Incomplete SBOM graph: ${ref}`);
    reachable.add(ref);
    for (const dependency of edges.get(ref).dependsOn ?? []) visit(dependency);
  };
  visit(rootRef);
  for (const manifest of manifests) {
    const component = components.get(`${manifest.name}@${manifest.version}`);
    if (component) component.name = manifest.name;
  }
  // npm's workspace SBOM has a private parent and folder names. Re-root the
  // graph at the published workspace and retain only its runtime/peer closure.
  return {
    ...bom,
    metadata: { ...bom.metadata, component: components.get(rootRef) },
    components: [...reachable].filter((ref) => ref !== rootRef).map((ref) => components.get(ref)),
    dependencies: [...reachable].map((ref) => edges.get(ref))
  };
}

export function verifyManifest(directory) {
  const lines = readFileSync(path.join(directory, "SHA256SUMS"), "utf8").trim().split("\n");
  const seen = new Set();
  for (const line of lines) {
    const match = /^([a-f0-9]{64})  ([A-Za-z0-9][A-Za-z0-9._-]*)$/.exec(line);
    if (!match || seen.has(match[2])) throw new Error("Invalid or duplicate checksum entry");
    const [, expected, file] = match;
    if (digest(readFileSync(path.join(directory, file))) !== expected) throw new Error(`Checksum mismatch: ${file}`);
    seen.add(file);
  }
  return seen;
}

export function npm(args, options = {}) {
  if (!process.env.npm_execpath) throw new Error("Run through npm scripts to select the pinned npm CLI");
  return execFileSync(process.execPath, [process.env.npm_execpath, ...args], {
    encoding: "utf8", maxBuffer: 32 * 1024 * 1024, ...options
  });
}

export function buildArtifacts(directory = "release-artifacts") {
  if (existsSync(directory) && readdirSync(directory).length) throw new Error("Artifact directory must be empty");
  mkdirSync(directory, { recursive: true });
  const root = readJson("package.json");
  const manifests = packages();
  validateVersions(root.version, root, manifests, readJson("package-lock.json"));
  const packed = JSON.parse(npm(["pack", "--workspaces", "--json", "--pack-destination", directory]));
  if (packed.length !== manifests.length) throw new Error("Unexpected package count");
  const bom = JSON.parse(npm(["sbom", "--package-lock-only", "--sbom-format=cyclonedx"]));
  for (const pkg of manifests) {
    const artifact = packed.find((entry) => entry.name === pkg.name);
    if (artifact?.filename !== archiveName(pkg) || artifact.version !== root.version) throw new Error("Unexpected archive identity");
    const files = new Set(artifact.files.map((file) => file.path));
    for (const required of ["package.json", "README.md", "LICENSE", "dist/index.js", "dist/index.d.ts"]) {
      if (!files.has(required)) throw new Error(`${pkg.name} is missing ${required}`);
    }
    const sbom = packageBom(structuredClone(bom), pkg, manifests);
    writeFileSync(path.join(directory, `${artifact.filename}.cdx.json`), `${JSON.stringify(sbom, null, 2)}\n`);
  }
  const sums = readdirSync(directory).sort().map((file) => `${digest(readFileSync(path.join(directory, file)))}  ${file}`);
  writeFileSync(path.join(directory, "SHA256SUMS"), `${sums.join("\n")}\n`);
  verifyManifest(directory);
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  if (process.argv[2] === "verify") verifyManifest(process.argv[3] ?? "release-artifacts");
  else buildArtifacts(process.argv[2]);
}

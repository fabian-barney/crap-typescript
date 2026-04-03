import { readFile } from "node:fs/promises";
import path from "node:path";

const tagRef = process.env.GITHUB_REF_NAME ?? process.argv[2];
if (!tagRef) {
  throw new Error("A tag name is required.");
}

const expectedVersion = tagRef.startsWith("v") ? tagRef.slice(1) : tagRef;
const packageFiles = [
  "packages/core/package.json",
  "packages/cli/package.json",
  "packages/vitest/package.json",
  "packages/jest/package.json"
];

for (const packageFile of packageFiles) {
  const raw = await readFile(path.resolve(packageFile), "utf8");
  const parsed = JSON.parse(raw);
  if (parsed.version !== expectedVersion) {
    throw new Error(`${packageFile} has version ${parsed.version}, expected ${expectedVersion}`);
  }
}


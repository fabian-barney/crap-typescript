import { spawnSync } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

const targets = process.argv.slice(2);

if (targets.length === 0) {
  console.error("Usage: node ./scripts/run-cognitive-typescript-gate.mjs <path...>");
  process.exit(1);
}

const npmCommand = process.platform === "win32" ? "npm.cmd" : "npm";
const temporaryDirectory = mkdtempSync(join(tmpdir(), "cognitive-typescript-gate-"));

try {
  // Run the published CLI outside the repo so local workspaces never shadow npmjs.
  const result = spawnSync(
    npmCommand,
    [
      "exec",
      "--yes",
      "--package=@barney-media/cognitive-typescript@0.1.1",
      "--",
      "cognitive-typescript",
      ...targets.map((target) => resolve(target))
    ],
    {
      cwd: temporaryDirectory,
      shell: process.platform === "win32",
      stdio: "inherit"
    }
  );

  if (result.error) {
    console.error(result.error.message);
    process.exit(1);
  }

  process.exit(result.status ?? 1);
} finally {
  rmSync(temporaryDirectory, { force: true, recursive: true });
}

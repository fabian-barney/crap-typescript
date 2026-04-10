import { spawnSync } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

const targets = process.argv.slice(2);

if (targets.length === 0) {
  console.error("Usage: node ./scripts/run-cognitive-typescript-gate.mjs <path...>");
  process.exit(1);
}

const gateArguments = [
  "exec",
  "--yes",
  "--package=@barney-media/cognitive-typescript@0.1.1",
  "--",
  "cognitive-typescript",
  ...targets.map((target) => resolve(target))
];
const npmCommand = process.env.npm_execpath ? process.execPath : process.platform === "win32" ? "npm.cmd" : "npm";
const npmArguments = process.env.npm_execpath ? [process.env.npm_execpath, ...gateArguments] : gateArguments;
const temporaryDirectory = mkdtempSync(join(tmpdir(), "cognitive-typescript-gate-"));
let exitCode = 1;

try {
  // Run the published CLI outside the repo so local workspaces never shadow npmjs.
  const result = spawnSync(npmCommand, npmArguments, {
    cwd: temporaryDirectory,
    stdio: "inherit"
  });

  if (result.error) {
    console.error(result.error.message);
  } else {
    exitCode = result.status ?? 1;
  }
} finally {
  rmSync(temporaryDirectory, { force: true, recursive: true });
}

process.exitCode = exitCode;

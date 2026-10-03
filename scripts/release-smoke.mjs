import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { archiveName, packages } from "./release-lib.mjs";
import { npm } from "./release-artifacts.mjs";

const directory = mkdtempSync(path.join(tmpdir(), "crap-release-smoke-"));
const registry = process.argv.includes("--registry");
try {
  writeFileSync(path.join(directory, "package.json"), JSON.stringify({ name: "release-consumer", private: true, type: "module" }));
  const dependencies = packages().map((pkg) => registry ? `${pkg.name}@${pkg.version}` :
    path.resolve("release-artifacts", archiveName(pkg)));
  npm(["install", "--prefer-online", "--ignore-scripts", "--no-audit", "--no-fund", ...dependencies], { cwd: directory, stdio: "inherit" });
  const source = `
    import assert from 'node:assert/strict';
    import * as core from '@barney-media/crap-typescript-core';
    import * as cli from '@barney-media/crap-typescript';
    import * as vitest from '@barney-media/crap-typescript-vitest';
    import * as jest from '@barney-media/crap-typescript-jest';
    import * as reporter from '@barney-media/crap-typescript-jest/reporter';
    assert.equal(core.calculateCrapScore(1, 100), 1);
    assert.equal(typeof cli.runCli, 'function');
    assert.ok(Object.values(vitest).some(value => typeof value === 'function'));
    assert.ok(Object.values(jest).some(value => typeof value === 'function'));
    assert.ok(Object.values(reporter).some(value => typeof value === 'function'));
  `;
  execFileSync(process.execPath, ["--input-type=module", "--eval", source], { cwd: directory, stdio: "inherit" });
  execFileSync(process.execPath, ["node_modules/@barney-media/crap-typescript/dist/bin.js", "--help"],
    { cwd: directory, stdio: "inherit" });
  if (registry) npm(["audit", "signatures"], { cwd: directory, stdio: "inherit" });
} finally {
  rmSync(directory, { recursive: true, force: true });
}

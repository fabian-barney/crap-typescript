import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { parseArgs } from "node:util";
import { archiveName, packages, readJson } from "./release-lib.mjs";
import { npm, verifyManifest } from "./release-artifacts.mjs";

const { values } = parseArgs({
  options: {
    registry: { type: "boolean", default: false },
    "artifacts-dir": { type: "string", default: "release-artifacts" }
  }
});
const artifactDirectory = path.resolve(values["artifacts-dir"]);
const manifests = packages();
const lock = readJson("package-lock.json");
const lockedVersion = (name) => lock.packages[`node_modules/${name}`].version;
const currentVitest = lockedVersion("vitest");
assert.equal(lockedVersion("@vitest/coverage-v8"), currentVitest);
if (!values.registry) verifyManifest(artifactDirectory);

function execute(directory, args, scenario, expected = 0) {
  const result = spawnSync(process.execPath, args, {
    cwd: directory,
    env: { ...process.env, CRAP_SMOKE_SCENARIO: scenario },
    encoding: "utf8",
    timeout: 120_000,
    maxBuffer: 16 * 1024 * 1024
  });
  if (result.error) throw result.error;
  assert.equal(
    result.status,
    expected,
    `${scenario}: expected exit ${expected}, got ${result.status}\n${result.stdout}\n${result.stderr}`
  );
  return `${result.stdout}\n${result.stderr}`;
}

function verifyExports(directory) {
  execute(
    directory,
    [
      "--input-type=module",
      "--eval",
      `
    import assert from 'node:assert/strict';
    import * as core from '@barney-media/crap-typescript-core';
    import * as cli from '@barney-media/crap-typescript';
    import { withCrapTypescriptVitest } from '@barney-media/crap-typescript-vitest';
    import { withCrapTypescriptJest } from '@barney-media/crap-typescript-jest';
    import reporter from '@barney-media/crap-typescript-jest/reporter';
    assert.equal(core.calculateCrapScore(1, 100), 1);
    for (const value of [cli.runCli, withCrapTypescriptVitest, withCrapTypescriptJest, reporter]) {
      assert.equal(typeof value, 'function');
    }
  `
    ],
    "exports"
  );
  for (const pkg of manifests) {
    const installed = JSON.parse(readFileSync(path.join(directory, "node_modules", pkg.name, "package.json"), "utf8"));
    assert.equal(installed.version, pkg.version);
    assert.equal(installed.engines.node, ">=22.13.0");
  }
}

function verifyScenario(directory, runner, scenario) {
  const expected = scenario === "error" ? 1 : ["pass", "disabled"].includes(scenario) ? 0 : 2;
  const command =
    runner === "jest"
      ? ["node_modules/jest/bin/jest.js", "--config", "jest.config.mjs", "--runInBand"]
      : ["node_modules/vitest/vitest.mjs", "run", "--config", "vitest.config.mjs"];
  const output = execute(directory, command, scenario, expected);
  const coverageDirectory = path.join(directory, `coverage-${scenario}`);
  const coverage = path.join(coverageDirectory, "coverage-final.json");
  const junit = path.join(coverageDirectory, "crap-typescript-junit.xml");
  if (scenario === "disabled") {
    assert.equal(existsSync(coverage), false);
    assert.equal(existsSync(junit), false);
  } else {
    assert.ok(Object.keys(JSON.parse(readFileSync(coverage, "utf8"))).length > 0);
    if (scenario === "error") {
      assert.match(output, /output must target a report file/);
    } else {
      const report = readFileSync(junit, "utf8");
      assert.match(report, /safe:/);
      if (expected === 2) {
        assert.match(report, /risky:/);
        assert.match(report, /<failure/);
        assert.match(output, /CRAP threshold exceeded/);
      } else {
        assert.doesNotMatch(report, /<failure/);
      }
    }
  }
  if (scenario === "suppressed") assert.doesNotMatch(output, /Test Files|% Stmts/);
}

function verifyCli(directory) {
  const command = ["node_modules/@barney-media/crap-typescript/dist/bin.js"];
  execute(directory, [...command, "--help"], "help");
  mkdirSync(path.join(directory, "coverage"));
  cpSync(
    path.join(directory, "coverage-threshold", "coverage-final.json"),
    path.join(directory, "coverage", "coverage-final.json")
  );
  const sourceFiles = ["src/safe.ts", "src/risky.ts"];
  for (const format of ["json", "toon", "text", "junit", "none"]) {
    const result = spawnSync(process.execPath, [...command, "--format", format, ...sourceFiles], {
      cwd: directory,
      encoding: "utf8",
      timeout: 120_000
    });
    if (result.error) throw result.error;
    assert.equal(result.status, 2, `${format}: ${result.stdout}\n${result.stderr}`);
    if (format === "none") assert.equal(result.stdout, "");
    else if (format === "json") {
      const report = JSON.parse(result.stdout);
      assert.equal(report.status, "failed");
      assert.equal(report.threshold, 6);
      assert.ok(report.methods.some((method) => method.method.includes("risky")));
      assert.ok(
        report.methods.every((method) => method.crap !== null),
        "Consumer coverage must remain measurable"
      );
    } else assert.match(result.stdout, /risky/);
  }
  execute(directory, [...command, "--format", "json", "--threshold", "999", ...sourceFiles], "cli-pass");
}

function verifyConsumer(runner, vitestVersion) {
  const temporaryRoot = path.resolve(tmpdir());
  const directory = mkdtempSync(path.join(temporaryRoot, "crap-release-smoke-"));
  try {
    cpSync(path.resolve("tests/fixtures/release-consumer"), directory, { recursive: true });
    writeFileSync(
      path.join(directory, "package.json"),
      JSON.stringify({
        name: "release-consumer",
        private: true,
        type: "module"
      })
    );
    const dependencies = manifests.map((pkg) =>
      values.registry ? `${pkg.name}@${pkg.version}` : path.join(artifactDirectory, archiveName(pkg))
    );
    npm(
      [
        "install",
        "--prefer-online",
        "--ignore-scripts",
        "--strict-peer-deps",
        "--engine-strict",
        "--no-audit",
        "--no-fund",
        ...dependencies,
        `vitest@${vitestVersion}`,
        `@vitest/coverage-v8@${vitestVersion}`,
        `vite@${lockedVersion("vite")}`,
        `jest@${lockedVersion("jest")}`,
        `ts-jest@${lockedVersion("ts-jest")}`,
        `typescript@${lockedVersion("typescript")}`
      ],
      { cwd: directory, stdio: "inherit" }
    );
    for (const name of ["vitest", "@vitest/coverage-v8"]) {
      const installed = JSON.parse(readFileSync(path.join(directory, "node_modules", name, "package.json"), "utf8"));
      assert.equal(installed.version, vitestVersion);
    }
    verifyExports(directory);
    for (const scenario of runner === "jest"
      ? ["pass", "threshold", "error"]
      : ["pass", "threshold", "suppressed", "disabled", "error"]) {
      verifyScenario(directory, runner, scenario);
    }
    verifyCli(directory);
    if (values.registry) npm(["audit", "signatures"], { cwd: directory, stdio: "inherit" });
    console.log(`Verified ${runner} consumer (Vitest ${vitestVersion}, Node ${process.versions.node})`);
  } finally {
    assert.equal(path.dirname(directory), temporaryRoot);
    assert.ok(path.basename(directory).startsWith("crap-release-smoke-"));
    rmSync(directory, { recursive: true, force: true });
  }
}

verifyConsumer("vitest", "4.1.12");
verifyConsumer("vitest", currentVitest);
verifyConsumer("jest", currentVitest);

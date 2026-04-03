import path from "node:path";

import { COVERAGE_REPORT_RELATIVE_PATH } from "./constants";
import { locateCoverageReport, resolvePackageManager, resolveTestRunner } from "./moduleResolution";
import type { CommandExecutor, CoverageMode, CoverageCommand, PackageManager, TestRunner } from "./types";

export async function ensureCoverageReport(
  projectRoot: string,
  moduleRoot: string,
  packageManagerSelection: PackageManager | "auto",
  testRunnerSelection: TestRunner | "auto",
  coverageMode: CoverageMode,
  executor: CommandExecutor
): Promise<{ coverageSourcePath: string | null; coverageSourceRoot: string | null; command: CoverageCommand | null }> {
  const existing = await locateCoverageReport(projectRoot, moduleRoot);
  if (existing) {
    return {
      coverageSourcePath: existing.lcovPath,
      coverageSourceRoot: existing.sourceRoot,
      command: null
    };
  }

  if (coverageMode === "existing-only") {
    return {
      coverageSourcePath: null,
      coverageSourceRoot: null,
      command: null
    };
  }

  const packageManager = await resolvePackageManager(packageManagerSelection, projectRoot, moduleRoot);
  const testRunner = await resolveTestRunner(testRunnerSelection, projectRoot, moduleRoot);
  const command = buildCoverageCommand(packageManager, testRunner, moduleRoot);
  const exitCode = await executor.execute(command);
  if (exitCode !== 0) {
    throw new Error(`Coverage command failed with exit ${exitCode}`);
  }

  const generated = await locateCoverageReport(projectRoot, moduleRoot);
  return {
    coverageSourcePath: generated?.lcovPath ?? null,
    coverageSourceRoot: generated?.sourceRoot ?? null,
    command
  };
}

export function expectedCoveragePath(moduleRoot: string): string {
  return path.join(moduleRoot, COVERAGE_REPORT_RELATIVE_PATH);
}

export function buildCoverageCommand(
  packageManager: PackageManager,
  testRunner: TestRunner,
  cwd: string
): CoverageCommand {
  return {
    command: packageManager,
    args: testRunner === "vitest" ? vitestArguments(packageManager) : jestArguments(packageManager),
    cwd,
    packageManager,
    testRunner
  };
}

function vitestArguments(packageManager: PackageManager): string[] {
  switch (packageManager) {
    case "npm":
      return [
        "exec",
        "--no",
        "--",
        "vitest",
        "run",
        "--coverage.enabled=true",
        "--coverage.reporter=lcov",
        "--coverage.reporter=text"
      ];
    case "pnpm":
      return [
        "exec",
        "vitest",
        "run",
        "--coverage.enabled=true",
        "--coverage.reporter=lcov",
        "--coverage.reporter=text"
      ];
    case "yarn":
      return [
        "vitest",
        "run",
        "--coverage.enabled=true",
        "--coverage.reporter=lcov",
        "--coverage.reporter=text"
      ];
  }
}

function jestArguments(packageManager: PackageManager): string[] {
  switch (packageManager) {
    case "npm":
      return [
        "exec",
        "--no",
        "--",
        "jest",
        "--coverage",
        "--runInBand",
        "--coverageReporters=lcov",
        "--coverageReporters=text"
      ];
    case "pnpm":
      return [
        "exec",
        "jest",
        "--coverage",
        "--runInBand",
        "--coverageReporters=lcov",
        "--coverageReporters=text"
      ];
    case "yarn":
      return [
        "jest",
        "--coverage",
        "--runInBand",
        "--coverageReporters=lcov",
        "--coverageReporters=text"
      ];
  }
}


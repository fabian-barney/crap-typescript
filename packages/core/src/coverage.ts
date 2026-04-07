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
  coverageReportPath: string | undefined,
  executor: CommandExecutor
): Promise<{ coverageSourcePath: string | null; coverageSourceRoot: string | null; command: CoverageCommand | null }> {
  const existing = await locateCoverageReport(projectRoot, moduleRoot, coverageReportPath);
  if (existing) {
    return {
      coverageSourcePath: existing.reportPath,
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
  const command = buildCoverageCommand(packageManager, testRunner, moduleRoot, coverageReportPath);
  const exitCode = await executor.execute(command);
  if (exitCode !== 0) {
    throw new Error(`Coverage command failed with exit ${exitCode}`);
  }

  const generated = await locateCoverageReport(projectRoot, moduleRoot, coverageReportPath);
  return {
    coverageSourcePath: generated?.reportPath ?? null,
    coverageSourceRoot: generated?.sourceRoot ?? null,
    command
  };
}

export function expectedCoveragePath(moduleRoot: string, coverageReportPath = COVERAGE_REPORT_RELATIVE_PATH): string {
  return path.isAbsolute(coverageReportPath)
    ? coverageReportPath
    : path.join(moduleRoot, coverageReportPath);
}

export function buildCoverageCommand(
  packageManager: PackageManager,
  testRunner: TestRunner,
  cwd: string,
  coverageReportPath = COVERAGE_REPORT_RELATIVE_PATH
): CoverageCommand {
  return {
    command: packageManager,
    args: testRunner === "vitest"
      ? vitestArguments(packageManager, coverageReportPath)
      : jestArguments(packageManager, coverageReportPath),
    cwd,
    packageManager,
    testRunner
  };
}

function vitestArguments(packageManager: PackageManager, coverageReportPath: string): string[] {
  const reportsDirectory = path.dirname(coverageReportPath);
  switch (packageManager) {
    case "npm":
      return [
        "exec",
        "--no",
        "--",
        "vitest",
        "run",
        "--coverage.enabled=true",
        "--coverage.reporter=json",
        "--coverage.reporter=text",
        `--coverage.reportsDirectory=${reportsDirectory}`
      ];
    case "pnpm":
      return [
        "exec",
        "vitest",
        "run",
        "--coverage.enabled=true",
        "--coverage.reporter=json",
        "--coverage.reporter=text",
        `--coverage.reportsDirectory=${reportsDirectory}`
      ];
    case "yarn":
      return [
        "vitest",
        "run",
        "--coverage.enabled=true",
        "--coverage.reporter=json",
        "--coverage.reporter=text",
        `--coverage.reportsDirectory=${reportsDirectory}`
      ];
  }
}

function jestArguments(packageManager: PackageManager, coverageReportPath: string): string[] {
  const coverageDirectory = path.dirname(coverageReportPath);
  switch (packageManager) {
    case "npm":
      return [
        "exec",
        "--no",
        "--",
        "jest",
        "--coverage",
        "--runInBand",
        "--coverageReporters=json",
        "--coverageReporters=text",
        `--coverageDirectory=${coverageDirectory}`
      ];
    case "pnpm":
      return [
        "exec",
        "jest",
        "--coverage",
        "--runInBand",
        "--coverageReporters=json",
        "--coverageReporters=text",
        `--coverageDirectory=${coverageDirectory}`
      ];
    case "yarn":
      return [
        "jest",
        "--coverage",
        "--runInBand",
        "--coverageReporters=json",
        "--coverageReporters=text",
        `--coverageDirectory=${coverageDirectory}`
      ];
  }
}

import path from "node:path";

import { COVERAGE_REPORT_RELATIVE_PATH } from "./constants.js";
import { locateCoverageReport, resolvePackageManager, resolveTestRunner } from "./moduleResolution.js";
import { isAbsolutePath } from "./utils.js";
import type { CommandExecutor, CoverageMode, CoverageCommand, PackageManager, TestRunner } from "./types.js";

export async function ensureCoverageReport(
  projectRoot: string,
  moduleRoot: string,
  packageManagerSelection: PackageManager | "auto",
  testRunnerSelection: TestRunner | "auto",
  coverageMode: CoverageMode,
  coverageReportPath: string | undefined,
  executor: CommandExecutor
): Promise<{ coverageSourcePath: string | null; coverageSourceRoot: string | null; command: CoverageCommand | null }> {
  const existing = await resolveExistingCoverage(projectRoot, moduleRoot, coverageReportPath);
  if (existing) {
    return existing;
  }
  if (coverageMode === "existing-only") {
    return emptyCoverageResolution();
  }

  const packageManager = await resolvePackageManager(packageManagerSelection, projectRoot, moduleRoot);
  const testRunner = await resolveTestRunner(testRunnerSelection, projectRoot, moduleRoot);
  const command = buildCoverageCommand(packageManager, testRunner, moduleRoot, coverageReportPath);
  await executeCoverageCommand(command, executor);
  return attachCoverageCommand(await locateCoverageReport(projectRoot, moduleRoot, coverageReportPath), command);
}

export function expectedCoveragePath(moduleRoot: string, coverageReportPath = COVERAGE_REPORT_RELATIVE_PATH): string {
  return isAbsolutePath(coverageReportPath)
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

async function resolveExistingCoverage(
  projectRoot: string,
  moduleRoot: string,
  coverageReportPath: string | undefined
): Promise<{ coverageSourcePath: string | null; coverageSourceRoot: string | null; command: CoverageCommand | null } | null> {
  const existing = await locateCoverageReport(projectRoot, moduleRoot, coverageReportPath);
  return existing ? attachCoverageCommand(existing, null) : null;
}

function emptyCoverageResolution(): { coverageSourcePath: null; coverageSourceRoot: null; command: null } {
  return {
    coverageSourcePath: null,
    coverageSourceRoot: null,
    command: null
  };
}

async function executeCoverageCommand(command: CoverageCommand, executor: CommandExecutor): Promise<void> {
  const exitCode = await executor.execute(command);
  if (exitCode !== 0) {
    throw new Error(
      `Coverage command failed with exit ${exitCode} for ${command.packageManager}/${command.testRunner} in ${command.cwd}: ${formatCoverageCommand(command)}`
    );
  }
}

function formatCoverageCommand(command: CoverageCommand): string {
  return [command.command, ...command.args].join(" ");
}

function attachCoverageCommand(
  coverageSource: { reportPath: string; sourceRoot: string } | null,
  command: CoverageCommand | null
): { coverageSourcePath: string | null; coverageSourceRoot: string | null; command: CoverageCommand | null } {
  if (!coverageSource) {
    return {
      coverageSourcePath: null,
      coverageSourceRoot: null,
      command
    };
  }
  return {
    coverageSourcePath: coverageSource.reportPath,
    coverageSourceRoot: coverageSource.sourceRoot,
    command
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

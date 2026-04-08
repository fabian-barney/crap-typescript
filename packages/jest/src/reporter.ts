import { access } from "node:fs/promises";
import path from "node:path";

import {
  analyzeProject,
  COVERAGE_REPORT_RELATIVE_PATH,
  CRAP_THRESHOLD,
  formatReport,
  NO_FILES_MESSAGE
} from "@barney-media/crap-typescript-core";
import type { PackageManagerSelection, Writer } from "@barney-media/crap-typescript-core";

export interface CrapTypescriptJestOptions {
  projectRoot?: string;
  changedOnly?: boolean;
  paths?: string[];
  packageManager?: PackageManagerSelection;
  coverageReportPath?: string;
  stdout?: Writer;
  stderr?: Writer;
}

interface ResolvedReporterOptions {
  projectRoot: string;
  paths: string[];
  changedOnly: boolean;
  packageManager: PackageManagerSelection;
  coverageReportPath: string;
  stdout: Writer;
  stderr: Writer;
}

export default class CrapTypescriptJestReporter {
  private error: Error | undefined;
  private finalizeScheduled = false;

  constructor(
    _globalConfig?: unknown,
    private readonly options: CrapTypescriptJestOptions = {}
  ) {}

  onRunComplete(): void {
    if (this.finalizeScheduled) {
      return;
    }
    this.finalizeScheduled = true;
    process.once("beforeExit", () => {
      void this.finalize();
    });
  }

  private async finalize(): Promise<void> {
    const options = resolveReporterOptions(this.options);
    try {
      await waitForCoverageReport(options.projectRoot, options.coverageReportPath);
      const result = await analyzeProject({
        projectRoot: options.projectRoot,
        explicitPaths: options.paths,
        changedOnly: options.changedOnly,
        packageManager: options.packageManager,
        testRunner: "jest",
        coverageMode: "existing-only",
        coverageReportPath: options.coverageReportPath,
        stdout: options.stdout,
        stderr: options.stderr
      });

      if (result.selectedFiles.length === 0) {
        options.stdout.write(`${NO_FILES_MESSAGE}\n`);
        return;
      }

      options.stdout.write(`${formatReport(result.metrics)}\n`);
      if (result.thresholdExceeded) {
        this.error = createThresholdExceededError(result.maxCrap);
        options.stderr.write(`${this.error.message}\n`);
        process.exitCode = 1;
      }
    } catch (error) {
      this.error = toError(error);
      options.stderr.write(`${this.error.message}\n`);
      process.exitCode = 1;
    }
  }

  getLastError(): Error | undefined {
    return this.error;
  }
}

async function waitForCoverageReport(projectRoot: string, coverageReportPath: string): Promise<void> {
  const coveragePath = resolveCoveragePath(projectRoot, coverageReportPath);
  for (let attempt = 0; attempt < 40; attempt += 1) {
    try {
      await access(coveragePath);
      return;
    } catch {
      await new Promise((resolve) => {
        setTimeout(resolve, 50);
      });
    }
  }
}

function resolveCoveragePath(projectRoot: string, coverageReportPath: string): string {
  return path.isAbsolute(coverageReportPath)
    ? coverageReportPath
    : path.join(projectRoot, coverageReportPath);
}

function resolveReporterOptions(options: CrapTypescriptJestOptions): ResolvedReporterOptions {
  return {
    ...resolveAnalysisOptions(options),
    ...resolveOutputWriters(options)
  };
}

function createThresholdExceededError(maxCrap: number): Error {
  return new Error(`CRAP threshold exceeded: ${maxCrap.toFixed(1)} > ${CRAP_THRESHOLD.toFixed(1)}`);
}

function toError(error: unknown): Error {
  return error instanceof Error ? error : new Error(String(error));
}

function resolveAnalysisOptions(
  options: CrapTypescriptJestOptions
): Omit<ResolvedReporterOptions, "stdout" | "stderr"> {
  return {
    projectRoot: options.projectRoot ?? process.cwd(),
    paths: options.paths ?? [],
    changedOnly: options.changedOnly ?? false,
    packageManager: options.packageManager ?? "auto",
    coverageReportPath: options.coverageReportPath ?? COVERAGE_REPORT_RELATIVE_PATH
  };
}

function resolveOutputWriters(
  options: CrapTypescriptJestOptions
): Pick<ResolvedReporterOptions, "stdout" | "stderr"> {
  return {
    stdout: options.stdout ?? process.stdout,
    stderr: options.stderr ?? process.stderr
  };
}

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
    const projectRoot = this.options.projectRoot ?? process.cwd();
    const stdout = this.options.stdout ?? process.stdout;
    const stderr = this.options.stderr ?? process.stderr;
    const coverageReportPath = this.options.coverageReportPath ?? COVERAGE_REPORT_RELATIVE_PATH;
    try {
      await waitForCoverageReport(projectRoot, coverageReportPath);
      const result = await analyzeProject({
        projectRoot,
        explicitPaths: this.options.paths ?? [],
        changedOnly: this.options.changedOnly ?? false,
        packageManager: this.options.packageManager ?? "auto",
        testRunner: "jest",
        coverageMode: "existing-only",
        coverageReportPath,
        stdout,
        stderr
      });

      if (result.selectedFiles.length === 0) {
        stdout.write(`${NO_FILES_MESSAGE}\n`);
        return;
      }

      stdout.write(`${formatReport(result.metrics)}\n`);
      if (result.thresholdExceeded) {
        this.error = new Error(
          `CRAP threshold exceeded: ${result.maxCrap.toFixed(1)} > ${CRAP_THRESHOLD.toFixed(1)}`
        );
        stderr.write(`${this.error.message}\n`);
        process.exitCode = 1;
      }
    } catch (error) {
      this.error = error as Error;
      stderr.write(`${this.error.message}\n`);
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

import { access, mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

import {
  analyzeProject,
  COVERAGE_REPORT_RELATIVE_PATH,
  formatAnalysisReport,
  validateReportPathTargets
} from "@barney-media/crap-typescript-core";
import type { PackageManagerSelection, ReportFormat, Writer } from "@barney-media/crap-typescript-core";

export interface CrapTypescriptJestOptions {
  projectRoot?: string;
  changedOnly?: boolean;
  paths?: string[];
  packageManager?: PackageManagerSelection;
  coverageReportPath?: string;
  threshold?: number;
  format?: ReportFormat;
  agent?: boolean;
  failuresOnly?: boolean;
  omitRedundancy?: boolean;
  output?: string;
  junit?: boolean;
  junitReport?: string;
  stdout?: Writer;
  stderr?: Writer;
}

interface ResolvedReporterOptions {
  projectRoot: string;
  paths: string[];
  changedOnly: boolean;
  packageManager: PackageManagerSelection;
  coverageReportPath: string;
  threshold: number | undefined;
  format: ReportFormat;
  agent: boolean;
  failuresOnly: boolean | undefined;
  omitRedundancy: boolean | undefined;
  output: string | undefined;
  junit: boolean;
  junitReport: string;
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
      await validateReporterReportPaths(options);
      await waitForCoverageReport(options.projectRoot, options.coverageReportPath);
      const result = await analyzeProject({
        projectRoot: options.projectRoot,
        explicitPaths: options.paths,
        changedOnly: options.changedOnly,
        packageManager: options.packageManager,
        testRunner: "jest",
        threshold: options.threshold,
        coverageMode: "existing-only",
        coverageReportPath: options.coverageReportPath,
        stdout: options.stdout,
        stderr: options.stderr
      });

      await writeReporterReports(result.metrics, options);
      if (result.thresholdExceeded) {
        this.error = createThresholdExceededError(result.maxCrap, result.threshold);
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

function createThresholdExceededError(maxCrap: number, threshold: number): Error {
  return new Error(`CRAP threshold exceeded: ${maxCrap.toFixed(1)} > ${threshold.toFixed(1)}`);
}

function toError(error: unknown): Error {
  return error instanceof Error ? error : new Error(String(error));
}

function resolveAnalysisOptions(
  options: CrapTypescriptJestOptions
): Omit<ResolvedReporterOptions, "stdout" | "stderr"> {
  const coverageReportPath = resolveCoverageReportPathOption(options);
  return {
    projectRoot: resolveProjectRoot(options),
    paths: resolvePaths(options),
    changedOnly: resolveChangedOnly(options),
    packageManager: resolvePackageManager(options),
    coverageReportPath,
    threshold: options.threshold,
    format: resolveFormat(options),
    agent: resolveAgent(options),
    failuresOnly: options.failuresOnly,
    omitRedundancy: options.omitRedundancy,
    output: options.output,
    junit: resolveJunit(options),
    junitReport: resolveJunitReport(options, coverageReportPath)
  };
}

function resolveProjectRoot(options: CrapTypescriptJestOptions): string {
  return options.projectRoot ?? process.cwd();
}

function resolvePaths(options: CrapTypescriptJestOptions): string[] {
  return options.paths ?? [];
}

function resolveChangedOnly(options: CrapTypescriptJestOptions): boolean {
  return options.changedOnly ?? false;
}

function resolvePackageManager(options: CrapTypescriptJestOptions): PackageManagerSelection {
  return options.packageManager ?? "auto";
}

function resolveCoverageReportPathOption(options: CrapTypescriptJestOptions): string {
  return options.coverageReportPath ?? COVERAGE_REPORT_RELATIVE_PATH;
}

function resolveFormat(options: CrapTypescriptJestOptions): ReportFormat {
  return options.format ?? (options.agent ? "toon" : "none");
}

function resolveAgent(options: CrapTypescriptJestOptions): boolean {
  return options.agent ?? false;
}

function resolveJunit(options: CrapTypescriptJestOptions): boolean {
  return options.junit ?? true;
}

function resolveJunitReport(options: CrapTypescriptJestOptions, coverageReportPath: string): string {
  return options.junitReport === undefined
    ? buildJunitReportFromCoverage(coverageReportPath)
    : options.junitReport;
}

function resolveOutputWriters(
  options: CrapTypescriptJestOptions
): Pick<ResolvedReporterOptions, "stdout" | "stderr"> {
  return {
    stdout: options.stdout ?? process.stdout,
    stderr: options.stderr ?? process.stderr
  };
}

async function writeReporterReports(
  metrics: Awaited<ReturnType<typeof analyzeProject>>["metrics"],
  options: ResolvedReporterOptions
): Promise<void> {
  const primaryReport = formatAnalysisReport(metrics, {
    format: options.format,
    agent: options.agent,
    threshold: options.threshold,
    failuresOnly: options.failuresOnly,
    omitRedundancy: options.omitRedundancy
  });
  if (options.output) {
    await writeReportFile(options.projectRoot, options.output, primaryReport);
  } else {
    options.stdout.write(primaryReport);
  }

  if (options.junit) {
    await writeReportFile(options.projectRoot, options.junitReport, formatAnalysisReport(metrics, {
      format: "junit",
      threshold: options.threshold
    }));
  }
}

async function validateReporterReportPaths(options: ResolvedReporterOptions): Promise<void> {
  await validateReportPathTargets(options.projectRoot, [
    { label: "output", path: options.output },
    { label: "junitReport", path: options.junit ? options.junitReport : undefined }
  ]);
}

async function writeReportFile(projectRoot: string, reportPath: string, content: string): Promise<void> {
  const absolutePath = path.resolve(projectRoot, reportPath);
  await mkdir(path.dirname(absolutePath), { recursive: true });
  await writeFile(absolutePath, content);
}

function buildJunitReportFromCoverage(coverageReportPath: string): string {
  return `${path.dirname(coverageReportPath).replace(/\\/g, "/")}/crap-typescript-junit.xml`;
}

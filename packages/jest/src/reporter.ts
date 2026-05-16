import { access, mkdir, stat, writeFile } from "node:fs/promises";
import path from "node:path";

import {
  analyzeProject,
  changedTypeScriptFilesUnderSourceRoots,
  COVERAGE_REPORT_RELATIVE_PATH,
  expandExplicitPaths,
  filterSourceFiles,
  findAllTypeScriptFilesUnderSourceRoots,
  formatAnalysisReport,
  validateReportPathTargets
} from "@barney-media/crap-typescript-core";
import type {
  PackageManagerSelection,
  ReportFormat,
  SourceExclusionAudit,
  Writer
} from "@barney-media/crap-typescript-core";

const DEFAULT_COVERAGE_REPORT_WAIT_MS = 5_000;
const COVERAGE_REPORT_POLL_INTERVAL_MS = 100;

export interface CrapTypescriptJestOptions {
  projectRoot?: string;
  changedOnly?: boolean;
  paths?: string[];
  packageManager?: PackageManagerSelection;
  coverageReportPath?: string;
  coverageReportWaitMs?: number;
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
  excludes?: string[];
  excludePathRegexes?: string[];
  excludeGeneratedMarkers?: string[];
  useDefaultExclusions?: boolean;
}

interface ResolvedReporterOptions {
  projectRoot: string;
  paths: string[];
  changedOnly: boolean;
  packageManager: PackageManagerSelection;
  coverageReportPath: string;
  coverageReportWaitMs: number;
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
  excludes: string[] | undefined;
  excludePathRegexes: string[] | undefined;
  excludeGeneratedMarkers: string[] | undefined;
  useDefaultExclusions: boolean | undefined;
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
    try {
      const options = resolveReporterOptions(this.options);
      await validateReporterReportPaths(options);
      await waitForCoverageReport(options);
      const result = await analyzeProject({
        projectRoot: options.projectRoot,
        explicitPaths: options.paths,
        changedOnly: options.changedOnly,
        packageManager: options.packageManager,
        testRunner: "jest",
        threshold: options.threshold,
        coverageMode: "existing-only",
        coverageReportPath: options.coverageReportPath,
        excludes: options.excludes,
        excludePathRegexes: options.excludePathRegexes,
        excludeGeneratedMarkers: options.excludeGeneratedMarkers,
        useDefaultExclusions: options.useDefaultExclusions,
        stdout: options.stdout,
        stderr: options.stderr
      });

      await writeReporterReports(result.metrics, result.sourceExclusionAudit, options);
      if (result.thresholdExceeded) {
        this.error = createThresholdExceededError(result.maxCrap, result.threshold);
        options.stderr.write(`${this.error.message}\n`);
        process.exitCode = 1;
      }
    } catch (error) {
      this.error = toError(error);
      (this.options.stderr ?? process.stderr).write(`${this.error.message}\n`);
      process.exitCode = 1;
    }
  }

  getLastError(): Error | undefined {
    return this.error;
  }
}

async function waitForCoverageReport(options: ResolvedReporterOptions): Promise<void> {
  const coveragePaths = await resolveCoverageWaitPaths(options);
  const deadline = Date.now() + options.coverageReportWaitMs;
  while (true) {
    if (await coverageReportsReady(coveragePaths)) {
      return;
    }
    if (Date.now() >= deadline) {
      throw new Error(
        `Timed out after ${options.coverageReportWaitMs}ms waiting for Jest coverage report at ${formatCoveragePaths(coveragePaths.displayPaths)}`
      );
    }
    await sleep(Math.min(COVERAGE_REPORT_POLL_INTERVAL_MS, Math.max(1, deadline - Date.now())));
  }
}

interface CoverageWaitPaths {
  projectReportPath: string;
  moduleReportPaths: string[];
  displayPaths: string[];
}

async function coverageReportsReady(coveragePaths: CoverageWaitPaths): Promise<boolean> {
  if (await exists(coveragePaths.projectReportPath)) {
    return true;
  }
  for (const coveragePath of coveragePaths.moduleReportPaths) {
    if (!(await exists(coveragePath))) {
      return false;
    }
  }
  return coveragePaths.moduleReportPaths.length > 0;
}

async function resolveCoverageWaitPaths(options: ResolvedReporterOptions): Promise<CoverageWaitPaths> {
  if (path.isAbsolute(options.coverageReportPath)) {
    return {
      projectReportPath: options.coverageReportPath,
      moduleReportPaths: [],
      displayPaths: [options.coverageReportPath]
    };
  }
  const projectReportPath = path.join(options.projectRoot, options.coverageReportPath);
  const moduleReportPaths = (await coverageWaitRoots(options))
    .map((root) => path.join(root, options.coverageReportPath));
  return {
    projectReportPath,
    moduleReportPaths,
    displayPaths: [...new Set([projectReportPath, ...moduleReportPaths])]
  };
}

async function coverageWaitRoots(options: ResolvedReporterOptions): Promise<string[]> {
  const candidateFiles = await coverageWaitCandidateFiles(options);
  const filteredFiles = (await filterSourceFiles(options.projectRoot, candidateFiles, options)).files;
  const roots = filteredFiles.length === 0 ? [path.resolve(options.projectRoot)] : [];
  for (const filePath of filteredFiles) {
    roots.push(await nearestPackageRoot(options.projectRoot, filePath));
  }
  return [...new Set(roots)];
}

async function coverageWaitCandidateFiles(options: ResolvedReporterOptions): Promise<string[]> {
  if (options.changedOnly) {
    return changedTypeScriptFilesUnderSourceRoots(options.projectRoot);
  }
  if (options.paths.length > 0) {
    return expandExplicitPaths(options.projectRoot, options.paths);
  }
  return findAllTypeScriptFilesUnderSourceRoots(options.projectRoot);
}

async function nearestPackageRoot(projectRoot: string, candidatePath: string): Promise<string> {
  const normalizedProjectRoot = path.resolve(projectRoot);
  let current = await startDirectory(candidatePath);
  while (isWithinOrEqual(current, normalizedProjectRoot)) {
    if (await exists(path.join(current, "package.json"))) {
      return current;
    }
    if (current === normalizedProjectRoot) {
      break;
    }
    current = path.dirname(current);
  }
  return normalizedProjectRoot;
}

async function startDirectory(candidatePath: string): Promise<string> {
  const candidateStats = await statIfExists(candidatePath);
  return candidateStats?.isDirectory() ? candidatePath : path.dirname(candidatePath);
}

async function exists(filePath: string): Promise<boolean> {
  try {
    await access(filePath);
    return true;
  } catch {
    return false;
  }
}

async function statIfExists(filePath: string): Promise<Awaited<ReturnType<typeof stat>> | null> {
  try {
    return await stat(filePath);
  } catch {
    return null;
  }
}

function isWithinOrEqual(candidatePath: string, parentPath: string): boolean {
  const relative = path.relative(parentPath, candidatePath);
  return relative === "" || (!relative.startsWith("..") && !path.isAbsolute(relative));
}

function formatCoveragePaths(coveragePaths: string[]): string {
  return coveragePaths.join(" or ");
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
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
    coverageReportWaitMs: resolveCoverageReportWaitMs(options),
    threshold: options.threshold,
    format: resolveFormat(options),
    agent: resolveAgent(options),
    failuresOnly: options.failuresOnly,
    omitRedundancy: options.omitRedundancy,
    output: options.output,
    junit: resolveJunit(options),
    junitReport: resolveJunitReport(options, coverageReportPath),
    excludes: options.excludes,
    excludePathRegexes: options.excludePathRegexes,
    excludeGeneratedMarkers: options.excludeGeneratedMarkers,
    useDefaultExclusions: options.useDefaultExclusions
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

function resolveCoverageReportWaitMs(options: CrapTypescriptJestOptions): number {
  const waitMs = options.coverageReportWaitMs ?? DEFAULT_COVERAGE_REPORT_WAIT_MS;
  if (!Number.isFinite(waitMs) || waitMs < 0) {
    throw new Error("coverageReportWaitMs must be a non-negative finite number");
  }
  return waitMs;
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
  sourceExclusionAudit: SourceExclusionAudit,
  options: ResolvedReporterOptions
): Promise<void> {
  const primaryReport = formatAnalysisReport(metrics, {
    format: options.format,
    agent: options.agent,
    threshold: options.threshold,
    failuresOnly: options.failuresOnly,
    omitRedundancy: options.omitRedundancy,
    sourceExclusionAudit
  });
  if (options.output) {
    await writeReportFile(options.projectRoot, options.output, primaryReport);
  } else {
    options.stdout.write(primaryReport);
  }

  if (options.junit) {
    await writeReportFile(options.projectRoot, options.junitReport, formatAnalysisReport(metrics, {
      format: "junit",
      threshold: options.threshold,
      sourceExclusionAudit
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

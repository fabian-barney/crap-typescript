import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

import { analyzeProject, CRAP_THRESHOLD, formatAnalysisReport } from "@barney-media/crap-typescript-core";
import type { PackageManagerSelection, ReportFormat, Writer } from "@barney-media/crap-typescript-core";

type VitestReporterEntry = string | [string, unknown] | {
  onTestRunEnd?: () => Promise<void>;
  onFinishedReportCoverage?: () => Promise<void>;
};
type VitestConfig = Record<string, unknown> & {
  test?: Record<string, unknown> & {
    coverage?: Record<string, unknown> & {
      enabled?: boolean;
      provider?: string;
      reporter?: Array<string | [string, unknown]> | string;
      reportsDirectory?: string;
    };
    reporters?: VitestReporterEntry[] | VitestReporterEntry;
  };
};

export interface CrapTypescriptVitestOptions {
  projectRoot?: string;
  changedOnly?: boolean;
  paths?: string[];
  packageManager?: PackageManagerSelection;
  coverageReportPath?: string;
  format?: ReportFormat;
  agent?: boolean;
  outputPath?: string;
  junitReportPath?: string | false;
  stdout?: Writer;
  stderr?: Writer;
}

export class CrapTypescriptVitestReporter {
  constructor(private readonly options: CrapTypescriptVitestOptions = {}) {}

  async onFinishedReportCoverage(): Promise<void> {
    const options = resolveReporterOptions(this.options);
    const result = await analyzeProject({
      projectRoot: options.projectRoot,
      explicitPaths: options.paths,
      changedOnly: options.changedOnly,
      packageManager: options.packageManager,
      testRunner: "vitest",
      coverageMode: "existing-only",
      coverageReportPath: options.coverageReportPath,
      stdout: options.stdout,
      stderr: options.stderr
    });

    await writeReporterReports(result.metrics, options);
    if (result.thresholdExceeded) {
      const error = `CRAP threshold exceeded: ${result.maxCrap.toFixed(1)} > ${CRAP_THRESHOLD.toFixed(1)}`;
      options.stderr.write(`${error}\n`);
      process.exitCode = 1;
    }
  }
}

export function withCrapTypescriptVitest(
  config: VitestConfig = {},
  options: CrapTypescriptVitestOptions = {}
): VitestConfig {
  const testConfig = config.test ?? {};
  const coverage = testConfig.coverage ?? {};
  const coverageReporters = ensureReporterEntries(asArray(coverage.reporter), "json", "text");
  const reporters = ensureDefaultReporter(asArray(testConfig.reporters));
  reporters.push(new CrapTypescriptVitestReporter({
    ...options,
    coverageReportPath: options.coverageReportPath ?? buildCoverageReportPath(coverage.reportsDirectory),
    junitReportPath: options.junitReportPath === undefined
      ? buildJunitReportPath(coverage.reportsDirectory)
      : options.junitReportPath
  }));

  return {
    ...config,
    test: {
      ...testConfig,
      coverage: {
        ...coverage,
        enabled: true,
        provider: coverage.provider ?? "v8",
        reporter: coverageReporters,
        reportsDirectory: coverage.reportsDirectory ?? "coverage"
      },
      reporters
    }
  };
}

function asArray<T>(value: T | T[] | undefined): T[] {
  if (value === undefined) {
    return [];
  }
  return Array.isArray(value) ? [...value] : [value];
}

function ensureReporterEntries(
  existing: Array<string | [string, unknown]>,
  ...reporters: string[]
): Array<string | [string, unknown]> {
  const result = [...existing];
  for (const reporter of reporters) {
    if (!result.some((entry) => (Array.isArray(entry) ? entry[0] : entry) === reporter)) {
      result.push(reporter);
    }
  }
  return result;
}

function ensureDefaultReporter(existing: VitestReporterEntry[]): VitestReporterEntry[] {
  if (existing.length === 0) {
    return ["default"];
  }
  if (!existing.some((entry) => (Array.isArray(entry) ? entry[0] : entry) === "default")) {
    return ["default", ...existing];
  }
  return existing;
}

function buildCoverageReportPath(reportsDirectory: string | undefined): string {
  return `${reportsDirectory ?? "coverage"}/coverage-final.json`;
}

function buildJunitReportPath(reportsDirectory: string | undefined): string {
  return `${reportsDirectory ?? "coverage"}/crap-typescript-junit.xml`;
}

interface ResolvedReporterOptions {
  projectRoot: string;
  paths: string[];
  changedOnly: boolean;
  packageManager: PackageManagerSelection;
  coverageReportPath: string | undefined;
  format: ReportFormat;
  agent: boolean;
  outputPath: string | undefined;
  junitReportPath: string | false;
  stdout: Writer;
  stderr: Writer;
}

function resolveReporterOptions(options: CrapTypescriptVitestOptions): ResolvedReporterOptions {
  return {
    projectRoot: resolveProjectRoot(options),
    paths: resolvePaths(options),
    changedOnly: resolveChangedOnly(options),
    packageManager: resolvePackageManager(options),
    coverageReportPath: options.coverageReportPath,
    format: resolveFormat(options),
    agent: resolveAgent(options),
    outputPath: options.outputPath,
    junitReportPath: resolveJunitReportPath(options),
    stdout: options.stdout ?? process.stdout,
    stderr: options.stderr ?? process.stderr
  };
}

function resolveProjectRoot(options: CrapTypescriptVitestOptions): string {
  return options.projectRoot ?? process.cwd();
}

function resolvePaths(options: CrapTypescriptVitestOptions): string[] {
  return options.paths ?? [];
}

function resolveChangedOnly(options: CrapTypescriptVitestOptions): boolean {
  return options.changedOnly ?? false;
}

function resolvePackageManager(options: CrapTypescriptVitestOptions): PackageManagerSelection {
  return options.packageManager ?? "auto";
}

function resolveFormat(options: CrapTypescriptVitestOptions): ReportFormat {
  return options.format ?? "toon";
}

function resolveAgent(options: CrapTypescriptVitestOptions): boolean {
  return options.agent ?? false;
}

function resolveJunitReportPath(options: CrapTypescriptVitestOptions): string | false {
  return options.junitReportPath === undefined
    ? buildJunitReportPathFromCoveragePath(options.coverageReportPath)
    : options.junitReportPath;
}

async function writeReporterReports(
  metrics: Awaited<ReturnType<typeof analyzeProject>>["metrics"],
  options: ResolvedReporterOptions
): Promise<void> {
  const primaryReport = formatAnalysisReport(metrics, {
    format: options.format,
    agent: options.agent
  });
  if (options.outputPath) {
    await writeReportFile(options.projectRoot, options.outputPath, primaryReport);
  } else {
    options.stdout.write(primaryReport);
  }

  if (options.junitReportPath !== false) {
    await writeReportFile(options.projectRoot, options.junitReportPath, formatAnalysisReport(metrics, { format: "junit" }));
  }
}

async function writeReportFile(projectRoot: string, reportPath: string, content: string): Promise<void> {
  const absolutePath = path.resolve(projectRoot, reportPath);
  await mkdir(path.dirname(absolutePath), { recursive: true });
  await writeFile(absolutePath, content);
}

function buildJunitReportPathFromCoveragePath(coverageReportPath: string | undefined): string {
  return path.join(path.dirname(coverageReportPath ?? "coverage/coverage-final.json"), "crap-typescript-junit.xml");
}

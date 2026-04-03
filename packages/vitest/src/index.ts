import { analyzeProject, CRAP_THRESHOLD, formatReport, NO_FILES_MESSAGE } from "crap-typescript-core";
import type { PackageManagerSelection, Writer } from "crap-typescript-core";

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
  stdout?: Writer;
  stderr?: Writer;
}

export class CrapTypescriptVitestReporter {
  constructor(private readonly options: CrapTypescriptVitestOptions = {}) {}

  async onFinishedReportCoverage(): Promise<void> {
    const stdout = this.options.stdout ?? process.stdout;
    const stderr = this.options.stderr ?? process.stderr;
    const result = await analyzeProject({
      projectRoot: this.options.projectRoot ?? process.cwd(),
      explicitPaths: this.options.paths ?? [],
      changedOnly: this.options.changedOnly ?? false,
      packageManager: this.options.packageManager ?? "auto",
      testRunner: "vitest",
      coverageMode: "existing-only",
      stdout,
      stderr
    });

    if (result.selectedFiles.length === 0) {
      stdout.write(`${NO_FILES_MESSAGE}\n`);
      return;
    }

    stdout.write(`${formatReport(result.metrics)}\n`);
    if (result.thresholdExceeded) {
      const error = `CRAP threshold exceeded: ${result.maxCrap.toFixed(1)} > ${CRAP_THRESHOLD.toFixed(1)}`;
      stderr.write(`${error}\n`);
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
  const coverageReporters = ensureReporterEntries(asArray(coverage.reporter), "lcov", "text");
  const reporters = [...asArray(testConfig.reporters), new CrapTypescriptVitestReporter(options)];

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

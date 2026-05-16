import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import type { PackageManagerSelection, ReportFormat, Writer } from "@barney-media/crap-typescript-core";

import CrapTypescriptJestReporter from "./reporter.js";

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

type JestReporterEntry = string | [string, unknown];

export function withCrapTypescriptJest(
  config: Record<string, unknown> = {},
  options: CrapTypescriptJestOptions = {}
): Record<string, unknown> {
  const coverageReporters = ensureEntries(
    asArray<JestReporterEntry>(config.coverageReporters as JestReporterEntry[] | undefined),
    "json",
    "text"
  );
  const reporters = ensureDefaultReporter(
    asArray<JestReporterEntry>(config.reporters as JestReporterEntry[] | undefined)
  );
  const coverageReportPath = options.coverageReportPath ?? buildCoverageReportPath(config.coverageDirectory as string | undefined);
  reporters.push([
    resolveReporterPath(),
    reporterOptions(options, coverageReportPath)
  ]);

  return {
    ...config,
    collectCoverage: true,
    coverageDirectory: (config.coverageDirectory as string | undefined) ?? "coverage",
    coverageReporters,
    reporters
  };
}

function asArray<T>(value: T[] | T | undefined): T[] {
  if (value === undefined) {
    return [];
  }
  return Array.isArray(value) ? [...value] : [value];
}

function ensureEntries(existing: JestReporterEntry[], ...entries: string[]): JestReporterEntry[] {
  const result = [...existing];
  for (const entry of entries) {
    if (!result.some((candidate) => (Array.isArray(candidate) ? candidate[0] : candidate) === entry)) {
      result.push(entry);
    }
  }
  return result;
}

function ensureDefaultReporter(existing: JestReporterEntry[]): JestReporterEntry[] {
  if (existing.length === 0) {
    return ["default"];
  }
  if (!existing.some((entry) => (Array.isArray(entry) ? entry[0] : entry) === "default")) {
    return ["default", ...existing];
  }
  return existing;
}

export { CrapTypescriptJestReporter };
export default CrapTypescriptJestReporter;

function buildCoverageReportPath(coverageDirectory: string | undefined): string {
  return `${coverageDirectory ?? "coverage"}/coverage-final.json`;
}

function buildJunitReportFromCoverage(coverageReportPath: string): string {
  return `${path.dirname(coverageReportPath).replace(/\\/g, "/")}/crap-typescript-junit.xml`;
}

function reporterOptions(
  options: CrapTypescriptJestOptions,
  coverageReportPath: string
): CrapTypescriptJestOptions {
  return {
    ...options,
    coverageReportPath,
    format: configuredFormat(options),
    junit: options.junit ?? true,
    junitReport: configuredJunitReport(options, coverageReportPath)
  };
}

function configuredFormat(options: CrapTypescriptJestOptions): ReportFormat {
  return options.format ?? (options.agent ? "toon" : "none");
}

function configuredJunitReport(options: CrapTypescriptJestOptions, coverageReportPath: string): string {
  return options.junitReport === undefined
    ? buildJunitReportFromCoverage(coverageReportPath)
    : options.junitReport;
}

function resolveReporterPath(): string {
  const moduleDirectory = path.dirname(fileURLToPath(import.meta.url));
  const candidates = [
    path.join(moduleDirectory, "reporter.js"),
    path.join(moduleDirectory, "reporter.ts")
  ];
  const resolved = candidates.find((candidate) => existsSync(candidate));
  if (resolved) {
    return resolved;
  }
  throw new Error("Unable to resolve the crap-typescript Jest reporter module.");
}

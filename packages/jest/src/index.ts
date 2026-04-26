import { existsSync } from "node:fs";
import path from "node:path";

import type { PackageManagerSelection, ReportFormat, Writer } from "@barney-media/crap-typescript-core";

import CrapTypescriptJestReporter from "./reporter";

export interface CrapTypescriptJestOptions {
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
  reporters.push([
    resolveReporterPath(),
    {
      ...options,
      coverageReportPath: options.coverageReportPath ?? buildCoverageReportPath(config.coverageDirectory as string | undefined),
      junitReportPath: options.junitReportPath === undefined
        ? buildJunitReportPath(config.coverageDirectory as string | undefined)
        : options.junitReportPath
    }
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

function buildJunitReportPath(coverageDirectory: string | undefined): string {
  return `${coverageDirectory ?? "coverage"}/crap-typescript-junit.xml`;
}

function resolveReporterPath(): string {
  try {
    return require.resolve("./reporter");
  } catch {
    const candidates = [
      path.join(__dirname, "reporter.js"),
      path.join(__dirname, "reporter.ts")
    ];
    const resolved = candidates.find((candidate) => existsSync(candidate));
    if (resolved) {
      return resolved;
    }
    throw new Error("Unable to resolve the crap-typescript Jest reporter module.");
  }
}

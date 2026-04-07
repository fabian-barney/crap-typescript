import type { PackageManagerSelection, Writer } from "crap-typescript-core";

import CrapTypescriptJestReporter from "./reporter";

export interface CrapTypescriptJestOptions {
  projectRoot?: string;
  changedOnly?: boolean;
  paths?: string[];
  packageManager?: PackageManagerSelection;
  coverageReportPath?: string;
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
    require.resolve("./reporter"),
    {
      ...options,
      coverageReportPath: options.coverageReportPath ?? buildCoverageReportPath(config.coverageDirectory as string | undefined)
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

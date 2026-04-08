import { readFile } from "node:fs/promises";
import path from "node:path";

import { normalizePathForMatch } from "./utils";
import type { SourceSpan } from "./types";
import type { BranchCoverageUnit, FileCoverage, FunctionCoverageUnit, StatementCoverageUnit } from "./coverageUnits";

const MAX_COLUMN = Number.MAX_SAFE_INTEGER;

export { coverageForMethods } from "./coverageAttribution";
export type { MethodCoverage } from "./coverageNormalization";
export type { FileCoverage } from "./coverageUnits";

type JsonRecord = Record<string, unknown>;

export async function parseCoverageReport(
  reportPath: string,
  sourceRoot: string
): Promise<Map<string, FileCoverage>> {
  const raw = JSON.parse(await readFile(reportPath, "utf8")) as unknown;
  const report = isRecord(raw) ? raw : {};
  const records = new Map<string, FileCoverage>();

  for (const [entryKey, entryValue] of Object.entries(report)) {
    if (!isRecord(entryValue)) {
      continue;
    }

    const sourcePath = typeof entryValue.path === "string" ? entryValue.path : entryKey;
    if (!sourcePath) {
      continue;
    }

    const resolved = path.isAbsolute(sourcePath)
      ? sourcePath
      : path.resolve(sourceRoot, sourcePath);
    const normalized = normalizePathForMatch(resolved);
    const merged = records.get(normalized) ?? { statements: [], branches: [], functions: [] };
    merged.statements.push(...parseStatements(entryValue.statementMap, entryValue.s));
    merged.branches.push(...parseBranches(entryValue.branchMap, entryValue.b));
    merged.functions.push(...parseFunctions(entryValue.fnMap));
    records.set(normalized, {
      statements: deduplicateStatements(merged.statements),
      branches: deduplicateBranches(merged.branches),
      functions: deduplicateFunctions(merged.functions)
    });
  }

  return records;
}


function parseStatements(statementMapValue: unknown, hitsValue: unknown): StatementCoverageUnit[] {
  if (!isRecord(statementMapValue) || !isRecord(hitsValue)) {
    return [];
  }

  const statements: StatementCoverageUnit[] = [];
  for (const [key, locationValue] of Object.entries(statementMapValue)) {
    const hits = parseInteger(hitsValue[key]);
    const span = parseSpan(locationValue);
    if (hits === null || span === null) {
      continue;
    }
    statements.push({ span, hits });
  }

  return deduplicateStatements(statements);
}

function parseBranches(branchMapValue: unknown, hitsValue: unknown): BranchCoverageUnit[] {
  if (!isRecord(branchMapValue) || !isRecord(hitsValue)) {
    return [];
  }

  const branches: BranchCoverageUnit[] = [];
  for (const [key, branchValue] of Object.entries(branchMapValue)) {
    const branch = toBranchCoverageUnit(branchValue, hitsValue[key]);
    if (branch) {
      branches.push(branch);
    }
  }

  return deduplicateBranches(branches);
}

function parseFunctions(fnMapValue: unknown): FunctionCoverageUnit[] {
  if (!isRecord(fnMapValue)) {
    return [];
  }

  const functions: FunctionCoverageUnit[] = [];
  for (const entryValue of Object.values(fnMapValue)) {
    const span = resolveFunctionSpan(entryValue);
    if (span) {
      functions.push({ span });
    }
  }

  return deduplicateFunctions(functions);
}

function parseFirstLocation(value: unknown): SourceSpan | null {
  if (!Array.isArray(value)) {
    return null;
  }

  for (const location of value) {
    const span = parseSpan(location);
    if (span) {
      return span;
    }
  }

  return null;
}

function parseLineSpan(value: unknown): SourceSpan | null {
  const line = parseInteger(value);
  if (line === null) {
    return null;
  }

  return {
    startLine: line,
    startColumn: 0,
    endLine: line,
    endColumn: MAX_COLUMN
  };
}

function parseSpan(value: unknown): SourceSpan | null {
  if (!isRecord(value)) {
    return null;
  }

  const start = parsePosition(value.start);
  const end = parsePosition(value.end);
  if (start === null || end === null) {
    return null;
  }

  return {
    startLine: start.line,
    startColumn: start.column,
    endLine: end.line,
    endColumn: end.column
  };
}

function parsePosition(value: unknown): { line: number; column: number } | null {
  if (!isRecord(value)) {
    return null;
  }

  const line = parseInteger(value.line);
  if (line === null) {
    return null;
  }

  const column = value.column === null || value.column === undefined
    ? MAX_COLUMN
    : parseInteger(value.column);
  if (column === null) {
    return null;
  }

  return { line, column };
}

function parseHitArray(value: unknown): number[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .map((entry) => parseInteger(entry))
    .filter((entry): entry is number => entry !== null);
}

function parseInteger(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function deduplicateStatements(statements: StatementCoverageUnit[]): StatementCoverageUnit[] {
  const deduplicated = new Map<string, StatementCoverageUnit>();
  for (const statement of statements) {
    const key = stringifySpan(statement.span);
    const existing = deduplicated.get(key);
    if (!existing || statement.hits > existing.hits) {
      deduplicated.set(key, statement);
    }
  }
  return [...deduplicated.values()];
}

function deduplicateBranches(branches: BranchCoverageUnit[]): BranchCoverageUnit[] {
  const deduplicated = new Map<string, BranchCoverageUnit>();
  for (const branch of branches) {
    const key = stringifySpan(branch.span);
    const existing = deduplicated.get(key);
    if (!existing) {
      deduplicated.set(key, branch);
      continue;
    }
    deduplicated.set(key, {
      span: branch.span,
      hits: mergeBranchHits(existing.hits, branch.hits)
    });
  }
  return [...deduplicated.values()];
}

function deduplicateFunctions(functions: FunctionCoverageUnit[]): FunctionCoverageUnit[] {
  const deduplicated = new Map<string, FunctionCoverageUnit>();
  for (const entry of functions) {
    const key = stringifySpan(entry.span);
    deduplicated.set(key, entry);
  }
  return [...deduplicated.values()];
}

function stringifySpan(span: SourceSpan): string {
  return [
    span.startLine,
    span.startColumn,
    span.endLine,
    span.endColumn
  ].join(":");
}

function isRecord(value: unknown): value is JsonRecord {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function toBranchCoverageUnit(branchValue: unknown, hitsValue: unknown): BranchCoverageUnit | null {
  if (!isRecord(branchValue)) {
    return null;
  }

  const hits = parseHitArray(hitsValue);
  const span = resolveBranchSpan(branchValue);
  if (hits.length === 0 || span === null) {
    return null;
  }
  return { span, hits };
}

function resolveBranchSpan(branchValue: JsonRecord): SourceSpan | null {
  return parseSpan(branchValue.loc) ??
    parseFirstLocation(branchValue.locations) ??
    parseLineSpan(branchValue.line);
}

function resolveFunctionSpan(entryValue: unknown): SourceSpan | null {
  if (!isRecord(entryValue)) {
    return null;
  }
  return parseSpan(entryValue.loc) ??
    parseSpan(entryValue.decl) ??
    parseLineSpan(entryValue.line);
}

function mergeBranchHits(existingHits: number[], nextHits: number[]): number[] {
  const mergedHits = nextHits.map((hits, index) => Math.max(hits, existingHits[index] ?? 0));
  for (let index = mergedHits.length; index < existingHits.length; index += 1) {
    mergedHits.push(existingHits[index]);
  }
  return mergedHits;
}

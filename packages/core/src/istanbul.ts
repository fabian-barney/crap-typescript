import { readFile } from "node:fs/promises";
import path from "node:path";

import { normalizePathForMatch } from "./utils";
import type { MethodDescriptor, SourceSpan } from "./types";

const MAX_COLUMN = Number.MAX_SAFE_INTEGER;

interface StatementCoverageUnit {
  span: SourceSpan;
  hits: number;
}

interface BranchCoverageUnit {
  span: SourceSpan;
  hits: number[];
}

export interface FileCoverage {
  statements: StatementCoverageUnit[];
  branches: BranchCoverageUnit[];
}

export interface MethodCoverage {
  coveragePercent: number;
  statementCoveragePercent: number | null;
  branchCoveragePercent: number | null;
}

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
    const merged = records.get(normalized) ?? { statements: [], branches: [] };
    merged.statements.push(...parseStatements(entryValue.statementMap, entryValue.s));
    merged.branches.push(...parseBranches(entryValue.branchMap, entryValue.b));
    records.set(normalized, {
      statements: deduplicateStatements(merged.statements),
      branches: deduplicateBranches(merged.branches)
    });
  }

  return records;
}

export function coverageForMethods(
  methods: MethodDescriptor[],
  fileCoverage: FileCoverage | undefined
): Array<MethodCoverage | null> {
  if (!fileCoverage) {
    return methods.map(() => null);
  }

  const attributed = methods.map(() => ({
    statements: [] as StatementCoverageUnit[],
    branches: [] as BranchCoverageUnit[]
  }));

  for (const statement of fileCoverage.statements) {
    const owner = findOwningMethodIndex(methods, statement.span);
    if (owner !== null) {
      attributed[owner].statements.push(statement);
    }
  }

  for (const branch of fileCoverage.branches) {
    const owner = findOwningMethodIndex(methods, branch.span);
    if (owner !== null) {
      attributed[owner].branches.push(branch);
    }
  }

  return methods.map((method, index) =>
    computeMethodCoverage(method, attributed[index].statements, attributed[index].branches)
  );
}

function computeMethodCoverage(
  method: MethodDescriptor,
  statements: StatementCoverageUnit[],
  branches: BranchCoverageUnit[]
): MethodCoverage | null {
  const statementCoveragePercent = percentageOfCoveredStatements(statements);
  if (statementCoveragePercent === null && method.expectsStatementCoverage) {
    return null;
  }

  const branchCoveragePercent = percentageOfCoveredBranches(branches);
  if (branchCoveragePercent === null && method.expectsBranchCoverage) {
    return null;
  }

  return {
    coveragePercent: Math.min(statementCoveragePercent ?? 100, branchCoveragePercent ?? 100),
    statementCoveragePercent,
    branchCoveragePercent
  };
}

function percentageOfCoveredStatements(statements: StatementCoverageUnit[]): number | null {
  if (statements.length === 0) {
    return null;
  }

  const covered = statements.filter((statement) => statement.hits > 0).length;
  return (covered / statements.length) * 100;
}

function percentageOfCoveredBranches(branches: BranchCoverageUnit[]): number | null {
  let totalBranches = 0;
  let coveredBranches = 0;

  for (const branch of branches) {
    totalBranches += branch.hits.length;
    coveredBranches += branch.hits.filter((hits) => hits > 0).length;
  }

  if (totalBranches === 0) {
    return null;
  }

  return (coveredBranches / totalBranches) * 100;
}

function findOwningMethodIndex(methods: MethodDescriptor[], span: SourceSpan): number | null {
  let bestMatch: number | null = null;

  for (let index = 0; index < methods.length; index += 1) {
    const method = methods[index];
    if (!spanContains(method.bodySpan, span) && !spanContainsPosition(method.bodySpan, span.startLine, span.startColumn)) {
      continue;
    }
    if (bestMatch === null || spanContains(methods[bestMatch].bodySpan, method.bodySpan)) {
      bestMatch = index;
    }
  }

  return bestMatch;
}

function spanContains(container: SourceSpan, candidate: SourceSpan): boolean {
  return comparePosition(
    container.startLine,
    container.startColumn,
    candidate.startLine,
    candidate.startColumn
  ) <= 0 && comparePosition(candidate.endLine, candidate.endColumn, container.endLine, container.endColumn) <= 0;
}

function spanContainsPosition(span: SourceSpan, line: number, column: number): boolean {
  return comparePosition(span.startLine, span.startColumn, line, column) <= 0 &&
    comparePosition(line, column, span.endLine, span.endColumn) < 0;
}

function comparePosition(
  leftLine: number,
  leftColumn: number,
  rightLine: number,
  rightColumn: number
): number {
  if (leftLine !== rightLine) {
    return leftLine - rightLine;
  }
  return leftColumn - rightColumn;
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
    if (!isRecord(branchValue)) {
      continue;
    }

    const hits = parseHitArray(hitsValue[key]);
    const span = parseSpan(branchValue.loc) ??
      parseFirstLocation(branchValue.locations) ??
      parseLineSpan(branchValue.line);
    if (hits.length === 0 || span === null) {
      continue;
    }

    branches.push({ span, hits });
  }

  return deduplicateBranches(branches);
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

    const mergedHits = branch.hits.map((hits, index) => Math.max(hits, existing.hits[index] ?? 0));
    if (existing.hits.length > mergedHits.length) {
      for (let index = mergedHits.length; index < existing.hits.length; index += 1) {
        mergedHits.push(existing.hits[index]);
      }
    }
    deduplicated.set(key, {
      span: branch.span,
      hits: mergedHits
    });
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

import { readFile } from "node:fs/promises";
import path from "node:path";

import { normalizePathForMatch } from "./utils";
import type { CoverageMetric, CoverageUnknownReason, MethodDescriptor, SourceSpan } from "./types";

const MAX_COLUMN = Number.MAX_SAFE_INTEGER;

interface StatementCoverageUnit {
  span: SourceSpan;
  hits: number;
}

interface BranchCoverageUnit {
  span: SourceSpan;
  hits: number[];
}

interface FunctionCoverageUnit {
  span: SourceSpan;
}

export interface FileCoverage {
  statements: StatementCoverageUnit[];
  branches: BranchCoverageUnit[];
  functions: FunctionCoverageUnit[];
}

export interface MethodCoverage {
  coverage: CoverageMetric;
  statementCoverage: CoverageMetric;
  branchCoverage: CoverageMetric;
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

export function coverageForMethods(
  methods: MethodDescriptor[],
  fileCoverage: FileCoverage | undefined,
  fileUnknownReason: CoverageUnknownReason = "file_unmatched"
): MethodCoverage[] {
  if (!fileCoverage) {
    return methods.map((method) => unavailableMethodCoverage(method, fileUnknownReason));
  }

  const attributableMethods = buildAttributableMethods(methods, fileCoverage.functions);
  const attributed = methods.map(() => ({
    statements: [] as StatementCoverageUnit[],
    branches: [] as BranchCoverageUnit[]
  }));

  for (const statement of fileCoverage.statements) {
    const owner = findOwningMethodIndex(attributableMethods, statement.span);
    if (owner !== null) {
      attributed[owner].statements.push(statement);
    }
  }

  for (const branch of fileCoverage.branches) {
    const owner = findOwningMethodIndex(attributableMethods, branch.span);
    if (owner !== null) {
      attributed[owner].branches.push(branch);
    }
  }

  return methods.map((method, index) =>
    attributableMethods[index].fnMapConflict
      ? unavailableMethodCoverage(method, "fnmap_conflict")
      : computeMethodCoverage(method, attributed[index].statements, attributed[index].branches)
  );
}

interface AttributableMethod {
  span: SourceSpan;
  fnMapConflict: boolean;
}

function buildAttributableMethods(
  methods: MethodDescriptor[],
  functions: FunctionCoverageUnit[]
): AttributableMethod[] {
  if (functions.length === 0) {
    return methods.map((method) => ({
      span: method.bodySpan,
      fnMapConflict: false
    }));
  }

  return methods.map((method) => {
    const matchedFunction = matchFunctionCoverage(method.bodySpan, functions);
    return {
      span: matchedFunction?.span ?? method.bodySpan,
      fnMapConflict: matchedFunction === null
    };
  });
}

function matchFunctionCoverage(
  methodSpan: SourceSpan,
  functions: FunctionCoverageUnit[]
): FunctionCoverageUnit | null {
  const exactMatches = functions.filter((entry) => spansEqual(entry.span, methodSpan));
  if (exactMatches.length === 1) {
    return exactMatches[0];
  }
  if (exactMatches.length > 1) {
    return null;
  }

  const lineAlignedMatches = functions.filter((entry) => spansShareBoundaryLines(entry.span, methodSpan));
  const overlappingLineAlignedMatches = lineAlignedMatches.filter((entry) => spansOverlap(entry.span, methodSpan));
  if (overlappingLineAlignedMatches.length === 1) {
    return overlappingLineAlignedMatches[0];
  }
  if (overlappingLineAlignedMatches.length > 1) {
    return null;
  }

  const containingMatches = functions.filter((entry) =>
    spanContains(entry.span, methodSpan) || spanContains(methodSpan, entry.span)
  );
  if (containingMatches.length === 1) {
    return containingMatches[0];
  }

  return null;
}

function computeMethodCoverage(
  method: MethodDescriptor,
  statements: StatementCoverageUnit[],
  branches: BranchCoverageUnit[]
): MethodCoverage {
  const statementCoverage = toStatementCoverageMetric(method, statements);
  const branchCoverage = toBranchCoverageMetric(method, branches);

  return {
    coverage: combineCoverageMetrics(statementCoverage, branchCoverage),
    statementCoverage,
    branchCoverage
  };
}

function unavailableMethodCoverage(method: MethodDescriptor, reason: CoverageUnknownReason): MethodCoverage {
  return {
    coverage: unknownCoverageMetric(reason),
    statementCoverage: method.expectsStatementCoverage
      ? unknownCoverageMetric(reason)
      : structuralNaCoverageMetric(),
    branchCoverage: method.expectsBranchCoverage
      ? unknownCoverageMetric(reason)
      : structuralNaCoverageMetric()
  };
}

function unknownMethodCoverage(reason: CoverageUnknownReason): MethodCoverage {
  return {
    coverage: unknownCoverageMetric(reason),
    statementCoverage: unknownCoverageMetric(reason),
    branchCoverage: unknownCoverageMetric(reason)
  };
}

function toStatementCoverageMetric(
  method: MethodDescriptor,
  statements: StatementCoverageUnit[]
): CoverageMetric {
  const percent = percentageOfCoveredStatements(statements);
  if (percent !== null) {
    return measuredCoverageMetric(percent);
  }
  return method.expectsStatementCoverage
    ? unknownCoverageMetric("statement_unattributed")
    : structuralNaCoverageMetric();
}

function toBranchCoverageMetric(
  method: MethodDescriptor,
  branches: BranchCoverageUnit[]
): CoverageMetric {
  const percent = percentageOfCoveredBranches(branches);
  if (percent !== null) {
    return measuredCoverageMetric(percent);
  }
  return method.expectsBranchCoverage
    ? unknownCoverageMetric("branch_unattributed")
    : structuralNaCoverageMetric();
}

function combineCoverageMetrics(statementCoverage: CoverageMetric, branchCoverage: CoverageMetric): CoverageMetric {
  if (statementCoverage.status === "unknown") {
    return unknownCoverageMetric(statementCoverage.unknownReason!);
  }
  if (branchCoverage.status === "unknown") {
    return unknownCoverageMetric(branchCoverage.unknownReason!);
  }
  if (statementCoverage.status === "structural_na" && branchCoverage.status === "structural_na") {
    return {
      percent: 100,
      status: "structural_na",
      unknownReason: null
    };
  }
  return measuredCoverageMetric(Math.min(statementCoverage.percent ?? 100, branchCoverage.percent ?? 100));
}

function measuredCoverageMetric(percent: number): CoverageMetric {
  return {
    percent,
    status: "measured",
    unknownReason: null
  };
}

function structuralNaCoverageMetric(): CoverageMetric {
  return {
    percent: null,
    status: "structural_na",
    unknownReason: null
  };
}

function unknownCoverageMetric(reason: CoverageUnknownReason): CoverageMetric {
  return {
    percent: null,
    status: "unknown",
    unknownReason: reason
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

function findOwningMethodIndex(methods: AttributableMethod[], span: SourceSpan): number | null {
  let bestMatch: number | null = null;

  for (let index = 0; index < methods.length; index += 1) {
    const method = methods[index];
    if (method.fnMapConflict) {
      continue;
    }
    if (!spanContains(method.span, span) && !spanContainsPosition(method.span, span.startLine, span.startColumn)) {
      continue;
    }
    if (bestMatch === null || spanContains(methods[bestMatch].span, method.span)) {
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

function spansEqual(left: SourceSpan, right: SourceSpan): boolean {
  return left.startLine === right.startLine &&
    left.startColumn === right.startColumn &&
    left.endLine === right.endLine &&
    left.endColumn === right.endColumn;
}

function spansShareBoundaryLines(left: SourceSpan, right: SourceSpan): boolean {
  return left.startLine === right.startLine &&
    left.endLine === right.endLine;
}

function spansOverlap(left: SourceSpan, right: SourceSpan): boolean {
  return comparePosition(left.startLine, left.startColumn, right.endLine, right.endColumn) < 0 &&
    comparePosition(right.startLine, right.startColumn, left.endLine, left.endColumn) < 0;
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

function parseFunctions(fnMapValue: unknown): FunctionCoverageUnit[] {
  if (!isRecord(fnMapValue)) {
    return [];
  }

  const functions: FunctionCoverageUnit[] = [];
  for (const entryValue of Object.values(fnMapValue)) {
    if (!isRecord(entryValue)) {
      continue;
    }

    const span = parseSpan(entryValue.loc) ??
      parseSpan(entryValue.decl) ??
      parseLineSpan(entryValue.line);
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

import { readFile } from "node:fs/promises";
import path from "node:path";

import { isAbsolutePath, normalizePathForMatch } from "./utils.js";
import type { SourceSpan } from "./types.js";
import type {
  BranchCoverageUnit,
  CoveragePosition,
  FileCoverage,
  FunctionCoverageUnit,
  FunctionSpanSource,
  StatementCoverageUnit
} from "./coverageUnits.js";

const MAX_COLUMN = Number.MAX_SAFE_INTEGER;

export { coverageForMethods } from "./coverageAttribution.js";
export type { MethodCoverage } from "./coverageNormalization.js";
export type { FileCoverage } from "./coverageUnits.js";

type JsonRecord = Record<string, unknown>;

export async function parseCoverageReport(
  reportPath: string,
  sourceRoot: string
): Promise<Map<string, FileCoverage>> {
  const raw = JSON.parse(await readFile(reportPath, "utf8")) as unknown;
  const report = isRecord(raw) ? raw : {};
  const records = new Map<string, FileCoverage>();

  for (const [entryKey, entryValue] of Object.entries(report)) {
    const parsedEntry = parseCoverageEntry(entryKey, entryValue, sourceRoot);
    if (!parsedEntry) {
      continue;
    }
    mergeCoverageEntry(records, parsedEntry);
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

function parseCoverageEntry(
  entryKey: string,
  entryValue: unknown,
  sourceRoot: string
): { normalizedPath: string; coverage: FileCoverage } | null {
  if (!isRecord(entryValue)) {
    return null;
  }

  const sourcePath = typeof entryValue.path === "string" ? entryValue.path : entryKey;
  if (!sourcePath) {
    return null;
  }

  const resolved = isAbsolutePath(sourcePath)
    ? sourcePath
    : path.resolve(sourceRoot, sourcePath);
  return {
    normalizedPath: normalizePathForMatch(resolved),
    coverage: {
      statements: parseStatements(entryValue.statementMap, entryValue.s),
      branches: parseBranches(entryValue.branchMap, entryValue.b),
      functions: parseFunctions(entryValue.fnMap)
    }
  };
}

function mergeCoverageEntry(
  records: Map<string, FileCoverage>,
  entry: { normalizedPath: string; coverage: FileCoverage }
): void {
  const merged = records.get(entry.normalizedPath) ?? { statements: [], branches: [], functions: [] };
  merged.statements.push(...entry.coverage.statements);
  merged.branches.push(...entry.coverage.branches);
  merged.functions.push(...entry.coverage.functions);
  records.set(entry.normalizedPath, {
    statements: deduplicateStatements(merged.statements),
    branches: deduplicateBranches(merged.branches),
    functions: deduplicateFunctions(merged.functions)
  });
}

function parseFunctions(fnMapValue: unknown): FunctionCoverageUnit[] {
  if (!isRecord(fnMapValue)) {
    return [];
  }

  const functions: FunctionCoverageUnit[] = [];
  for (const entryValue of Object.values(fnMapValue)) {
    const entry = resolveFunctionEntry(entryValue);
    if (entry) {
      functions.push(entry);
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
  const deduplicated = new Map<string, FunctionCoverageUnit[]>();
  for (const entry of functions) {
    const key = functionIdentityKey(entry);
    const grouped = deduplicated.get(key) ?? [];
    grouped.push(entry);
    deduplicated.set(key, grouped);
  }
  return [...deduplicated.values()].map(selectCanonicalFunctionEntry);
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

function resolveFunctionEntry(entryValue: unknown): FunctionCoverageUnit | null {
  if (!isRecord(entryValue)) {
    return null;
  }

  const resolved = resolveFunctionSpanWithSource(entryValue);
  if (!resolved) {
    return null;
  }
  const declarationStart = resolveDeclarationStart(entryValue);
  const name = typeof entryValue.name === "string" ? entryValue.name : undefined;

  return {
    span: resolved.span,
    spanSource: resolved.source,
    ...(name ? { name } : {}),
    ...(declarationStart ? { declarationStart } : {})
  };
}

function resolveFunctionSpanWithSource(entryValue: JsonRecord): { span: SourceSpan; source: FunctionSpanSource } | null {
  const loc = parseSpan(entryValue.loc);
  if (loc) {
    return { span: loc, source: "loc" };
  }

  const decl = parseSpan(entryValue.decl);
  if (decl) {
    return { span: decl, source: "decl" };
  }

  const line = parseLineSpan(entryValue.line);
  if (line) {
    return { span: line, source: "line" };
  }

  return null;
}

function resolveDeclarationStart(entryValue: JsonRecord): CoveragePosition | undefined {
  if (!isRecord(entryValue.decl)) {
    return undefined;
  }

  return parsePosition(entryValue.decl.start) ?? undefined;
}

function functionIdentityKey(entry: FunctionCoverageUnit): string {
  if (entry.name && entry.declarationStart) {
    return `decl:${entry.name}:${entry.declarationStart.line}:${entry.declarationStart.column}`;
  }

  if (entry.name) {
    return `named-span:${entry.name}:${stringifySpan(entry.span)}`;
  }

  return `span:${stringifySpan(entry.span)}`;
}

function selectCanonicalFunctionEntry(entries: FunctionCoverageUnit[]): FunctionCoverageUnit {
  const uniqueBySpan = new Map<string, FunctionCoverageUnit>();
  for (const entry of entries) {
    const key = stringifySpan(entry.span);
    const existing = uniqueBySpan.get(key);
    if (!existing || compareFunctionSpecificity(entry, existing) < 0) {
      uniqueBySpan.set(key, entry);
    }
  }

  return [...uniqueBySpan.values()].sort(compareFunctionSpecificity)[0];
}

function compareFunctionSpecificity(left: FunctionCoverageUnit, right: FunctionCoverageUnit): number {
  return firstNonZeroComparison([
    functionSpanSourceRank(left.spanSource) - functionSpanSourceRank(right.spanSource),
    spanLineCount(left.span) - spanLineCount(right.span),
    comparePosition(right.span.startLine, right.span.startColumn, left.span.startLine, left.span.startColumn),
    comparePosition(left.span.endLine, left.span.endColumn, right.span.endLine, right.span.endColumn)
  ]);
}

const FUNCTION_SPAN_SOURCE_RANK: Record<FunctionSpanSource, number> = {
  loc: 0,
  decl: 1,
  line: 2
};

function functionSpanSourceRank(source: FunctionSpanSource | undefined): number {
  return source ? FUNCTION_SPAN_SOURCE_RANK[source] : 3;
}

function spanLineCount(span: SourceSpan): number {
  return span.endLine - span.startLine;
}

function firstNonZeroComparison(comparisons: number[]): number {
  return comparisons.find((comparison) => comparison !== 0) ?? 0;
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

function mergeBranchHits(existingHits: number[], nextHits: number[]): number[] {
  const mergedHits = nextHits.map((hits, index) => Math.max(hits, existingHits[index] ?? 0));
  for (let index = mergedHits.length; index < existingHits.length; index += 1) {
    mergedHits.push(existingHits[index]);
  }
  return mergedHits;
}

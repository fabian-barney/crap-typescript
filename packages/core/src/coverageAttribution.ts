import type { CoverageUnknownReason, MethodDescriptor, SourceSpan } from "./types.js";
import { computeMethodCoverage, unavailableMethodCoverage } from "./coverageNormalization.js";
import type { FileCoverage, FunctionCoverageUnit } from "./coverageUnits.js";
import type { MethodCoverage } from "./coverageNormalization.js";

const MAX_COLUMN = Number.MAX_SAFE_INTEGER;

interface AttributableMethod {
  span: SourceSpan;
  fnMapConflict: boolean;
}

const AMBIGUOUS_MATCH = Symbol("ambiguous_match");
type MatchOutcome = FunctionCoverageUnit | null | undefined;

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
    statements: [] as FileCoverage["statements"],
    branches: [] as FileCoverage["branches"]
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
    const matchedFunction = matchFunctionCoverage(method, functions);
    return {
      span: matchedFunction?.span ?? method.bodySpan,
      fnMapConflict: matchedFunction === null
    };
  });
}

function matchFunctionCoverage(
  method: MethodDescriptor,
  functions: FunctionCoverageUnit[]
): MatchOutcome {
  return resolveMatchOutcome([
    matchByCandidateSpans(method.bodySpan, functions),
    matchByContainingSpan(method.bodySpan, functions),
    matchByDeclaration(method, functions)
  ]);
}

function fnMapMatchSpans(methodSpan: SourceSpan): SourceSpan[] {
  const normalized = normalizeMethodSpanForFnMap(methodSpan);
  return spansEqual(methodSpan, normalized)
    ? [methodSpan]
    : [methodSpan, normalized];
}

function matchByCandidateSpans(methodSpan: SourceSpan, functions: FunctionCoverageUnit[]): MatchOutcome {
  for (const candidateSpan of fnMapMatchSpans(methodSpan)) {
    const exactMatch = uniqueMatchOutcome(functions.filter((entry) => spansEqual(entry.span, candidateSpan)));
    if (exactMatch !== undefined) {
      return exactMatch;
    }

    const lineAlignedMatch = uniqueMatchOutcome(
      functions.filter((entry) => spansShareBoundaryLines(entry.span, candidateSpan) && spansOverlap(entry.span, candidateSpan))
    );
    if (lineAlignedMatch !== undefined) {
      return lineAlignedMatch;
    }
  }

  return undefined;
}

function matchByContainingSpan(methodSpan: SourceSpan, functions: FunctionCoverageUnit[]): MatchOutcome {
  return uniqueMatchOutcome(functions.filter((entry) => spanContains(entry.span, normalizeMethodSpanForFnMap(methodSpan))));
}

function matchByDeclaration(method: MethodDescriptor, functions: FunctionCoverageUnit[]): MatchOutcome {
  return uniqueMatchOutcome(functions.filter((entry) => matchesMethodDeclaration(entry, method)));
}

function resolveMatchOutcome(outcomes: MatchOutcome[]): MatchOutcome {
  for (const outcome of outcomes) {
    if (outcome === undefined) {
      continue;
    }
    return outcome;
  }
  return undefined;
}

function normalizeMethodSpanForFnMap(methodSpan: SourceSpan): SourceSpan {
  if (methodSpan.endLine <= methodSpan.startLine) {
    return methodSpan;
  }

  return {
    startLine: methodSpan.startLine,
    startColumn: methodSpan.startColumn,
    endLine: methodSpan.endLine - 1,
    endColumn: MAX_COLUMN
  };
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

function matchesMethodDeclaration(entry: FunctionCoverageUnit, method: MethodDescriptor): boolean {
  const declarationLine = entry.declarationStart?.line ?? entry.span.startLine;
  if (declarationLine !== method.startLine) {
    return false;
  }

  return !entry.name || entry.name.startsWith("(") || entry.name === method.functionName;
}

function resolveUniqueMatch(matches: FunctionCoverageUnit[]): FunctionCoverageUnit | typeof AMBIGUOUS_MATCH | null {
  if (matches.length === 1) {
    return matches[0];
  }
  if (matches.length > 1) {
    return AMBIGUOUS_MATCH;
  }
  return null;
}

function uniqueMatchOutcome(matches: FunctionCoverageUnit[]): MatchOutcome {
  const resolved = resolveUniqueMatch(matches);
  if (resolved === AMBIGUOUS_MATCH) {
    return null;
  }
  return resolved ?? undefined;
}

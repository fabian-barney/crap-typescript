import type { CoverageUnknownReason, MethodDescriptor, SourceSpan } from "./types";
import { computeMethodCoverage, unavailableMethodCoverage } from "./coverageNormalization";
import type { FileCoverage, FunctionCoverageUnit } from "./coverageUnits";
import type { MethodCoverage } from "./coverageNormalization";

interface AttributableMethod {
  span: SourceSpan;
  fnMapConflict: boolean;
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

import type { SourceSpan } from "./types.js";

export interface StatementCoverageUnit {
  span: SourceSpan;
  hits: number;
}

export interface BranchCoverageUnit {
  span: SourceSpan;
  hits: number[];
}

export interface CoveragePosition {
  line: number;
  column: number;
}

export type FunctionSpanSource = "loc" | "decl" | "line";

export interface FunctionCoverageUnit {
  span: SourceSpan;
  name?: string;
  declarationStart?: CoveragePosition;
  spanSource?: FunctionSpanSource;
}

export interface FileCoverage {
  statements: StatementCoverageUnit[];
  branches: BranchCoverageUnit[];
  functions: FunctionCoverageUnit[];
}

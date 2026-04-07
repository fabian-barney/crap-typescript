import type { SourceSpan } from "./types";

export interface StatementCoverageUnit {
  span: SourceSpan;
  hits: number;
}

export interface BranchCoverageUnit {
  span: SourceSpan;
  hits: number[];
}

export interface FunctionCoverageUnit {
  span: SourceSpan;
}

export interface FileCoverage {
  statements: StatementCoverageUnit[];
  branches: BranchCoverageUnit[];
  functions: FunctionCoverageUnit[];
}

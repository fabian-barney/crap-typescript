import type { CoverageMetric, CoverageUnknownReason, MethodDescriptor } from "./types.js";
import type { BranchCoverageUnit, StatementCoverageUnit } from "./coverageUnits.js";

export interface MethodCoverage {
  coverage: CoverageMetric;
  statementCoverage: CoverageMetric;
  branchCoverage: CoverageMetric;
}

export function computeMethodCoverage(
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

export function unavailableMethodCoverage(method: MethodDescriptor, reason: CoverageUnknownReason): MethodCoverage {
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
  if (statementCoverage.status === "unknown" && branchCoverage.status === "unknown") {
    return unknownCoverageMetric(statementCoverage.unknownReason ?? branchCoverage.unknownReason!);
  }
  return combinedKnownCoverage(statementCoverage, branchCoverage);
}

function combinedKnownCoverage(statementCoverage: CoverageMetric, branchCoverage: CoverageMetric): CoverageMetric {
  const measuredPercents = [statementCoverage, branchCoverage]
    .filter((metric) => metric.status === "measured")
    .map((metric) => metric.percent!);
  if (measuredPercents.length > 0) {
    return measuredCoverageMetric(Math.min(...measuredPercents));
  }

  if (statementCoverage.status === "structural_na" && branchCoverage.status === "structural_na") {
    return {
      percent: 100,
      status: "structural_na",
      unknownReason: null
    };
  }

  return unknownCoverageMetric(statementCoverage.unknownReason ?? branchCoverage.unknownReason!);
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

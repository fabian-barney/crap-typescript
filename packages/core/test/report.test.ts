import { describe, expect, it } from "vitest";

import {
  buildAgentAnalysisReport,
  buildAnalysisReport,
  formatAnalysisReport,
  formatJunitReport,
  formatTextReport,
  formatToonReport
} from "../src/report";
import type { CoverageMetric, MethodMetrics } from "../src/types";

const measured = (percent: number): CoverageMetric => ({
  percent,
  status: "measured",
  unknownReason: null
});

const structuralNa = (): CoverageMetric => ({
  percent: null,
  status: "structural_na",
  unknownReason: null
});

const unknown = (unknownReason: CoverageMetric["unknownReason"]): CoverageMetric => ({
  percent: null,
  status: "unknown",
  unknownReason
});

function metric(overrides: Partial<MethodMetrics> = {}): MethodMetrics {
  return {
    functionName: "safe",
    containerName: null,
    displayName: "safe",
    startLine: 1,
    endLine: 3,
    complexity: 1,
    bodySpan: {
      startLine: 1,
      startColumn: 0,
      endLine: 3,
      endColumn: 1
    },
    expectsStatementCoverage: true,
    expectsBranchCoverage: false,
    filePath: "/repo/src/sample.ts",
    relativePath: "src/sample.ts",
    location: "src/sample.ts:1-3",
    moduleRoot: "/repo",
    coverage: measured(100),
    statementCoverage: measured(100),
    branchCoverage: structuralNa(),
    coveragePercent: 100,
    crapScore: 1,
    ...overrides
  };
}

describe("report formatting", () => {
  it("builds status, method status, and coverage kind from metrics", () => {
    const report = buildAnalysisReport([
      metric(),
      metric({
        displayName: "risky",
        startLine: 5,
        endLine: 10,
        complexity: 4,
        coverage: measured(0),
        statementCoverage: measured(50),
        branchCoverage: measured(0),
        coveragePercent: 0,
        crapScore: 20
      }),
      metric({
        displayName: "unknownCoverage",
        startLine: 12,
        endLine: 14,
        coverage: unknown("missing_report"),
        statementCoverage: unknown("missing_report"),
        branchCoverage: unknown("missing_report"),
        coveragePercent: null,
        crapScore: null
      })
    ]);

    expect(report.status).toBe("failed");
    expect(report.methods).toMatchObject([
      {
        status: "failed",
        name: "risky",
        coverageKind: "branch"
      },
      {
        status: "passed",
        name: "safe",
        coverageKind: "stmt"
      },
      {
        status: "skipped",
        name: "unknownCoverage",
        coverageKind: "stmt"
      }
    ]);
  });

  it("chooses branch coverage when branch coverage blocks the score", () => {
    const report = buildAnalysisReport([
      metric({
        coverage: unknown("branch_unattributed"),
        statementCoverage: measured(100),
        branchCoverage: unknown("branch_unattributed"),
        coveragePercent: null,
        crapScore: null
      })
    ]);

    expect(report.methods[0]).toMatchObject({
      status: "skipped",
      coverageKind: "branch"
    });
  });

  it("formats JSON without global aggregate fields", () => {
    const parsed = JSON.parse(formatAnalysisReport([metric()], { format: "json" })) as Record<string, unknown>;

    expect(Object.keys(parsed)).toEqual(["status", "methods"]);
    expect(parsed.status).toBe("passed");
    expect(parsed.methods).toEqual([
      expect.objectContaining({
        status: "passed",
        name: "safe",
        threshold: 8
      })
    ]);
  });

  it("formats TOON reports and omits status from agent method entries", () => {
    const output = formatAnalysisReport([
      metric(),
      metric({
        displayName: "risky",
        complexity: 4,
        coverage: measured(0),
        statementCoverage: measured(0),
        branchCoverage: measured(0),
        coveragePercent: 0,
        crapScore: 20
      })
    ], { format: "toon", agent: true });

    expect(output).toContain("status: failed");
    expect(output).toContain("methods[1]{name,sourcePath,startLine,endLine,complexity,coverageKind,coveragePercent,crapScore,threshold}:");
    expect(output).toContain("risky");
    expect(output).not.toContain("safe");
    expect(output).not.toContain("failed,risky");
  });

  it("formats text reports with only method-level details", () => {
    const output = formatTextReport(buildAnalysisReport([metric()]));

    expect(output).toContain("Status: passed");
    expect(output).toContain("Function");
    expect(output).toContain("safe");
    expect(output).not.toContain("Summary");
  });

  it("formats empty agent reports as status only", () => {
    expect(formatToonReport(buildAgentAnalysisReport([]), true)).toBe("status: passed\n");
  });

  it("formats JUnit XML with testcase properties and escaped values", () => {
    const output = formatJunitReport(buildAnalysisReport([
      metric({
        displayName: "risky <value>",
        relativePath: "src/special&file.ts",
        complexity: 4,
        coverage: measured(0),
        statementCoverage: measured(0),
        branchCoverage: measured(0),
        coveragePercent: 0,
        crapScore: 20
      })
    ]));

    expect(output).toContain('<testsuite name="crap-typescript" status="failed" tests="1" failures="1" skipped="0" errors="0">');
    expect(output).toContain('name="risky &lt;value&gt;"');
    expect(output).toContain('file="src/special&amp;file.ts"');
    expect(output).toContain('<property name="score" value="20.0" />');
    expect(output).toContain('<property name="coveragePercent" value="0.0" />');
    expect(output).toContain('<property name="coverageKind" value="stmt" />');
    expect(output).toContain("<failure");
  });

  it("formats unavailable JUnit numeric properties as empty values", () => {
    const output = formatJunitReport(buildAnalysisReport([
      metric({
        displayName: "missingCoverage",
        coverage: unknown("missing_report"),
        statementCoverage: unknown("missing_report"),
        branchCoverage: unknown("missing_report"),
        coveragePercent: null,
        crapScore: null
      })
    ]));

    expect(output).toContain('<property name="score" value="" />');
    expect(output).toContain('<property name="coveragePercent" value="" />');
    expect(output).toContain("<skipped");
  });
});

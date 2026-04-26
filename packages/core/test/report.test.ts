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
    expect(report.threshold).toBe(8);
    expect(report.methods).toMatchObject([
      {
        status: "failed",
        func: "risky",
        covKind: "branch"
      },
      {
        status: "passed",
        func: "safe",
        covKind: "stmt"
      },
      {
        status: "skipped",
        func: "unknownCoverage",
        covKind: "stmt"
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
      covKind: "branch"
    });
  });

  it("formats JSON without global aggregate fields", () => {
    const parsed = JSON.parse(formatAnalysisReport([metric()], { format: "json" })) as Record<string, unknown>;

    expect(Object.keys(parsed)).toEqual(["status", "threshold", "methods"]);
    expect(parsed.status).toBe("passed");
    expect(parsed.threshold).toBe(8);
    expect(parsed.methods).toEqual([
      {
        status: "passed",
        crap: 1,
        cc: 1,
        cov: 100,
        covKind: "stmt",
        func: "safe",
        src: "src/sample.ts",
        lineStart: 1,
        lineEnd: 3
      }
    ]);
  });

  it("formats TOON reports and omits status from agent method entries", () => {
    const output = formatAnalysisReport([
      metric(),
      metric({
        displayName: "risky value",
        complexity: 4,
        coverage: measured(0),
        statementCoverage: measured(0),
        branchCoverage: measured(0),
        coveragePercent: 0,
        crapScore: 20
      })
    ], { format: "toon", agent: true });

    expect(output).toContain("status: failed");
    expect(output).toContain("threshold: 8.0");
    expect(output).toContain("methods[1]{crap,cc,cov,covKind,func,src,lineStart,lineEnd}:");
    expect(output).toContain("\"risky value\"");
    expect(output).not.toContain("safe");
    expect(output).not.toContain("failed,\"risky value\"");
  });

  it("formats unavailable TOON values as null", () => {
    const output = formatToonReport(buildAnalysisReport([
      metric({
        displayName: "missingCoverage",
        coverage: unknown("missing_report"),
        statementCoverage: unknown("missing_report"),
        branchCoverage: unknown("missing_report"),
        coveragePercent: null,
        crapScore: null
      })
    ]));

    expect(output).toContain("skipped,null,1,null,stmt,missingCoverage");
  });

  it("formats text reports with aligned method columns", () => {
    const output = formatTextReport(buildAnalysisReport([
      metric(),
      metric({
        displayName: "risky",
        startLine: 15,
        endLine: 120,
        complexity: 12,
        coverage: measured(0),
        statementCoverage: measured(0),
        branchCoverage: measured(0),
        coveragePercent: 0,
        crapScore: 120
      })
    ]));
    const tableLines = output.split("\n").filter((line) => line.startsWith("|"));
    const pipePositions = tableLines.map((line) =>
      [...line].flatMap((char, index) => char === "|" ? [index] : [])
    );

    expect(output).toContain("status: failed");
    expect(output).toContain("threshold: 8.0");
    expect(tableLines[0]).toBe("| status |  crap | cc |    cov | covKind | func  | src           | lineStart | lineEnd |");
    expect(new Set(pipePositions.map((positions) => positions.join(","))).size).toBe(1);
    expect(output).toContain("safe");
    expect(output).not.toContain("Summary");
  });

  it("formats empty agent reports as status only", () => {
    expect(formatToonReport(buildAgentAnalysisReport([]), true)).toBe("status: passed\nthreshold: 8.0\n");
  });

  it("formats JUnit XML with testcase properties and escaped values", () => {
    const output = formatJunitReport(buildAnalysisReport([
      metric({
        displayName: "risky \"quoted\" <value>",
        relativePath: "src/\"special\"&file.ts",
        complexity: 4,
        coverage: measured(0),
        statementCoverage: measured(0),
        branchCoverage: measured(0),
        coveragePercent: 0,
        crapScore: 20
      })
    ]));

    expect(output).toContain('<testsuite name="crap-typescript" status="failed" tests="1" failures="1" skipped="0" errors="0">');
    expect(output).toContain('<property name="threshold" value="8.0"/>');
    expect(output).toContain('name="risky &quot;quoted&quot; &lt;value&gt;"');
    expect(output).toContain('file="src/&quot;special&quot;&amp;file.ts"');
    expect(output).toContain('<property name="crap" value="20.0"/>');
    expect(output).toContain('<property name="cov" value="0.0"/>');
    expect(output).toContain('<property name="covKind" value="stmt"/>');
    expect(output.match(/property name="threshold"/g)).toHaveLength(1);
    expect(output).toContain("<failure");
    expect(output.endsWith("\n")).toBe(true);
    expect(output.endsWith("\n\n")).toBe(false);
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

    expect(output).toContain('<property name="crap" value=""/>');
    expect(output).toContain('<property name="cov" value=""/>');
    expect(output).toContain("<skipped");
  });

  it("formats empty JUnit reports without testcase elements", () => {
    const output = formatJunitReport(buildAnalysisReport([]));

    expect(output).toContain('<testsuite name="crap-typescript" status="passed" tests="0" failures="0" skipped="0" errors="0">');
    expect(output).toContain('<property name="threshold" value="8.0"/>');
    expect(output).not.toContain("<testcase");
    expect(output.endsWith("\n")).toBe(true);
    expect(output.endsWith("\n\n")).toBe(false);
  });
});

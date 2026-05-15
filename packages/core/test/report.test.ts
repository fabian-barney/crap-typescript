import { describe, expect, it } from "vitest";
import { encode } from "@toon-format/toon";

import {
  buildAgentAnalysisReport,
  buildAnalysisReport,
  formatAnalysisReport,
  formatJunitReport,
  formatTextReport,
  formatToonReport
} from "../src/report";
import type { CoverageMetric, MethodMetrics } from "../src/types";
import type { SourceExclusionAudit } from "../src/types";

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

const sourceExclusionAudit: SourceExclusionAudit = {
  candidateFiles: 2,
  includedFiles: 1,
  excludedFiles: 1,
  reasons: [
    {
      source: "default",
      kind: "path",
      rule: "**/*.generated.ts",
      count: 1
    }
  ]
};

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
        method: "risky",
        covKind: "branch"
      },
      {
        status: "passed",
        method: "safe",
        covKind: "stmt"
      },
      {
        status: "skipped",
        method: "unknownCoverage",
        covKind: "N/A"
      }
    ]);
  });

  it("reports N/A coverage kind when score coverage is unavailable", () => {
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
      covKind: "N/A"
    });
  });

  it("reports statement coverage kind when it is the only measured component", () => {
    const report = buildAnalysisReport([
      metric({
        coverage: measured(75),
        statementCoverage: measured(75),
        branchCoverage: unknown("branch_unattributed"),
        coveragePercent: 75,
        crapScore: 1.0625
      })
    ]);

    expect(report.methods[0]).toMatchObject({
      status: "passed",
      covKind: "stmt"
    });
  });

  it("reports branch coverage kind when it is the only measured component", () => {
    const report = buildAnalysisReport([
      metric({
        coverage: measured(50),
        statementCoverage: unknown("statement_unattributed"),
        branchCoverage: measured(50),
        coveragePercent: 50,
        crapScore: 1.125
      })
    ]);

    expect(report.methods[0]).toMatchObject({
      status: "passed",
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
        method: "safe",
        src: "src/sample.ts",
        lineStart: 1,
        lineEnd: 3
      }
    ]);
  });

  it("includes source exclusion audit in full reports and JUnit sidecars", () => {
    const parsed = JSON.parse(formatAnalysisReport([metric()], {
      format: "json",
      sourceExclusionAudit
    })) as {
      sourceExclusions: SourceExclusionAudit;
    };
    const text = formatAnalysisReport([metric()], {
      format: "text",
      sourceExclusionAudit
    });
    const junit = formatAnalysisReport([metric()], {
      format: "junit",
      sourceExclusionAudit
    });

    expect(parsed.sourceExclusions).toEqual(sourceExclusionAudit);
    expect(text).toContain("sourceExclusions:");
    expect(text).toContain("  default path **/*.generated.ts: 1");
    expect(junit).toContain('name="sourceExclusions.candidateFiles" value="2"');
    expect(junit).toContain('value="default path **/*.generated.ts: 1"');
  });

  it("omits source exclusion audit from optimized agent primary reports", () => {
    const compactAgent = JSON.parse(formatAnalysisReport([metric({
      displayName: "risky",
      complexity: 4,
      coverage: measured(0),
      statementCoverage: measured(0),
      branchCoverage: measured(0),
      coveragePercent: 0,
      crapScore: 20
    })], {
      format: "json",
      agent: true,
      sourceExclusionAudit
    })) as Record<string, unknown>;
    const fullAgentOverride = JSON.parse(formatAnalysisReport([metric()], {
      format: "json",
      agent: true,
      failuresOnly: false,
      omitRedundancy: false,
      sourceExclusionAudit
    })) as Record<string, unknown>;

    expect(compactAgent).not.toHaveProperty("sourceExclusions");
    expect(fullAgentOverride).toHaveProperty("sourceExclusions");
  });

  it("uses configured thresholds for method status and report metadata", () => {
    const parsed = JSON.parse(formatAnalysisReport([
      metric({
        displayName: "borderline",
        complexity: 4,
        coverage: measured(0),
        statementCoverage: measured(0),
        branchCoverage: measured(0),
        coveragePercent: 0,
        crapScore: 20
      })
    ], { format: "json", threshold: 21 })) as {
      status: string;
      threshold: number;
      methods: Array<{ status: string }>;
    };

    expect(parsed.status).toBe("passed");
    expect(parsed.threshold).toBe(21);
    expect(parsed.methods[0].status).toBe("passed");
  });

  it("filters primary reports to failed methods without changing run metadata", () => {
    const parsed = JSON.parse(formatAnalysisReport([
      metric(),
      metric({
        displayName: "risky",
        startLine: 5,
        endLine: 10,
        complexity: 4,
        coverage: measured(0),
        statementCoverage: measured(0),
        branchCoverage: measured(0),
        coveragePercent: 0,
        crapScore: 20
      })
    ], { format: "json", failuresOnly: true })) as {
      status: string;
      threshold: number;
      methods: Array<{ status: string; method: string }>;
    };

    expect(parsed.status).toBe("failed");
    expect(parsed.threshold).toBe(8);
    expect(parsed.methods).toEqual([
      expect.objectContaining({
        status: "failed",
        method: "risky"
      })
    ]);
  });

  it("omits redundant method statuses without changing run metadata", () => {
    const parsed = JSON.parse(formatAnalysisReport([
      metric(),
      metric({
        displayName: "risky",
        startLine: 5,
        endLine: 10,
        complexity: 4,
        coverage: measured(0),
        statementCoverage: measured(0),
        branchCoverage: measured(0),
        coveragePercent: 0,
        crapScore: 20
      })
    ], { format: "json", omitRedundancy: true })) as {
      status: string;
      threshold: number;
      methods: Array<Record<string, unknown>>;
    };

    expect(parsed.status).toBe("failed");
    expect(parsed.threshold).toBe(8);
    expect(parsed.methods).toHaveLength(2);
    expect(parsed.methods[0]).not.toHaveProperty("status");
    expect(parsed.methods[0]).toMatchObject({
      method: "risky"
    });
    expect(parsed.methods[1]).not.toHaveProperty("status");
    expect(parsed.methods[1]).toMatchObject({
      method: "safe"
    });
  });

  it("uses agent as failures-only plus omit-redundancy defaults", () => {
    const parsed = JSON.parse(formatAnalysisReport([
      metric(),
      metric({
        displayName: "risky",
        startLine: 5,
        endLine: 10,
        complexity: 4,
        coverage: measured(0),
        statementCoverage: measured(0),
        branchCoverage: measured(0),
        coveragePercent: 0,
        crapScore: 20
      })
    ], { format: "json", agent: true })) as {
      status: string;
      threshold: number;
      methods: Array<Record<string, unknown>>;
    };

    expect(parsed.status).toBe("failed");
    expect(parsed.threshold).toBe(8);
    expect(parsed.methods).toEqual([
      expect.objectContaining({
        method: "risky"
      })
    ]);
    expect(parsed.methods[0]).not.toHaveProperty("status");
  });

  it("lets explicit report options override agent defaults", () => {
    const parsed = JSON.parse(formatAnalysisReport([
      metric(),
      metric({
        displayName: "risky",
        startLine: 5,
        endLine: 10,
        complexity: 4,
        coverage: measured(0),
        statementCoverage: measured(0),
        branchCoverage: measured(0),
        coveragePercent: 0,
        crapScore: 20
      })
    ], {
      format: "json",
      agent: true,
      failuresOnly: false,
      omitRedundancy: false
    })) as {
      methods: Array<{ status: string; method: string }>;
    };

    expect(parsed.methods).toHaveLength(2);
    expect(parsed.methods[0]).toMatchObject({
      status: "failed",
      method: "risky"
    });
    expect(parsed.methods[1]).toMatchObject({
      status: "passed",
      method: "safe"
    });
  });

  it("omits redundant method statuses from TOON reports", () => {
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
    ], { format: "toon", omitRedundancy: true });

    expect(output).toContain("status: failed");
    expect(output).toContain("threshold: 8");
    expect(output).toContain("methods[2]{crap,cc,cov,covKind,method,src,lineStart,lineEnd}:");
    expect(output).toContain("risky");
    expect(output).toContain("safe");
    expect(output).not.toContain("{status,crap");
  });

  it("omits redundant method statuses from text reports", () => {
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
    ], { format: "text", omitRedundancy: true });
    const tableLines = output.split("\n").filter((line) => line.startsWith("|"));

    expect(output).toContain("status: failed");
    expect(output).toContain("threshold: 8.0");
    expect(tableLines[0]).toBe("| crap | cc |    cov | covKind | method | src           | lineStart | lineEnd |");
    expect(output).toContain("risky");
    expect(output).toContain("safe");
    expect(output).not.toContain("| status |");
  });

  it("omits redundant JUnit status properties while preserving failure elements", () => {
    const output = formatAnalysisReport([
      metric({
        displayName: "risky",
        complexity: 4,
        coverage: measured(0),
        statementCoverage: measured(0),
        branchCoverage: measured(0),
        coveragePercent: 0,
        crapScore: 20
      })
    ], { format: "junit", omitRedundancy: true });

    expect(output).toContain('<testsuite name="crap-typescript" status="failed" tests="1" failures="1" skipped="0" errors="0" time="0">');
    expect(output).toContain("<failure");
    expect(output).not.toContain('<property name="status"');
  });

  it("returns empty primary content for none reports", () => {
    expect(formatAnalysisReport([
      metric({
        displayName: "risky",
        complexity: 4,
        coverage: measured(0),
        statementCoverage: measured(0),
        branchCoverage: measured(0),
        coveragePercent: 0,
        crapScore: 20
      })
    ], { format: "none" })).toBe("");
  });

  it("validates thresholds before returning empty none reports", () => {
    expect(() => formatAnalysisReport([], { format: "none", threshold: 0 })).toThrow(
      "Threshold must be a finite number greater than 0"
    );
  });

  it("allows agent defaults with primary JUnit reports", () => {
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
    ], { format: "junit", agent: true });

    expect(output).toContain('tests="1"');
    expect(output).toContain('name="risky:1"');
    expect(output).not.toContain('name="safe:1"');
    expect(output).not.toContain('<property name="status"');
  });

  it("formats TOON reports and omits status from agent method entries", () => {
    const report = buildAgentAnalysisReport([
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
    ]);
    const output = formatToonReport(report, true);

    expect(output).toBe(`${encode(report)}\n`);
    expect(output).toContain("status: failed");
    expect(output).toContain("threshold: 8");
    expect(output).toContain("methods[1]{crap,cc,cov,covKind,method,src,lineStart,lineEnd}:");
    expect(output).toContain("risky value");
    expect(output).not.toContain("safe");
    expect(output).not.toContain("status,crap");
  });

  it("formats full TOON reports with quoted strings and null values through the official encoder", () => {
    const report = buildAnalysisReport([
      metric({
        displayName: "risky \"quoted\", value",
        relativePath: "src/a,b.ts",
        complexity: 4,
        coverage: measured(0),
        statementCoverage: measured(0),
        branchCoverage: measured(0),
        coveragePercent: 0,
        crapScore: 20
      }),
      metric({
        displayName: "missingCoverage",
        coverage: unknown("missing_report"),
        statementCoverage: unknown("missing_report"),
        branchCoverage: unknown("missing_report"),
        coveragePercent: null,
        crapScore: null
      })
    ]);
    const output = formatToonReport(report);

    expect(output).toBe(`${encode(report)}\n`);
    expect(output).toContain('failed,20,4,0,stmt,"risky \\"quoted\\", value","src/a,b.ts",1,3');
    expect(output).toContain("skipped,null,1,null,N/A,missingCoverage");
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
    expect(tableLines[0]).toBe("| status |  crap | cc |    cov | covKind | method | src           | lineStart | lineEnd |");
    expect(new Set(pipePositions.map((positions) => positions.join(","))).size).toBe(1);
    expect(output).toContain("safe");
    expect(output).not.toContain("Summary");
  });

  it("formats empty TOON method lists through the official encoder", () => {
    const report = buildAnalysisReport([]);
    const agentReport = buildAgentAnalysisReport([]);

    expect(formatToonReport(report)).toBe(`${encode(report)}\n`);
    expect(formatToonReport(agentReport, true)).toBe(`${encode(agentReport)}\n`);
    expect(formatToonReport(report)).toBe("status: passed\nthreshold: 8\nmethods[0]:\n");
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

    expect(output).toContain('<testsuites name="crap-typescript" tests="1" failures="1" skipped="0" errors="0" time="0">');
    expect(output).toContain('<testsuite name="crap-typescript" status="failed" tests="1" failures="1" skipped="0" errors="0" time="0">');
    expect(output).toContain('<property name="threshold" value="8.0"/>');
    expect(output).toContain('classname="src/&quot;special&quot;&amp;file.ts"');
    expect(output).toContain('name="risky &quot;quoted&quot; &lt;value&gt;:1"');
    expect(output).toContain('file="src/&quot;special&quot;&amp;file.ts"');
    expect(output).toContain('time="0"');
    expect(output).toContain('<property name="status" value="failed"/>');
    expect(output).toContain('<property name="crap" value="20.0"/>');
    expect(output).toContain('<property name="cov" value="0.0"/>');
    expect(output).toContain('<property name="covKind" value="stmt"/>');
    expect(output.match(/property name="threshold"/g)).toHaveLength(1);
    expect(output).toContain("<failure");
    expect(output).toContain("CRAP score: 20.0");
    expect(output).toContain("Threshold: 8.0");
    expect(output).toContain("Coverage: 0.0% (stmt)");
    expect(output).toContain("Source: src/");
    expect(output).toContain(":1-3");
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
    expect(output).toContain("CRAP score: N/A");
    expect(output).toContain("Threshold: 8.0");
    expect(output).toContain("Coverage: N/A (N/A)");
    expect(output).toContain("Source: src/sample.ts:1-3");
  });

  it("formats empty JUnit reports without testcase elements", () => {
    const output = formatJunitReport(buildAnalysisReport([]));

    expect(output).toContain('<testsuites name="crap-typescript" tests="0" failures="0" skipped="0" errors="0" time="0">');
    expect(output).toContain('<testsuite name="crap-typescript" status="passed" tests="0" failures="0" skipped="0" errors="0" time="0">');
    expect(output).toContain('<property name="threshold" value="8.0"/>');
    expect(output).not.toContain("<testcase");
    expect(output.endsWith("\n")).toBe(true);
    expect(output.endsWith("\n\n")).toBe(false);
  });
});

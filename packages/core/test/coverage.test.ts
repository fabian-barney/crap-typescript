import path from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { buildCoverageCommand } from "../src/coverage";
import { coverageForMethods, parseCoverageReport } from "../src/istanbul";
import { parseFileMethods } from "../src/parser";
import { createTempDir, disposeTempDir, writeProjectFiles } from "./testUtils";

const tempDirs: string[] = [];

afterEach(async () => {
  await Promise.all(tempDirs.splice(0).map(disposeTempDir));
});

describe("coverage helpers", () => {
  it("builds npm vitest coverage commands", () => {
    expect(buildCoverageCommand("npm", "vitest", "C:/tmp")).toEqual({
      command: "npm",
      args: [
        "exec",
        "--no",
        "--",
        "vitest",
        "run",
        "--coverage.enabled=true",
        "--coverage.reporter=json",
        "--coverage.reporter=text",
        "--coverage.reportsDirectory=coverage"
      ],
      cwd: "C:/tmp",
      packageManager: "npm",
      testRunner: "vitest"
    });
  });

  it("builds yarn jest coverage commands", () => {
    expect(buildCoverageCommand("yarn", "jest", "C:/tmp")).toEqual({
      command: "yarn",
      args: [
        "jest",
        "--coverage",
        "--runInBand",
        "--coverageReporters=json",
        "--coverageReporters=text",
        "--coverageDirectory=coverage"
      ],
      cwd: "C:/tmp",
      packageManager: "yarn",
      testRunner: "jest"
    });
  });

  it("builds custom coverage directory arguments from the expected report path", () => {
    expect(buildCoverageCommand("pnpm", "vitest", "C:/tmp", "custom-coverage/coverage-final.json").args).toContain(
      "--coverage.reportsDirectory=custom-coverage"
    );
    expect(buildCoverageCommand("pnpm", "jest", "C:/tmp", "custom-coverage/coverage-final.json").args).toContain(
      "--coverageDirectory=custom-coverage"
    );
  });

  it("computes function coverage as the minimum of statement and branch coverage", async () => {
    const projectRoot = await createTempDir("crap-coverage-");
    tempDirs.push(projectRoot);
    await writeProjectFiles(projectRoot, {
      "package.json": '{"name":"fixture","private":true}',
      "src/sample.ts": `export function safe(value: number): number {
  return value + 1;
}

export function risky(flag: boolean): number {
  if (flag) {
    return 1;
  }
  throw new Error("boom");
}

export const trim = (value: string) => value.trim();
`,
      "coverage/coverage-final.json": JSON.stringify({
        "src/sample.ts": {
          path: "src/sample.ts",
          statementMap: {
            "0": {
              start: { line: 2, column: 2 },
              end: { line: 2, column: 19 }
            },
            "1": {
              start: { line: 7, column: 4 },
              end: { line: 7, column: 13 }
            },
            "2": {
              start: { line: 9, column: 2 },
              end: { line: 9, column: 26 }
            },
            "3": {
              start: { line: 12, column: 39 },
              end: { line: 12, column: 51 }
            }
          },
          fnMap: {},
          branchMap: {
            "0": {
              line: 6,
              type: "if",
              loc: {
                start: { line: 6, column: 2 },
                end: { line: 8, column: 3 }
              },
              locations: [
                {
                  start: { line: 6, column: 2 },
                  end: { line: 8, column: 3 }
                },
                {}
              ]
            }
          },
          s: {
            "0": 1,
            "1": 1,
            "2": 0,
            "3": 1
          },
          f: {},
          b: {
            "0": [1, 1]
          }
        }
      })
    });

    const filePath = path.join(projectRoot, "src", "sample.ts");
    const methods = await parseFileMethods(filePath);
    const coverageReport = await parseCoverageReport(
      path.join(projectRoot, "coverage", "coverage-final.json"),
      projectRoot
    );
    const methodCoverage = coverageForMethods(methods, [...coverageReport.values()][0]);

    expect(methodCoverage.map(summarizeMethodCoverage)).toEqual([
      {
        coverage: { percent: 100.0, status: "measured", reason: null },
        statement: { percent: 100.0, status: "measured", reason: null },
        branch: { percent: null, status: "structural_na", reason: null }
      },
      {
        coverage: { percent: 50.0, status: "measured", reason: null },
        statement: { percent: 50.0, status: "measured", reason: null },
        branch: { percent: 100.0, status: "measured", reason: null }
      },
      {
        coverage: { percent: 100.0, status: "measured", reason: null },
        statement: { percent: 100.0, status: "measured", reason: null },
        branch: { percent: null, status: "structural_na", reason: null }
      }
    ]);
  });

  it("keeps coverage unknown when expected statement or branch data cannot be attributed", async () => {
    const projectRoot = await createTempDir("crap-coverage-");
    tempDirs.push(projectRoot);
    await writeProjectFiles(projectRoot, {
      "package.json": '{"name":"fixture","private":true}',
      "src/sample.ts": `export function safe(value: number): number {
  return value + 1;
}

export function risky(flag: boolean): number {
  if (flag) {
    return 1;
  }
  throw new Error("boom");
}

export const trim = (value: string) => value.trim();
`
    });

    const methods = await parseFileMethods(path.join(projectRoot, "src", "sample.ts"));
    const methodCoverage = coverageForMethods(methods, {
      statements: [],
      branches: [],
      functions: []
    });

    expect(methodCoverage.map(summarizeMethodCoverage)).toEqual([
      {
        coverage: { percent: null, status: "unknown", reason: "statement_unattributed" },
        statement: { percent: null, status: "unknown", reason: "statement_unattributed" },
        branch: { percent: null, status: "structural_na", reason: null }
      },
      {
        coverage: { percent: null, status: "unknown", reason: "statement_unattributed" },
        statement: { percent: null, status: "unknown", reason: "statement_unattributed" },
        branch: { percent: null, status: "unknown", reason: "branch_unattributed" }
      },
      {
        coverage: { percent: null, status: "unknown", reason: "statement_unattributed" },
        statement: { percent: null, status: "unknown", reason: "statement_unattributed" },
        branch: { percent: null, status: "structural_na", reason: null }
      }
    ]);
  });

  it("preserves structural component statuses when file coverage is unavailable", async () => {
    const projectRoot = await createTempDir("crap-coverage-");
    tempDirs.push(projectRoot);
    await writeProjectFiles(projectRoot, {
      "package.json": '{"name":"fixture","private":true}',
      "src/sample.ts": `export function empty(): void {}

export function typeOnly(): void {
  type Local = { value: string };
  interface Shape { value: string }
}

export function branchy(flag: boolean): number {
  if (flag) {
    return 1;
  }
  return 0;
}
`
    });

    const methods = await parseFileMethods(path.join(projectRoot, "src", "sample.ts"));
    expect(coverageForMethods(methods, undefined, "missing_report").map(summarizeMethodCoverage)).toEqual([
      {
        coverage: { percent: null, status: "unknown", reason: "missing_report" },
        statement: { percent: null, status: "structural_na", reason: null },
        branch: { percent: null, status: "structural_na", reason: null }
      },
      {
        coverage: { percent: null, status: "unknown", reason: "missing_report" },
        statement: { percent: null, status: "structural_na", reason: null },
        branch: { percent: null, status: "structural_na", reason: null }
      },
      {
        coverage: { percent: null, status: "unknown", reason: "missing_report" },
        statement: { percent: null, status: "unknown", reason: "missing_report" },
        branch: { percent: null, status: "unknown", reason: "missing_report" }
      }
    ]);
  });

  it("keeps coverage unknown when a body is not provably structural N/A even if no statements were attributed", async () => {
    const projectRoot = await createTempDir("crap-coverage-");
    tempDirs.push(projectRoot);
    await writeProjectFiles(projectRoot, {
      "package.json": '{"name":"fixture","private":true}',
      "src/sample.ts": `export function empty(): void {}

export function typeOnly(): void {
  type Local = { value: string };
  interface Shape { value: string }
}

export function functionDeclOnly(): void {
  function inner() {}
}

export function classDeclOnly(): void {
  class Local {}
}

export function enumDeclOnly(): void {
  enum LocalEnum { A }
}
`
    });

    const methods = await parseFileMethods(path.join(projectRoot, "src", "sample.ts"));
    const methodCoverage = coverageForMethods(methods, {
      statements: [],
      branches: [],
      functions: []
    });
    const byName = new Map(methods.map((method, index) => [method.displayName, methodCoverage[index]]));

    expect(summarizeMethodCoverage(byName.get("empty")!)).toEqual({
      coverage: { percent: 100.0, status: "structural_na", reason: null },
      statement: { percent: null, status: "structural_na", reason: null },
      branch: { percent: null, status: "structural_na", reason: null }
    });
    expect(summarizeMethodCoverage(byName.get("typeOnly")!)).toEqual({
      coverage: { percent: 100.0, status: "structural_na", reason: null },
      statement: { percent: null, status: "structural_na", reason: null },
      branch: { percent: null, status: "structural_na", reason: null }
    });
    expect(summarizeMethodCoverage(byName.get("functionDeclOnly")!)).toEqual({
      coverage: { percent: null, status: "unknown", reason: "statement_unattributed" },
      statement: { percent: null, status: "unknown", reason: "statement_unattributed" },
      branch: { percent: null, status: "structural_na", reason: null }
    });
    expect(summarizeMethodCoverage(byName.get("classDeclOnly")!)).toEqual({
      coverage: { percent: null, status: "unknown", reason: "statement_unattributed" },
      statement: { percent: null, status: "unknown", reason: "statement_unattributed" },
      branch: { percent: null, status: "structural_na", reason: null }
    });
    expect(summarizeMethodCoverage(byName.get("enumDeclOnly")!)).toEqual({
      coverage: { percent: null, status: "unknown", reason: "statement_unattributed" },
      statement: { percent: null, status: "unknown", reason: "statement_unattributed" },
      branch: { percent: null, status: "structural_na", reason: null }
    });
  });

  it("keeps coverage unknown when branch syntax exists but no branch counters can be attributed", async () => {
    const projectRoot = await createTempDir("crap-coverage-");
    tempDirs.push(projectRoot);
    await writeProjectFiles(projectRoot, {
      "package.json": '{"name":"fixture","private":true}',
      "src/sample.ts": `export function branchy(flag: boolean): number {
  if (flag) {
    return 1;
  }
  return 0;
}
`,
      "coverage/coverage-final.json": JSON.stringify({
        "src/sample.ts": {
          path: "src/sample.ts",
          statementMap: {
            "0": {
              start: { line: 3, column: 4 },
              end: { line: 3, column: 13 }
            },
            "1": {
              start: { line: 5, column: 2 },
              end: { line: 5, column: 11 }
            }
          },
          fnMap: {},
          branchMap: {},
          s: {
            "0": 1,
            "1": 1
          },
          f: {},
          b: {}
        }
      })
    });

    const methods = await parseFileMethods(path.join(projectRoot, "src", "sample.ts"));
    const coverageReport = await parseCoverageReport(
      path.join(projectRoot, "coverage", "coverage-final.json"),
      projectRoot
    );

    expect(coverageForMethods(methods, [...coverageReport.values()][0]).map(summarizeMethodCoverage)).toEqual([
      {
        coverage: { percent: null, status: "unknown", reason: "branch_unattributed" },
        statement: { percent: 100.0, status: "measured", reason: null },
        branch: { percent: null, status: "unknown", reason: "branch_unattributed" }
      }
    ]);
  });

  it("accepts exact fnMap matches during attribution", async () => {
    const projectRoot = await createTempDir("crap-coverage-");
    tempDirs.push(projectRoot);
    await writeProjectFiles(projectRoot, {
      "package.json": '{"name":"fixture","private":true}',
      "src/sample.ts": `export function exact(flag: boolean): number {
  if (flag) {
    return 1;
  }
  return 0;
}
`
    });

    const methods = await parseFileMethods(path.join(projectRoot, "src", "sample.ts"));
    const [method] = methods;
    expect(
      coverageForMethods(methods, {
        statements: [
          { span: { startLine: 3, startColumn: 4, endLine: 3, endColumn: 13 }, hits: 1 },
          { span: { startLine: 5, startColumn: 2, endLine: 5, endColumn: 11 }, hits: 1 }
        ],
        branches: [
          {
            span: { startLine: 2, startColumn: 2, endLine: 4, endColumn: 3 },
            hits: [1, 1]
          }
        ],
        functions: [
          { span: method.bodySpan }
        ]
      }).map(summarizeMethodCoverage)
    ).toEqual([
      {
        coverage: { percent: 100.0, status: "measured", reason: null },
        statement: { percent: 100.0, status: "measured", reason: null },
        branch: { percent: 100.0, status: "measured", reason: null }
      }
    ]);
  });

  it("uses fnMap as a secondary matching aid when function columns drift", async () => {
    const projectRoot = await createTempDir("crap-coverage-");
    tempDirs.push(projectRoot);
    await writeProjectFiles(projectRoot, {
      "package.json": '{"name":"fixture","private":true}',
      "src/sample.ts": `export function drift(flag: boolean): number {
  if (flag) {
    return 1;
  }
  return 0;
}
`
    });

    const methods = await parseFileMethods(path.join(projectRoot, "src", "sample.ts"));
    expect(
      coverageForMethods(methods, {
        statements: [
          { span: { startLine: 3, startColumn: 4, endLine: 3, endColumn: 13 }, hits: 1 },
          { span: { startLine: 5, startColumn: 2, endLine: 5, endColumn: 11 }, hits: 1 }
        ],
        branches: [
          {
            span: { startLine: 1, startColumn: 0, endLine: 4, endColumn: 3 },
            hits: [1, 1]
          }
        ],
        functions: [
          { span: { startLine: 1, startColumn: 0, endLine: 6, endColumn: 1 } }
        ]
      }).map(summarizeMethodCoverage)
    ).toEqual([
      {
        coverage: { percent: 100.0, status: "measured", reason: null },
        statement: { percent: 100.0, status: "measured", reason: null },
        branch: { percent: 100.0, status: "measured", reason: null }
      }
    ]);
  });

  it("rejects line-aligned fnMap matches when the columns do not overlap", async () => {
    const projectRoot = await createTempDir("crap-coverage-");
    tempDirs.push(projectRoot);
    await writeProjectFiles(projectRoot, {
      "package.json": '{"name":"fixture","private":true}',
      "src/sample.ts": `export const trim = (value: string) => value.trim();
`
    });

    const methods = await parseFileMethods(path.join(projectRoot, "src", "sample.ts"));
    expect(
      coverageForMethods(methods, {
        statements: [
          { span: { startLine: 1, startColumn: 39, endLine: 1, endColumn: 51 }, hits: 1 }
        ],
        branches: [],
        functions: [
          { span: { startLine: 1, startColumn: 0, endLine: 1, endColumn: 10 } }
        ]
      }).map(summarizeMethodCoverage)
    ).toEqual([
      {
        coverage: { percent: null, status: "unknown", reason: "fnmap_conflict" },
        statement: { percent: null, status: "unknown", reason: "fnmap_conflict" },
        branch: { percent: null, status: "structural_na", reason: null }
      }
    ]);
  });

  it("parses fallback branch and function spans and deduplicates hits conservatively", async () => {
    const projectRoot = await createTempDir("crap-coverage-");
    tempDirs.push(projectRoot);
    await writeProjectFiles(projectRoot, {
      "package.json": '{"name":"fixture","private":true}',
      "coverage/coverage-final.json": JSON.stringify({
        "src/sample.ts": {
          path: "src/sample.ts",
          statementMap: {
            "0": {
              start: { line: 2, column: 2 },
              end: { line: 2, column: 19 }
            },
            "1": {
              start: { line: 2, column: 2 },
              end: { line: 2, column: 19 }
            }
          },
          branchMap: {
            "0": {
              line: 3,
              locations: [
                {
                  start: { line: 3, column: 2 },
                  end: { line: 5, column: 3 }
                }
              ]
            },
            "1": {
              loc: {
                start: { line: 3, column: 2 },
                end: { line: 5, column: 3 }
              }
            }
          },
          fnMap: {
            "0": {
              decl: {
                start: { line: 1, column: 0 },
                end: { line: 6, column: 1 }
              }
            },
            "1": {
              line: 1
            }
          },
          s: {
            "0": 1,
            "1": 3
          },
          b: {
            "0": [1, 0],
            "1": [0, 2, 4]
          },
          f: {}
        }
      })
    });

    const [fileCoverage] = (await parseCoverageReport(path.join(projectRoot, "coverage", "coverage-final.json"), projectRoot)).values();
    expect(fileCoverage.statements).toEqual([
      {
        span: {
          startLine: 2,
          startColumn: 2,
          endLine: 2,
          endColumn: 19
        },
        hits: 3
      }
    ]);
    expect(fileCoverage.branches).toEqual([
      {
        span: {
          startLine: 3,
          startColumn: 2,
          endLine: 5,
          endColumn: 3
        },
        hits: [1, 2, 4]
      }
    ]);
    expect(fileCoverage.functions).toEqual([
      {
        span: {
          startLine: 1,
          startColumn: 0,
          endLine: 6,
          endColumn: 1
        }
      },
      {
        span: {
          startLine: 1,
          startColumn: 0,
          endLine: 1,
          endColumn: Number.MAX_SAFE_INTEGER
        }
      }
    ]);
  });
});

function summarizeMethodCoverage(coverage: {
  coverage: { percent: number | null; status: string; unknownReason: string | null };
  statementCoverage: { percent: number | null; status: string; unknownReason: string | null };
  branchCoverage: { percent: number | null; status: string; unknownReason: string | null };
}): {
  coverage: { percent: number | null; status: string; reason: string | null };
  statement: { percent: number | null; status: string; reason: string | null };
  branch: { percent: number | null; status: string; reason: string | null };
} {
  return {
    coverage: summarizeMetric(coverage.coverage),
    statement: summarizeMetric(coverage.statementCoverage),
    branch: summarizeMetric(coverage.branchCoverage)
  };
}

function summarizeMetric(metric: {
  percent: number | null;
  status: string;
  unknownReason: string | null;
}): { percent: number | null; status: string; reason: string | null } {
  return {
    percent: metric.percent === null ? null : Number(metric.percent.toFixed(1)),
    status: metric.status,
    reason: metric.unknownReason
  };
}

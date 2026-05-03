import path from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { analyzeProject } from "../src/analyzeProject";
import { CRAP_THRESHOLD } from "../src/constants";
import { copyFixture, createTempDir, disposeTempDir, writeProjectFiles } from "./testUtils";

const tempDirs: string[] = [];

afterEach(async () => {
  await Promise.all(tempDirs.splice(0).map(disposeTempDir));
});

describe("analyzeProject", () => {
  it("analyzes a multi-package workspace using existing Istanbul coverage reports", async () => {
    const projectRoot = await copyFixture("workspace-project");
    tempDirs.push(projectRoot);

    const result = await analyzeProject({
      projectRoot,
      coverageMode: "existing-only"
    });

    expect(result.selectedFiles.map((file) => path.relative(projectRoot, file).replace(/\\/g, "/"))).toEqual([
      "packages/package-a/src/math.ts",
      "packages/package-b/src/text.ts"
    ]);
    expect(result.metrics.map((metric) => ({
      name: metric.displayName,
      coverage: metric.coveragePercent === null ? null : Number(metric.coveragePercent.toFixed(1)),
      crap: metric.crapScore === null ? null : Number(metric.crapScore.toFixed(1)),
      coverageStatus: metric.coverage.status,
      statementStatus: metric.statementCoverage.status,
      branchStatus: metric.branchCoverage.status
    }))).toEqual([
      { name: "add", coverage: 100.0, crap: 1.0, coverageStatus: "measured", statementStatus: "measured", branchStatus: "structural_na" },
      { name: "risky", coverage: 0.0, crap: 12.0, coverageStatus: "measured", statementStatus: "measured", branchStatus: "measured" },
      { name: "upper", coverage: 100.0, crap: 1.0, coverageStatus: "measured", statementStatus: "measured", branchStatus: "structural_na" }
    ]);
    expect(result.maxCrap).toBeGreaterThan(CRAP_THRESHOLD);
    expect(result.threshold).toBe(CRAP_THRESHOLD);
    expect(result.thresholdExceeded).toBe(true);
  });

  it("uses configured thresholds and emits Java-style threshold warnings", async () => {
    const projectRoot = await copyFixture("workspace-project");
    tempDirs.push(projectRoot);
    const warnings: string[] = [];

    const result = await analyzeProject({
      projectRoot,
      coverageMode: "existing-only",
      threshold: 13,
      stderr: {
        write(chunk: string) {
          warnings.push(chunk);
        }
      }
    });

    expect(result.threshold).toBe(13);
    expect(result.thresholdExceeded).toBe(false);
    expect(result.warnings).toEqual([
      "Warning: CRAP threshold above 8.0 is too lenient even for hard gates. Use 8.0 for hard gates, target 6.0 during implementation, and use the 8.0 default when in doubt."
    ]);
    expect(warnings.join("")).toContain("CRAP threshold above 8.0 is too lenient");
  });

  it("rejects invalid configured thresholds", async () => {
    await expect(analyzeProject({ threshold: 0 })).rejects.toThrow("Threshold must be a finite number greater than 0");
  });

  it("warns and reports N/A coverage when existing coverage is missing", async () => {
    const projectRoot = await createTempDir("crap-analysis-");
    tempDirs.push(projectRoot);
    const warnings: string[] = [];
    await writeProjectFiles(projectRoot, {
      "package.json": '{"name":"fixture","private":true}',
      "src/sample.ts": `export function risky(flagA: boolean, flagB: boolean): number {
  if (flagA && flagB) {
    return 1;
  }
  return 0;
}
`
    });

    const result = await analyzeProject({
      projectRoot,
      coverageMode: "existing-only",
      stderr: {
        write(chunk: string) {
          warnings.push(chunk);
        }
      }
    });

    expect(result.warnings).toHaveLength(1);
    expect(warnings.join("")).toContain("Coverage will be N/A");
    expect(result.metrics[0]?.coveragePercent).toBeNull();
    expect(result.metrics[0]?.crapScore).toBeNull();
    expect(result.metrics[0]?.coverage.status).toBe("unknown");
    expect(result.metrics[0]?.coverage.unknownReason).toBe("missing_report");
    expect(result.metrics[0]?.statementCoverage.unknownReason).toBe("missing_report");
    expect(result.metrics[0]?.branchCoverage.unknownReason).toBe("missing_report");
  });

  it("warns and reports N/A coverage when the coverage report cannot be parsed", async () => {
    const projectRoot = await createTempDir("crap-analysis-");
    tempDirs.push(projectRoot);
    const warnings: string[] = [];
    await writeProjectFiles(projectRoot, {
      "package.json": '{"name":"fixture","private":true}',
      "src/sample.ts": `export function risky(flagA: boolean, flagB: boolean): number {
  if (flagA && flagB) {
    return 1;
  }
  return 0;
}
`,
      "coverage/coverage-final.json": "{not-json"
    });

    const result = await analyzeProject({
      projectRoot,
      coverageMode: "existing-only",
      stderr: {
        write(chunk: string) {
          warnings.push(chunk);
        }
      }
    });

    expect(result.warnings).toHaveLength(1);
    expect(warnings.join("")).toContain("could not be parsed");
    expect(result.metrics[0]?.coveragePercent).toBeNull();
    expect(result.metrics[0]?.crapScore).toBeNull();
    expect(result.metrics[0]?.coverage.status).toBe("unknown");
    expect(result.metrics[0]?.coverage.unknownReason).toBe("unparseable_report");
  });

  it("reports file-unmatched coverage diagnostics when the report does not contain the analyzed file", async () => {
    const projectRoot = await createTempDir("crap-analysis-");
    tempDirs.push(projectRoot);
    await writeProjectFiles(projectRoot, {
      "package.json": '{"name":"fixture","private":true}',
      "src/sample.ts": `export function risky(flagA: boolean, flagB: boolean): number {
  if (flagA && flagB) {
    return 1;
  }
  return 0;
}
`,
      "coverage/coverage-final.json": JSON.stringify({
        "src/other.ts": {
          path: "src/other.ts",
          statementMap: {},
          fnMap: {},
          branchMap: {},
          s: {},
          f: {},
          b: {}
        }
      })
    });

    const result = await analyzeProject({
      projectRoot,
      coverageMode: "existing-only"
    });

    expect(result.warnings).toEqual([]);
    expect(result.metrics[0]?.coveragePercent).toBeNull();
    expect(result.metrics[0]?.crapScore).toBeNull();
    expect(result.metrics[0]?.coverage.unknownReason).toBe("file_unmatched");
    expect(result.metrics[0]?.statementCoverage.unknownReason).toBe("file_unmatched");
    expect(result.metrics[0]?.branchCoverage.unknownReason).toBe("file_unmatched");
  });

  it("warns and reports fnMap conflicts as unknown coverage", async () => {
    const projectRoot = await createTempDir("crap-analysis-");
    tempDirs.push(projectRoot);
    const warnings: string[] = [];
    await writeProjectFiles(projectRoot, {
      "package.json": '{"name":"fixture","private":true}',
      "src/sample.ts": `export function risky(flagA: boolean, flagB: boolean): number {
  if (flagA && flagB) {
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
          fnMap: {
            "0": {
              name: "risky",
              line: 1,
              loc: {
                start: { line: 1, column: 0 },
                end: { line: 6, column: 1 }
              }
            },
            "1": {
              name: "risky_alt",
              line: 1,
              loc: {
                start: { line: 1, column: 1 },
                end: { line: 6, column: 2 }
              }
            }
          },
          branchMap: {
            "0": {
              line: 2,
              type: "if",
              loc: {
                start: { line: 2, column: 2 },
                end: { line: 4, column: 3 }
              },
              locations: [
                {
                  start: { line: 2, column: 2 },
                  end: { line: 4, column: 3 }
                },
                {}
              ]
            }
          },
          s: {
            "0": 1,
            "1": 1
          },
          f: {},
          b: {
            "0": [1, 1]
          }
        }
      })
    });

    const result = await analyzeProject({
      projectRoot,
      coverageMode: "existing-only",
      stderr: {
        write(chunk: string) {
          warnings.push(chunk);
        }
      }
    });

    expect(result.warnings).toHaveLength(1);
    expect(warnings.join("")).toContain("could not be matched unambiguously");
    expect(result.metrics[0]?.coveragePercent).toBeNull();
    expect(result.metrics[0]?.crapScore).toBeNull();
    expect(result.metrics[0]?.coverage.unknownReason).toBe("fnmap_conflict");
  });
});

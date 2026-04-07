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

    expect(methodCoverage.map((coverage) => coverage && ({
      coverage: Number(coverage.coveragePercent.toFixed(1)),
      statement: coverage.statementCoveragePercent === null ? null : Number(coverage.statementCoveragePercent.toFixed(1)),
      branch: coverage.branchCoveragePercent === null ? null : Number(coverage.branchCoveragePercent.toFixed(1))
    }))).toEqual([
      { coverage: 100.0, statement: 100.0, branch: null },
      { coverage: 50.0, statement: 50.0, branch: 100.0 },
      { coverage: 100.0, statement: 100.0, branch: null }
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
      branches: []
    });

    expect(methodCoverage).toEqual([
      null,
      null,
      null
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
      branches: []
    });
    const byName = new Map(methods.map((method, index) => [method.displayName, methodCoverage[index]]));

    expect(byName.get("empty")).toEqual({
      coveragePercent: 100,
      statementCoveragePercent: null,
      branchCoveragePercent: null
    });
    expect(byName.get("typeOnly")).toEqual({
      coveragePercent: 100,
      statementCoveragePercent: null,
      branchCoveragePercent: null
    });
    expect(byName.get("functionDeclOnly")).toBeNull();
    expect(byName.get("classDeclOnly")).toBeNull();
    expect(byName.get("enumDeclOnly")).toBeNull();
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

    expect(coverageForMethods(methods, [...coverageReport.values()][0])).toEqual([null]);
  });
});

import { afterEach, describe, expect, it } from "vitest";

import { StringWriter, createTempDir, disposeTempDir, writeProjectFiles } from "../../core/test/testUtils";
import { CrapTypescriptVitestReporter } from "../src/index";

const tempDirs: string[] = [];

afterEach(async () => {
  process.exitCode = 0;
  await Promise.all(tempDirs.splice(0).map(disposeTempDir));
});

describe("CrapTypescriptVitestReporter", () => {
  it("prints the no-files message when no analyzable source files are selected", async () => {
    const projectRoot = await createTempDir("crap-vitest-reporter-");
    tempDirs.push(projectRoot);
    await writeProjectFiles(projectRoot, {
      "package.json": '{"name":"fixture","private":true}'
    });

    const stdout = new StringWriter();
    const stderr = new StringWriter();
    const reporter = new CrapTypescriptVitestReporter({
      projectRoot,
      stdout,
      stderr
    });

    await reporter.onFinishedReportCoverage();

    expect(stdout.toString()).toContain("No TypeScript files to analyze.");
    expect(stderr.toString()).toBe("");
    expect(process.exitCode).toBeUndefined();
  });

  it("prints the CRAP report and sets a failure exit code when the threshold is exceeded", async () => {
    const projectRoot = await createTempDir("crap-vitest-reporter-");
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
      "custom-coverage/coverage-final.json": JSON.stringify({
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
            },
            "1": {
              line: 2,
              type: "binary-expr",
              loc: {
                start: { line: 2, column: 6 },
                end: { line: 2, column: 31 }
              },
              locations: [
                {
                  start: { line: 2, column: 6 },
                  end: { line: 2, column: 20 }
                },
                {
                  start: { line: 2, column: 24 },
                  end: { line: 2, column: 29 }
                }
              ]
            }
          },
          s: {
            "0": 0,
            "1": 0
          },
          f: {},
          b: {
            "0": [0, 0],
            "1": [0, 0]
          }
        }
      })
    });

    const stdout = new StringWriter();
    const stderr = new StringWriter();
    const reporter = new CrapTypescriptVitestReporter({
      projectRoot,
      paths: ["src"],
      changedOnly: false,
      packageManager: "npm",
      coverageReportPath: "custom-coverage/coverage-final.json",
      stdout,
      stderr
    });

    await reporter.onFinishedReportCoverage();

    expect(stdout.toString()).toContain("risky");
    expect(stderr.toString()).toContain("CRAP threshold exceeded");
    expect(process.exitCode).toBe(1);
  });
});

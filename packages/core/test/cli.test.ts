import { afterEach, describe, expect, it } from "vitest";

import { parseCliArguments, runCli } from "../src/cli";
import { createTempDir, disposeTempDir, StringWriter, writeProjectFiles } from "./testUtils";

const tempDirs: string[] = [];

afterEach(async () => {
  await Promise.all(tempDirs.splice(0).map(disposeTempDir));
});

describe("cli", () => {
  it("parses supported options", () => {
    expect(parseCliArguments([
      "--changed",
      "--package-manager",
      "npm",
      "--test-runner",
      "karma",
      "--coverage-report-path",
      "coverage/app/coverage-final.json"
    ])).toEqual({
      mode: "changed",
      fileArgs: [],
      packageManager: "npm",
      testRunner: "karma",
      coverageReportPath: "coverage/app/coverage-final.json"
    });
  });

  it("rejects invalid combinations", () => {
    expect(() => parseCliArguments(["--changed", "src/app.ts"])).toThrow("--changed cannot be combined");
  });

  it("parses explicit paths, help mode, and alternate package-manager and test-runner selections", () => {
    expect(parseCliArguments(["packages/core", "--package-manager", "pnpm", "--test-runner", "jest"])).toEqual({
      mode: "explicit",
      fileArgs: ["packages/core"],
      packageManager: "pnpm",
      testRunner: "jest"
    });
    expect(parseCliArguments(["--help", "--package-manager", "yarn"])).toEqual({
      mode: "help",
      fileArgs: [],
      packageManager: "yarn",
      testRunner: "auto"
    });
  });

  it("rejects duplicate, missing, invalid, and unknown options", () => {
    expect(() => parseCliArguments(["--package-manager", "npm", "--package-manager", "pnpm"])).toThrow(
      "--package-manager can only be provided once"
    );
    expect(() => parseCliArguments(["--test-runner", "vitest", "--test-runner", "jest"])).toThrow(
      "--test-runner can only be provided once"
    );
    expect(() => parseCliArguments(["--package-manager"])).toThrow("--package-manager requires one of: auto, npm, pnpm, yarn");
    expect(() => parseCliArguments(["--test-runner"])).toThrow("--test-runner requires one of: auto, vitest, jest, karma");
    expect(() => parseCliArguments(["--coverage-report-path"])).toThrow("--coverage-report-path requires a path");
    expect(() => parseCliArguments(["--package-manager", "bun"])).toThrow(
      "--package-manager requires one of: auto, npm, pnpm, yarn"
    );
    expect(() => parseCliArguments(["--test-runner", "mocha"])).toThrow(
      "--test-runner requires one of: auto, vitest, jest, karma"
    );
    expect(() => parseCliArguments(["--unknown"])).toThrow("Unknown option: --unknown");
  });

  it("prints help", async () => {
    const stdout = new StringWriter();
    const stderr = new StringWriter();

    const exitCode = await runCli(["--help"], process.cwd(), stdout, stderr);

    expect(exitCode).toBe(0);
    expect(stdout.toString()).toContain("Usage:");
    expect(stderr.toString()).toBe("");
  });

  it("prints usage and exits with an error for invalid cli arguments", async () => {
    const stdout = new StringWriter();
    const stderr = new StringWriter();

    const exitCode = await runCli(["--unknown"], process.cwd(), stdout, stderr);

    expect(exitCode).toBe(1);
    expect(stdout.toString()).toContain("Usage:");
    expect(stderr.toString()).toContain("Unknown option: --unknown");
  });

  it("prints a report and exits with threshold failure when CRAP exceeds the threshold", async () => {
    const projectRoot = await createTempDir("crap-cli-");
    tempDirs.push(projectRoot);
    await writeProjectFiles(projectRoot, {
      "package.json": '{"name":"fixture","private":true}',
      "src/sample.ts": `export function safe(value: number): number {
  return value + 1;
}

export function risky(flagA: boolean, flagB: boolean): number {
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
              start: { line: 2, column: 2 },
              end: { line: 2, column: 19 }
            },
            "1": {
              start: { line: 7, column: 4 },
              end: { line: 7, column: 13 }
            },
            "2": {
              start: { line: 9, column: 2 },
              end: { line: 9, column: 11 }
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
            },
            "1": {
              line: 6,
              type: "binary-expr",
              loc: {
                start: { line: 6, column: 6 },
                end: { line: 6, column: 31 }
              },
              locations: [
                {
                  start: { line: 6, column: 6 },
                  end: { line: 6, column: 20 }
                },
                {
                  start: { line: 6, column: 24 },
                  end: { line: 6, column: 29 }
                }
              ]
            }
          },
          s: {
            "0": 1,
            "1": 0,
            "2": 0
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
    const exitCode = await runCli([], projectRoot, stdout, stderr);

    expect(exitCode).toBe(2);
    expect(stdout.toString()).toContain("risky");
    expect(stderr.toString()).toContain("CRAP threshold exceeded");
  });

  it("prints a report and exits cleanly when CRAP stays below the threshold", async () => {
    const projectRoot = await createTempDir("crap-cli-");
    tempDirs.push(projectRoot);
    await writeProjectFiles(projectRoot, {
      "package.json": '{"name":"fixture","private":true}',
      "src/sample.ts": `export function safe(flag: boolean): number {
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

    const stdout = new StringWriter();
    const stderr = new StringWriter();
    const exitCode = await runCli([], projectRoot, stdout, stderr);

    expect(exitCode).toBe(0);
    expect(stdout.toString()).toContain("safe");
    expect(stderr.toString()).toBe("");
  });

  it("uses a custom coverage report path", async () => {
    const projectRoot = await createTempDir("crap-cli-");
    tempDirs.push(projectRoot);
    await writeProjectFiles(projectRoot, {
      "package.json": '{"name":"fixture","private":true}',
      "src/sample.ts": `export function safe(value: number): number {
  return value + 1;
}
`,
      "coverage/app/coverage-final.json": JSON.stringify({
        "src/sample.ts": {
          path: "src/sample.ts",
          statementMap: {
            "0": {
              start: { line: 2, column: 2 },
              end: { line: 2, column: 19 }
            }
          },
          fnMap: {},
          branchMap: {},
          s: {
            "0": 1
          },
          f: {},
          b: {}
        }
      })
    });

    const stdout = new StringWriter();
    const stderr = new StringWriter();
    const exitCode = await runCli(["--coverage-report-path", "coverage/app/coverage-final.json"], projectRoot, stdout, stderr);

    expect(exitCode).toBe(0);
    expect(stdout.toString()).toContain("safe");
    expect(stderr.toString()).toBe("");
  });

  it("prints the no-files message for an empty project", async () => {
    const projectRoot = await createTempDir("crap-cli-");
    tempDirs.push(projectRoot);
    await writeProjectFiles(projectRoot, {
      "package.json": '{"name":"fixture","private":true}'
    });

    const stdout = new StringWriter();
    const stderr = new StringWriter();
    const exitCode = await runCli([], projectRoot, stdout, stderr);

    expect(exitCode).toBe(0);
    expect(stdout.toString()).toContain("No TypeScript files to analyze.");
    expect(stderr.toString()).toBe("");
  });

  it("prints a clear message when selected files contain no analyzable functions", async () => {
    const projectRoot = await createTempDir("crap-cli-");
    tempDirs.push(projectRoot);
    await writeProjectFiles(projectRoot, {
      "package.json": '{"name":"fixture","private":true}',
      "src/types.ts": "export interface Foo { value: number; }\n",
      "coverage/coverage-final.json": "{}"
    });

    const stdout = new StringWriter();
    const stderr = new StringWriter();
    const exitCode = await runCli([], projectRoot, stdout, stderr);

    expect(exitCode).toBe(0);
    expect(stdout.toString()).toContain("No analyzable functions found.");
    expect(stdout.toString()).not.toContain("Function  CC  Coverage  CRAP  Location");
    expect(stderr.toString()).toBe("");
  });

  it("prints analysis errors to stderr and exits with code 1", async () => {
    const projectRoot = await createTempDir("crap-cli-");
    tempDirs.push(projectRoot);
    await writeProjectFiles(projectRoot, {
      "package.json": '{"name":"fixture","private":true}'
    });

    const stdout = new StringWriter();
    const stderr = new StringWriter();
    const exitCode = await runCli(["missing.ts"], projectRoot, stdout, stderr);

    expect(exitCode).toBe(1);
    expect(stdout.toString()).toBe("");
    expect(stderr.toString()).toContain("ENOENT");
  });
});

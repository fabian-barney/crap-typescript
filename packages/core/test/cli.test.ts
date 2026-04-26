import { afterEach, describe, expect, it } from "vitest";

import { parseCliArguments, runCli } from "../src/cli";
import { createTempDir, disposeTempDir, readText, StringWriter, writeProjectFiles } from "./testUtils";

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
      "vitest",
      "--format",
      "json",
      "--agent",
      "--output",
      "reports/crap.json",
      "--junit-report",
      "reports/crap.xml"
    ])).toEqual({
      mode: "changed",
      fileArgs: [],
      packageManager: "npm",
      testRunner: "vitest",
      format: "json",
      agent: true,
      outputPath: "reports/crap.json",
      junitReportPath: "reports/crap.xml"
    });
  });

  it("rejects invalid combinations", () => {
    expect(() => parseCliArguments(["--changed", "src/app.ts"])).toThrow("--changed cannot be combined");
    expect(() => parseCliArguments(["--agent", "--format", "junit"])).toThrow("--agent cannot be combined");
  });

  it("parses explicit paths, help mode, and alternate package-manager and test-runner selections", () => {
    expect(parseCliArguments(["packages/core", "--package-manager", "pnpm", "--test-runner", "jest"])).toEqual({
      mode: "explicit",
      fileArgs: ["packages/core"],
      packageManager: "pnpm",
      testRunner: "jest",
      format: "toon",
      agent: false
    });
    expect(parseCliArguments(["--help", "--package-manager", "yarn"])).toEqual({
      mode: "help",
      fileArgs: [],
      packageManager: "yarn",
      testRunner: "auto",
      format: "toon",
      agent: false
    });
    expect(parseCliArguments(["--help", "--changed", "src/app.ts", "--agent", "--format", "junit"])).toEqual({
      mode: "help",
      fileArgs: [],
      packageManager: "auto",
      testRunner: "auto",
      format: "junit",
      agent: true
    });
  });

  it("rejects duplicate, missing, invalid, and unknown options", () => {
    expect(() => parseCliArguments(["--package-manager", "npm", "--package-manager", "pnpm"])).toThrow(
      "--package-manager can only be provided once"
    );
    expect(() => parseCliArguments(["--test-runner", "vitest", "--test-runner", "jest"])).toThrow(
      "--test-runner can only be provided once"
    );
    expect(() => parseCliArguments(["--format", "toon", "--format", "json"])).toThrow(
      "--format can only be provided once"
    );
    expect(() => parseCliArguments(["--agent", "--agent"])).toThrow("--agent can only be provided once");
    expect(() => parseCliArguments(["--output", "a", "--output", "b"])).toThrow("--output can only be provided once");
    expect(() => parseCliArguments(["--junit-report", "a", "--junit-report", "b"])).toThrow(
      "--junit-report can only be provided once"
    );
    expect(() => parseCliArguments(["--package-manager"])).toThrow("--package-manager requires one of: auto, npm, pnpm, yarn");
    expect(() => parseCliArguments(["--test-runner"])).toThrow("--test-runner requires one of: auto, vitest, jest");
    expect(() => parseCliArguments(["--format"])).toThrow("--format requires one of: toon, json, text, junit");
    expect(() => parseCliArguments(["--output"])).toThrow("--output requires a path");
    expect(() => parseCliArguments(["--junit-report"])).toThrow("--junit-report requires a path");
    expect(() => parseCliArguments(["--package-manager", "bun"])).toThrow(
      "--package-manager requires one of: auto, npm, pnpm, yarn"
    );
    expect(() => parseCliArguments(["--test-runner", "mocha"])).toThrow(
      "--test-runner requires one of: auto, vitest, jest"
    );
    expect(() => parseCliArguments(["--format", "agent"])).toThrow(
      "--format requires one of: toon, json, text, junit"
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
    expect(stdout.toString()).toContain("status: failed");
    expect(stdout.toString()).toContain("methods[2]{status,name,sourcePath,startLine,endLine,complexity,coverageKind,coveragePercent,crapScore,threshold}:");
    expect(stdout.toString()).toContain("risky");
    expect(stderr.toString()).toContain("CRAP threshold exceeded");
  });

  it("filters primary reports in agent mode and writes full JUnit before threshold failure", async () => {
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
    const exitCode = await runCli([
      "--agent",
      "--format",
      "json",
      "--output",
      "reports/crap.json",
      "--junit-report",
      "reports/crap.xml"
    ], projectRoot, stdout, stderr);

    const primary = JSON.parse(await readText(`${projectRoot}/reports/crap.json`)) as {
      status: string;
      methods: Array<Record<string, unknown>>;
    };
    const junit = await readText(`${projectRoot}/reports/crap.xml`);

    expect(exitCode).toBe(2);
    expect(stdout.toString()).toBe("");
    expect(primary.status).toBe("failed");
    expect(primary.methods).toHaveLength(1);
    expect(primary.methods[0].name).toBe("risky");
    expect(primary.methods[0]).not.toHaveProperty("status");
    expect(junit).toContain('tests="2"');
    expect(junit).toContain('name="safe"');
    expect(junit).toContain('name="risky"');
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
    expect(stdout.toString()).toContain("status: passed");
    expect(stdout.toString()).toContain("safe");
    expect(stderr.toString()).toBe("");
  });

  it("prints a passed report for an empty project", async () => {
    const projectRoot = await createTempDir("crap-cli-");
    tempDirs.push(projectRoot);
    await writeProjectFiles(projectRoot, {
      "package.json": '{"name":"fixture","private":true}'
    });

    const stdout = new StringWriter();
    const stderr = new StringWriter();
    const exitCode = await runCli([], projectRoot, stdout, stderr);

    expect(exitCode).toBe(0);
    expect(stdout.toString()).toBe("status: passed\nmethods[0]:\n");
    expect(stderr.toString()).toBe("");
  });

  it("prints a passed report when selected files contain no analyzable functions", async () => {
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
    expect(stdout.toString()).toBe("status: passed\nmethods[0]:\n");
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

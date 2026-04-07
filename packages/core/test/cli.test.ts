import { afterEach, describe, expect, it } from "vitest";

import { parseCliArguments, runCli } from "../src/cli";
import { createTempDir, disposeTempDir, StringWriter, writeProjectFiles } from "./testUtils";

const tempDirs: string[] = [];

afterEach(async () => {
  await Promise.all(tempDirs.splice(0).map(disposeTempDir));
});

describe("cli", () => {
  it("parses supported options", () => {
    expect(parseCliArguments(["--changed", "--package-manager", "npm", "--test-runner", "vitest"])).toEqual({
      mode: "changed",
      fileArgs: [],
      packageManager: "npm",
      testRunner: "vitest"
    });
  });

  it("rejects invalid combinations", () => {
    expect(() => parseCliArguments(["--changed", "src/app.ts"])).toThrow("--changed cannot be combined");
  });

  it("prints help", async () => {
    const stdout = new StringWriter();
    const stderr = new StringWriter();

    const exitCode = await runCli(["--help"], process.cwd(), stdout, stderr);

    expect(exitCode).toBe(0);
    expect(stdout.toString()).toContain("Usage:");
    expect(stderr.toString()).toBe("");
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
});

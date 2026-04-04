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
      "coverage/lcov.info": `TN:
SF:src/sample.ts
DA:1,1
DA:2,1
DA:5,0
DA:6,0
DA:7,0
DA:9,0
end_of_record
`
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
      "coverage/lcov.info": ""
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

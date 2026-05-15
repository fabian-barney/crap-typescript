import { mkdir, symlink } from "node:fs/promises";
import path from "node:path";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import {
  StringWriter,
  createTempDir,
  disposeTempDir,
  mixedCoverageProjectFiles,
  readText,
  writeProjectFiles
} from "../../core/test/testUtils";
import { CrapTypescriptVitestReporter, type CrapTypescriptVitestOptions } from "../src/index";

const tempDirs: string[] = [];
let originalExitCode: number | undefined;

beforeEach(() => {
  originalExitCode = process.exitCode;
});

afterEach(async () => {
  process.exitCode = originalExitCode;
  await Promise.all(tempDirs.splice(0).map(disposeTempDir));
});

async function finishWithOptions(projectRoot: string, options: CrapTypescriptVitestOptions): Promise<{
  stdout: StringWriter;
  stderr: StringWriter;
}> {
  const stdout = new StringWriter();
  const stderr = new StringWriter();
  const reporter = new CrapTypescriptVitestReporter({
    projectRoot,
    stdout,
    stderr,
    ...options
  });

  await reporter.onFinishedReportCoverage();
  return { stdout, stderr };
}

describe("CrapTypescriptVitestReporter", () => {
  it("emits no primary report by default and writes a full JUnit sidecar", async () => {
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

    expect(stdout.toString()).toBe("");
    expect(await readText(`${projectRoot}/coverage/crap-typescript-junit.xml`)).toContain('status="passed"');
    expect(stderr.toString()).toBe("");
    expect(process.exitCode).toBe(originalExitCode);
  });

  it("supports explicit TOON output", async () => {
    const projectRoot = await createTempDir("crap-vitest-reporter-");
    tempDirs.push(projectRoot);
    await writeProjectFiles(projectRoot, {
      "package.json": '{"name":"fixture","private":true}'
    });

    const stdout = new StringWriter();
    const stderr = new StringWriter();
    const reporter = new CrapTypescriptVitestReporter({
      projectRoot,
      format: "toon",
      junit: false,
      stdout,
      stderr
    });

    await reporter.onFinishedReportCoverage();

    expect(stdout.toString()).toBe("status: passed\nthreshold: 8\nmethods[0]:\n");
    expect(stderr.toString()).toBe("");
  });

  it("writes renamed output and JUnit report options with the default empty primary report", async () => {
    const projectRoot = await createTempDir("crap-vitest-reporter-");
    tempDirs.push(projectRoot);
    await writeProjectFiles(projectRoot, {
      "package.json": '{"name":"fixture","private":true}'
    });

    const stdout = new StringWriter();
    const stderr = new StringWriter();
    const reporter = new CrapTypescriptVitestReporter({
      projectRoot,
      output: "reports/crap.txt",
      junitReport: "reports/custom-junit.xml",
      stdout,
      stderr
    });

    await reporter.onFinishedReportCoverage();

    expect(stdout.toString()).toBe("");
    expect(await readText(`${projectRoot}/reports/crap.txt`)).toBe("");
    expect(await readText(`${projectRoot}/reports/custom-junit.xml`)).toContain('status="passed"');
    expect(stderr.toString()).toBe("");
  });

  it("rejects colliding output and JUnit report paths", async () => {
    const projectRoot = await createTempDir("crap-vitest-reporter-");
    tempDirs.push(projectRoot);

    const { stdout, stderr } = await finishWithOptions(projectRoot, {
      output: "reports/crap.xml",
      junitReport: "reports/crap.xml"
    });

    expect(stdout.toString()).toBe("");
    expect(stderr.toString()).toContain("output and junitReport must target different report files");
    expect(process.exitCode).toBe(1);
  });

  it("rejects directory, root, and aliased report paths", async () => {
    const projectRoot = await createTempDir("crap-vitest-reporter-");
    tempDirs.push(projectRoot);
    await mkdir(path.join(projectRoot, "reports"));
    await mkdir(path.join(projectRoot, "real-reports"));
    await symlink(path.join(projectRoot, "real-reports"), path.join(projectRoot, "linked-reports"), "junction");

    const directoryTarget = await finishWithOptions(projectRoot, {
      output: "reports",
      junit: false
    });
    const rootTarget = await finishWithOptions(projectRoot, {
      output: path.parse(projectRoot).root,
      junit: false
    });
    const aliasTarget = await finishWithOptions(projectRoot, {
      output: "real-reports/crap.xml",
      junitReport: "linked-reports/crap.xml"
    });

    expect(directoryTarget.stderr.toString()).toContain("output must target a report file, not an existing directory");
    expect(rootTarget.stderr.toString()).toContain("output must target a report file, not a filesystem root");
    expect(aliasTarget.stderr.toString()).toContain("output and junitReport must target different report files");
    expect(process.exitCode).toBe(1);
  });


  it("honors custom thresholds and emits threshold warnings", async () => {
    const projectRoot = await createTempDir("crap-vitest-reporter-");
    tempDirs.push(projectRoot);
    await writeProjectFiles(projectRoot, {
      "package.json": '{"name":"fixture","private":true}'
    });

    const stdout = new StringWriter();
    const stderr = new StringWriter();
    const reporter = new CrapTypescriptVitestReporter({
      projectRoot,
      threshold: 9,
      format: "text",
      stdout,
      stderr
    });

    await reporter.onFinishedReportCoverage();

    expect(stdout.toString()).toBe("status: passed\nthreshold: 9.0\n");
    expect(await readText(`${projectRoot}/coverage/crap-typescript-junit.xml`)).toContain('<property name="threshold" value="9.0"/>');
    expect(stderr.toString()).toContain("CRAP threshold above 8.0 is too lenient");
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
      format: "text",
      stdout,
      stderr
    });

    await reporter.onFinishedReportCoverage();

    const junit = await readText(`${projectRoot}/custom-coverage/crap-typescript-junit.xml`);

    expect(stdout.toString()).toContain("status: failed");
    expect(stdout.toString()).toContain("threshold: 8.0");
    expect(stdout.toString()).toContain("| status |");
    expect(stdout.toString()).toContain("risky");
    expect(junit).toContain('tests="1"');
    expect(junit).toContain("<failure");
    expect(stderr.toString()).toContain("CRAP threshold exceeded");
    expect(process.exitCode).toBe(1);
  });

  it("applies primary report controls without reducing the JUnit sidecar", async () => {
    const projectRoot = await createTempDir("crap-vitest-reporter-");
    tempDirs.push(projectRoot);
    await writeProjectFiles(projectRoot, {
      "package.json": '{"name":"fixture","private":true}',
      ...mixedCoverageProjectFiles()
    });

    const stdout = new StringWriter();
    const stderr = new StringWriter();
    const reporter = new CrapTypescriptVitestReporter({
      projectRoot,
      paths: ["src"],
      changedOnly: false,
      packageManager: "npm",
      format: "json",
      failuresOnly: true,
      omitRedundancy: true,
      stdout,
      stderr
    });

    await reporter.onFinishedReportCoverage();

    const primary = JSON.parse(stdout.toString()) as {
      status: string;
      methods: Array<Record<string, unknown>>;
    };
    const junit = await readText(`${projectRoot}/coverage/crap-typescript-junit.xml`);

    expect(primary.status).toBe("failed");
    expect(primary.methods).toEqual([
      expect.objectContaining({
        method: "risky"
      })
    ]);
    expect(primary.methods[0]).not.toHaveProperty("status");
    expect(junit).toContain('tests="2"');
    expect(junit).toContain('name="safe:1"');
    expect(junit).toContain('name="risky:5"');
    expect(junit).toContain('<property name="status" value="passed"/>');
    expect(junit).toContain('<property name="status" value="failed"/>');
    expect(stderr.toString()).toContain("CRAP threshold exceeded");
    expect(process.exitCode).toBe(1);
  });

  it("supports agent defaults and disabled JUnit output", async () => {
    const projectRoot = await createTempDir("crap-vitest-reporter-");
    tempDirs.push(projectRoot);
    await writeProjectFiles(projectRoot, {
      "package.json": '{"name":"fixture","private":true}',
      "src/sample.ts": `export function safe(value: number): number {
  return value + 1;
}
`,
      "coverage/coverage-final.json": JSON.stringify({
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
    const reporter = new CrapTypescriptVitestReporter({
      projectRoot,
      agent: true,
      junit: false,
      stdout,
      stderr
    });

    await reporter.onFinishedReportCoverage();

    expect(stdout.toString()).toBe("status: passed\nthreshold: 8\nmethods[0]:\n");
    await expect(readText(`${projectRoot}/coverage/crap-typescript-junit.xml`)).rejects.toThrow();
    expect(stderr.toString()).toBe("");
  });

  it("allows agent with an explicit JUnit primary format", async () => {
    const projectRoot = await createTempDir("crap-vitest-reporter-");
    tempDirs.push(projectRoot);
    await writeProjectFiles(projectRoot, {
      "package.json": '{"name":"fixture","private":true}',
      "src/sample.ts": `export function safe(value: number): number {
  return value + 1;
}
`,
      "coverage/coverage-final.json": JSON.stringify({
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
    const reporter = new CrapTypescriptVitestReporter({
      projectRoot,
      format: "junit",
      agent: true,
      junit: false,
      stdout,
      stderr
    });

    await expect(reporter.onFinishedReportCoverage()).resolves.toBeUndefined();

    expect(stdout.toString()).toContain('<testsuite name="crap-typescript" status="passed" tests="0" failures="0" skipped="0" errors="0" time="0">');
    expect(stdout.toString()).not.toContain('<property name="status"');
    expect(stderr.toString()).toBe("");
    expect(process.exitCode).toBe(originalExitCode);
  });
});

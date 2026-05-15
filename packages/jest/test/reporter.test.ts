import path from "node:path";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  StringWriter,
  createTempDir,
  disposeTempDir,
  mixedCoverageProjectFiles,
  readText,
  writeProjectFiles
} from "../../core/test/testUtils";
import CrapTypescriptJestReporter from "../src/reporter";

const tempDirs: string[] = [];
let originalExitCode: number | undefined;

beforeEach(() => {
  originalExitCode = process.exitCode;
});

afterEach(async () => {
  vi.restoreAllMocks();
  process.exitCode = originalExitCode;
  await Promise.all(tempDirs.splice(0).map(disposeTempDir));
});

async function callFinalize(reporter: CrapTypescriptJestReporter): Promise<void> {
  await (reporter as unknown as { finalize: () => Promise<void> }).finalize();
}

describe("CrapTypescriptJestReporter", () => {
  it("schedules finalization only once", async () => {
    const reporter = new CrapTypescriptJestReporter();
    const finalize = vi.fn<() => Promise<void>>().mockResolvedValue(undefined);
    const callbacks: Array<() => void> = [];

    (reporter as unknown as { finalize: () => Promise<void> }).finalize = finalize;
    vi.spyOn(process, "once").mockImplementation(((event: string | symbol, listener: () => void) => {
      if (event === "beforeExit") {
        callbacks.push(listener);
      }
      return process;
    }) as typeof process.once);

    reporter.onRunComplete();
    reporter.onRunComplete();

    expect(callbacks).toHaveLength(1);
    callbacks[0]();
    await Promise.resolve();

    expect(finalize).toHaveBeenCalledTimes(1);
  });

  it("emits no primary report by default and writes a full JUnit sidecar", async () => {
    const projectRoot = await createTempDir("crap-jest-reporter-");
    tempDirs.push(projectRoot);
    await writeProjectFiles(projectRoot, {
      "package.json": '{"name":"fixture","private":true}',
      "coverage/coverage-final.json": "{}"
    });

    const stdout = new StringWriter();
    const stderr = new StringWriter();
    const reporter = new CrapTypescriptJestReporter(undefined, {
      projectRoot,
      stdout,
      stderr
    });

    await callFinalize(reporter);

    expect(stdout.toString()).toBe("");
    expect(await readText(`${projectRoot}/coverage/crap-typescript-junit.xml`)).toContain('status="passed"');
    expect(stderr.toString()).toBe("");
    expect(reporter.getLastError()).toBeUndefined();
    expect(process.exitCode).toBe(originalExitCode);
  });

  it("supports explicit TOON output", async () => {
    const projectRoot = await createTempDir("crap-jest-reporter-");
    tempDirs.push(projectRoot);
    await writeProjectFiles(projectRoot, {
      "package.json": '{"name":"fixture","private":true}',
      "coverage/coverage-final.json": "{}"
    });

    const stdout = new StringWriter();
    const stderr = new StringWriter();
    const reporter = new CrapTypescriptJestReporter(undefined, {
      projectRoot,
      format: "toon",
      junit: false,
      stdout,
      stderr
    });

    await callFinalize(reporter);

    expect(stdout.toString()).toBe("status: passed\nthreshold: 8\nmethods[0]:\n");
    expect(stderr.toString()).toBe("");
  });

  it("writes renamed output and JUnit report options with the default empty primary report", async () => {
    const projectRoot = await createTempDir("crap-jest-reporter-");
    tempDirs.push(projectRoot);
    await writeProjectFiles(projectRoot, {
      "package.json": '{"name":"fixture","private":true}',
      "coverage/coverage-final.json": "{}"
    });

    const stdout = new StringWriter();
    const stderr = new StringWriter();
    const reporter = new CrapTypescriptJestReporter(undefined, {
      projectRoot,
      output: "reports/crap.txt",
      junitReport: "reports/custom-junit.xml",
      stdout,
      stderr
    });

    await callFinalize(reporter);

    expect(stdout.toString()).toBe("");
    expect(await readText(`${projectRoot}/reports/crap.txt`)).toBe("");
    expect(await readText(`${projectRoot}/reports/custom-junit.xml`)).toContain('status="passed"');
    expect(stderr.toString()).toBe("");
  });

  it("rejects colliding output and JUnit report paths", async () => {
    const projectRoot = await createTempDir("crap-jest-reporter-");
    tempDirs.push(projectRoot);

    const stdout = new StringWriter();
    const stderr = new StringWriter();
    const reporter = new CrapTypescriptJestReporter(undefined, {
      projectRoot,
      output: "reports/crap.xml",
      junitReport: "reports/crap.xml",
      stdout,
      stderr
    });

    await callFinalize(reporter);

    expect(stdout.toString()).toBe("");
    expect(stderr.toString()).toContain("output and junitReport must target different report files");
    expect(reporter.getLastError()?.message).toContain("output and junitReport must target different report files");
    expect(process.exitCode).toBe(1);
  });

  it("honors custom thresholds and emits threshold warnings", async () => {
    const projectRoot = await createTempDir("crap-jest-reporter-");
    tempDirs.push(projectRoot);
    await writeProjectFiles(projectRoot, {
      "package.json": '{"name":"fixture","private":true}',
      "coverage/coverage-final.json": "{}"
    });

    const stdout = new StringWriter();
    const stderr = new StringWriter();
    const reporter = new CrapTypescriptJestReporter(undefined, {
      projectRoot,
      threshold: 9,
      format: "text",
      stdout,
      stderr
    });

    await callFinalize(reporter);

    expect(stdout.toString()).toBe("status: passed\nthreshold: 9.0\n");
    expect(await readText(`${projectRoot}/coverage/crap-typescript-junit.xml`)).toContain('<property name="threshold" value="9.0"/>');
    expect(stderr.toString()).toContain("CRAP threshold above 8.0 is too lenient");
  });

  it("prints the CRAP report and stores the threshold error for an absolute coverage path", async () => {
    const projectRoot = await createTempDir("crap-jest-reporter-");
    tempDirs.push(projectRoot);
    const coverageReportPath = path.join(projectRoot, "custom-coverage", "coverage-final.json");
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
    const reporter = new CrapTypescriptJestReporter(undefined, {
      projectRoot,
      paths: ["src"],
      changedOnly: false,
      packageManager: "npm",
      coverageReportPath,
      format: "text",
      stdout,
      stderr
    });

    await callFinalize(reporter);

    const junit = await readText(`${projectRoot}/custom-coverage/crap-typescript-junit.xml`);

    expect(stdout.toString()).toContain("status: failed");
    expect(stdout.toString()).toContain("threshold: 8.0");
    expect(stdout.toString()).toContain("| status |");
    expect(stdout.toString()).toContain("risky");
    expect(junit).toContain('tests="1"');
    expect(junit).toContain("<failure");
    expect(stderr.toString()).toContain("CRAP threshold exceeded");
    expect(reporter.getLastError()).toBeInstanceOf(Error);
    expect(reporter.getLastError()?.message).toContain("CRAP threshold exceeded");
    expect(process.exitCode).toBe(1);
  });

  it("applies primary report controls without reducing the JUnit sidecar", async () => {
    const projectRoot = await createTempDir("crap-jest-reporter-");
    tempDirs.push(projectRoot);
    await writeProjectFiles(projectRoot, {
      "package.json": '{"name":"fixture","private":true}',
      ...mixedCoverageProjectFiles()
    });

    const stdout = new StringWriter();
    const stderr = new StringWriter();
    const reporter = new CrapTypescriptJestReporter(undefined, {
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

    await callFinalize(reporter);

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
    const projectRoot = await createTempDir("crap-jest-reporter-");
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
    const reporter = new CrapTypescriptJestReporter(undefined, {
      projectRoot,
      agent: true,
      junit: false,
      stdout,
      stderr
    });

    await callFinalize(reporter);

    expect(stdout.toString()).toBe("status: passed\nthreshold: 8\nmethods[0]:\n");
    await expect(readText(`${projectRoot}/coverage/crap-typescript-junit.xml`)).rejects.toThrow();
    expect(stderr.toString()).toBe("");
    expect(reporter.getLastError()).toBeUndefined();
  });
});

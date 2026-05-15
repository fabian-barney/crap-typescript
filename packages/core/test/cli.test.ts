import { mkdir, symlink } from "node:fs/promises";
import path from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { parseCliArguments, runCli } from "../src/cli";
import { createTempDir, disposeTempDir, readText, StringWriter, writeProjectFiles } from "./testUtils";

const tempDirs: string[] = [];

afterEach(async () => {
  await Promise.all(tempDirs.splice(0).map(disposeTempDir));
});

async function runPathValidation(args: string[], projectRoot: string): Promise<{
  exitCode: number;
  stdout: string;
  stderr: string;
}> {
  const stdout = new StringWriter();
  const stderr = new StringWriter();
  const exitCode = await runCli(args, projectRoot, stdout, stderr);
  return {
    exitCode,
    stdout: stdout.toString(),
    stderr: stderr.toString()
  };
}

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
      "--failures-only=false",
      "--output",
      "reports/crap.json",
      "--junit-report",
      "reports/crap.xml",
      "--exclude",
      "src/generated/**",
      "--exclude",
      "**/*.pb.ts",
      "--exclude-path-regex",
      "^src/proto/",
      "--exclude-generated-marker",
      "@custom-generated",
      "--use-default-exclusions=false"
    ])).toEqual({
      mode: "changed",
      fileArgs: [],
      packageManager: "npm",
      testRunner: "vitest",
      format: "json",
      threshold: 8,
      agent: true,
      failuresOnly: false,
      omitRedundancy: true,
      output: "reports/crap.json",
      junit: true,
      junitReport: "reports/crap.xml",
      excludes: ["src/generated/**", "**/*.pb.ts"],
      excludePathRegexes: ["^src/proto/"],
      excludeGeneratedMarkers: ["@custom-generated"],
      useDefaultExclusions: false
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
      testRunner: "jest",
      format: "toon",
      threshold: 8,
      agent: false,
      failuresOnly: false,
      omitRedundancy: false,
      junit: false
    });
    expect(parseCliArguments(["--help", "--package-manager", "yarn"])).toEqual({
      mode: "help",
      fileArgs: [],
      packageManager: "yarn",
      testRunner: "auto",
      format: "toon",
      threshold: 8,
      agent: false,
      failuresOnly: false,
      omitRedundancy: false,
      junit: false
    });
    expect(parseCliArguments(["--help", "--changed", "src/app.ts", "--agent", "--format", "junit"])).toEqual({
      mode: "help",
      fileArgs: [],
      packageManager: "auto",
      testRunner: "auto",
      format: "junit",
      threshold: 8,
      agent: true,
      failuresOnly: true,
      omitRedundancy: true,
      junit: false
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
    expect(() => parseCliArguments(["--threshold", "6", "--threshold", "8"])).toThrow(
      "--threshold can only be provided once"
    );
    expect(() => parseCliArguments(["--agent", "--agent"])).toThrow("--agent can only be provided once");
    expect(() => parseCliArguments(["--failures-only", "--failures-only=false"])).toThrow(
      "--failures-only can only be provided once"
    );
    expect(() => parseCliArguments(["--omit-redundancy", "--omit-redundancy=false"])).toThrow(
      "--omit-redundancy can only be provided once"
    );
    expect(() => parseCliArguments(["--output", "a", "--output", "b"])).toThrow("--output can only be provided once");
    expect(() => parseCliArguments(["--junit-report", "a", "--junit-report", "b"])).toThrow(
      "--junit-report can only be provided once"
    );
    expect(() => parseCliArguments(["--use-default-exclusions", "--use-default-exclusions=false"])).toThrow(
      "--use-default-exclusions can only be provided once"
    );
    expect(() => parseCliArguments(["--package-manager"])).toThrow("--package-manager requires one of: auto, npm, pnpm, yarn");
    expect(() => parseCliArguments(["--test-runner"])).toThrow("--test-runner requires one of: auto, vitest, jest");
    expect(() => parseCliArguments(["--format"])).toThrow("--format requires one of: toon, json, text, junit, none");
    expect(() => parseCliArguments(["--threshold"])).toThrow("--threshold requires a finite number greater than 0");
    expect(() => parseCliArguments(["--output"])).toThrow("--output requires a path");
    expect(() => parseCliArguments(["--junit-report"])).toThrow("--junit-report requires a path");
    expect(() => parseCliArguments(["--exclude"])).toThrow("--exclude requires a path");
    expect(() => parseCliArguments(["--exclude-path-regex"])).toThrow("--exclude-path-regex requires a path");
    expect(() => parseCliArguments(["--exclude-generated-marker"])).toThrow("--exclude-generated-marker requires a path");
    expect(() => parseCliArguments(["--package-manager", "bun"])).toThrow(
      "--package-manager requires one of: auto, npm, pnpm, yarn"
    );
    expect(() => parseCliArguments(["--test-runner", "mocha"])).toThrow(
      "--test-runner requires one of: auto, vitest, jest"
    );
    expect(() => parseCliArguments(["--format", "agent"])).toThrow(
      "--format requires one of: toon, json, text, junit, none"
    );
    expect(() => parseCliArguments(["--threshold", "0"])).toThrow("--threshold requires a finite number greater than 0");
    expect(() => parseCliArguments(["--threshold", "-1"])).toThrow("--threshold requires a finite number greater than 0");
    expect(() => parseCliArguments(["--threshold", "NaN"])).toThrow("--threshold requires a finite number greater than 0");
    expect(() => parseCliArguments(["--threshold", "Infinity"])).toThrow("--threshold requires a finite number greater than 0");
    expect(() => parseCliArguments(["--failures-only=maybe"])).toThrow(
      "--failures-only requires true or false when a value is provided"
    );
    expect(() => parseCliArguments(["--omit-redundancy=maybe"])).toThrow(
      "--omit-redundancy requires true or false when a value is provided"
    );
    expect(() => parseCliArguments(["--use-default-exclusions=maybe"])).toThrow(
      "--use-default-exclusions requires true or false when a value is provided"
    );
    expect(() => parseCliArguments(["--unknown"])).toThrow("Unknown option: --unknown");
  });

  it("parses custom thresholds", () => {
    expect(parseCliArguments(["--threshold", "6", "--changed"])).toMatchObject({
      mode: "changed",
      threshold: 6
    });
  });

  it("parses none as a report format", () => {
    expect(parseCliArguments(["--format", "none"])).toMatchObject({
      format: "none"
    });
  });

  it("parses failures-only boolean syntax", () => {
    expect(parseCliArguments(["--failures-only"])).toMatchObject({
      failuresOnly: true
    });
    expect(parseCliArguments(["--failures-only=true"])).toMatchObject({
      failuresOnly: true
    });
    expect(parseCliArguments(["--failures-only=false"])).toMatchObject({
      failuresOnly: false
    });
  });

  it("parses omit-redundancy boolean syntax", () => {
    expect(parseCliArguments(["--omit-redundancy"])).toMatchObject({
      omitRedundancy: true
    });
    expect(parseCliArguments(["--omit-redundancy=true"])).toMatchObject({
      omitRedundancy: true
    });
    expect(parseCliArguments(["--omit-redundancy=false"])).toMatchObject({
      omitRedundancy: false
    });
  });

  it("rejects identical primary and JUnit report paths", async () => {
    const projectRoot = await createTempDir("crap-cli-");
    tempDirs.push(projectRoot);
    const result = await runPathValidation([
      "--format",
      "none",
      "--output",
      "reports/crap.xml",
      "--junit-report",
      "reports/crap.xml"
    ], projectRoot);

    expect(result.exitCode).toBe(1);
    expect(result.stderr).toContain("--output and --junit-report must target different report files");
  });

  it("rejects realpath aliases for primary and JUnit report paths", async () => {
    const projectRoot = await createTempDir("crap-cli-");
    tempDirs.push(projectRoot);
    await mkdir(path.join(projectRoot, "real-reports"));
    await symlink(path.join(projectRoot, "real-reports"), path.join(projectRoot, "linked-reports"), "junction");

    const result = await runPathValidation([
      "--format",
      "none",
      "--output",
      "real-reports/crap.xml",
      "--junit-report",
      "linked-reports/crap.xml"
    ], projectRoot);

    expect(result.exitCode).toBe(1);
    expect(result.stderr).toContain("--output and --junit-report must target different report files");
  });

  if (process.platform === "win32") {
    it("rejects case-insensitive report path collisions on Windows", async () => {
      const projectRoot = await createTempDir("crap-cli-");
      tempDirs.push(projectRoot);
      const result = await runPathValidation([
        "--format",
        "none",
        "--output",
        "reports/CRAP.xml",
        "--junit-report",
        "reports/crap.xml"
      ], projectRoot);

      expect(result.exitCode).toBe(1);
      expect(result.stderr).toContain("--output and --junit-report must target different report files");
    });

    it("rejects case-insensitive absolute report path collisions outside the project root on Windows", async () => {
      const projectRoot = await createTempDir("crap-cli-");
      const reportRoot = await createTempDir("crap-reports-");
      tempDirs.push(projectRoot, reportRoot);
      const result = await runPathValidation([
        "--format",
        "none",
        "--output",
        path.join(reportRoot, "CRAP.xml"),
        "--junit-report",
        path.join(reportRoot, "crap.xml")
      ], projectRoot);

      expect(result.exitCode).toBe(1);
      expect(result.stderr).toContain("--output and --junit-report must target different report files");
    });
  }

  it("rejects existing directory report targets", async () => {
    const projectRoot = await createTempDir("crap-cli-");
    tempDirs.push(projectRoot);
    await mkdir(path.join(projectRoot, "reports"));
    const result = await runPathValidation([
      "--format",
      "none",
      "--output",
      "reports"
    ], projectRoot);

    expect(result.exitCode).toBe(1);
    expect(result.stderr).toContain("--output must target a report file, not an existing directory");
  });

  it("rejects symlinked directory report targets", async () => {
    const projectRoot = await createTempDir("crap-cli-");
    tempDirs.push(projectRoot);
    await mkdir(path.join(projectRoot, "reports"));
    await symlink(path.join(projectRoot, "reports"), path.join(projectRoot, "linked-reports"), "junction");

    const result = await runPathValidation([
      "--format",
      "none",
      "--output",
      "linked-reports"
    ], projectRoot);

    expect(result.exitCode).toBe(1);
    expect(result.stderr).toContain("--output must target a report file, not an existing directory");
  });

  it("rejects filesystem root report targets", async () => {
    const projectRoot = await createTempDir("crap-cli-");
    tempDirs.push(projectRoot);
    const result = await runPathValidation([
      "--format",
      "none",
      "--output",
      path.parse(projectRoot).root
    ], projectRoot);

    expect(result.exitCode).toBe(1);
    expect(result.stderr).toContain("--output must target a report file, not a filesystem root");
  });

  it("applies agent composite defaults and explicit overrides", () => {
    expect(parseCliArguments(["--agent"])).toMatchObject({
      format: "toon",
      agent: true,
      failuresOnly: true,
      omitRedundancy: true
    });
    expect(parseCliArguments(["--agent", "--format", "text"])).toMatchObject({
      format: "text",
      failuresOnly: true,
      omitRedundancy: true
    });
    expect(parseCliArguments(["--format", "junit", "--agent"])).toMatchObject({
      format: "junit",
      failuresOnly: true,
      omitRedundancy: true
    });
    expect(parseCliArguments(["--agent", "--failures-only=false", "--omit-redundancy=false"])).toMatchObject({
      format: "toon",
      failuresOnly: false,
      omitRedundancy: false
    });
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
      "src/generated/client.ts": "export function generatedClient(): number { return 1; }\n",
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
    expect(stdout.toString()).toContain("threshold: 8");
    expect(stdout.toString()).toContain("methods[2]{status,crap,cc,cov,covKind,method,src,lineStart,lineEnd}:");
    expect(stdout.toString()).toContain("risky");
    expect(stderr.toString()).toContain("CRAP threshold exceeded");
  });

  it("prints the revised text table when requested", async () => {
    const projectRoot = await createTempDir("crap-cli-");
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
    const exitCode = await runCli(["--format", "text"], projectRoot, stdout, stderr);
    const tableLines = stdout.toString().split("\n").filter((line) => line.startsWith("|"));
    const pipePositions = tableLines.map((line) =>
      [...line].flatMap((char, index) => char === "|" ? [index] : [])
    );

    expect(exitCode).toBe(0);
    expect(stdout.toString()).toContain("status: passed");
    expect(stdout.toString()).toContain("threshold: 8");
    expect(tableLines[0]).toBe("| status | crap | cc |    cov | covKind | method | src           | lineStart | lineEnd |");
    expect(new Set(pipePositions.map((positions) => positions.join(","))).size).toBe(1);
    expect(stderr.toString()).toBe("");
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
      "src/generated/client.ts": "export function generatedClient(): number { return 1; }\n",
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
      threshold: number;
      methods: Array<Record<string, unknown>>;
    };
    const junit = await readText(`${projectRoot}/reports/crap.xml`);

    expect(exitCode).toBe(2);
    expect(stdout.toString()).toBe("");
    expect(primary.status).toBe("failed");
    expect(primary.threshold).toBe(8);
    expect(primary.methods).toHaveLength(1);
    expect(primary.methods[0].method).toBe("risky");
    expect(primary.methods[0]).not.toHaveProperty("status");
    expect(primary.methods[0]).not.toHaveProperty("threshold");
    expect(primary).not.toHaveProperty("sourceExclusions");
    expect(junit).toContain('tests="2"');
    expect(junit).toContain('name="safe:1"');
    expect(junit).toContain('name="risky:5"');
    expect(junit).toContain('name="sourceExclusions.candidateFiles" value="2"');
    expect(stderr.toString()).toContain("CRAP threshold exceeded");

    const overrideStdout = new StringWriter();
    const overrideStderr = new StringWriter();
    const overrideExitCode = await runCli([
      "--agent",
      "--format",
      "json",
      "--failures-only=false",
      "--omit-redundancy=false",
      "--output",
      "reports/full.json"
    ], projectRoot, overrideStdout, overrideStderr);
    const fullPrimary = JSON.parse(await readText(`${projectRoot}/reports/full.json`)) as {
      methods: Array<Record<string, unknown>>;
    };

    expect(overrideExitCode).toBe(2);
    expect(overrideStdout.toString()).toBe("");
    expect(fullPrimary.methods).toHaveLength(2);
    expect(fullPrimary.methods[0]).toMatchObject({
      method: "risky",
      status: "failed"
    });
    expect(fullPrimary.methods[1]).toMatchObject({
      method: "safe",
      status: "passed"
    });
    expect(fullPrimary).toHaveProperty("sourceExclusions");
    expect(overrideStderr.toString()).toContain("CRAP threshold exceeded");
  });

  it("filters failures-only primary reports and writes full JUnit sidecars", async () => {
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
      "--failures-only",
      "--format",
      "json",
      "--output",
      "reports/crap.json",
      "--junit-report",
      "reports/crap.xml"
    ], projectRoot, stdout, stderr);

    const primary = JSON.parse(await readText(`${projectRoot}/reports/crap.json`)) as {
      status: string;
      threshold: number;
      methods: Array<Record<string, unknown>>;
    };
    const junit = await readText(`${projectRoot}/reports/crap.xml`);

    expect(exitCode).toBe(2);
    expect(stdout.toString()).toBe("");
    expect(primary.status).toBe("failed");
    expect(primary.threshold).toBe(8);
    expect(primary.methods).toHaveLength(1);
    expect(primary.methods[0]).toMatchObject({
      status: "failed",
      method: "risky"
    });
    expect(junit).toContain('tests="2"');
    expect(junit).toContain('name="safe:1"');
    expect(junit).toContain('name="risky:5"');
    expect(stderr.toString()).toContain("CRAP threshold exceeded");
  });

  it("omits redundant primary status fields and writes full JUnit sidecars", async () => {
    const projectRoot = await createTempDir("crap-cli-");
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
    const exitCode = await runCli([
      "--omit-redundancy",
      "--format",
      "json",
      "--output",
      "reports/crap.json",
      "--junit-report",
      "reports/crap.xml"
    ], projectRoot, stdout, stderr);

    const primary = JSON.parse(await readText(`${projectRoot}/reports/crap.json`)) as {
      status: string;
      threshold: number;
      methods: Array<Record<string, unknown>>;
    };
    const junit = await readText(`${projectRoot}/reports/crap.xml`);

    expect(exitCode).toBe(0);
    expect(stdout.toString()).toBe("");
    expect(primary.status).toBe("passed");
    expect(primary.threshold).toBe(8);
    expect(primary.methods).toHaveLength(1);
    expect(primary.methods[0]).not.toHaveProperty("status");
    expect(primary.methods[0]).toMatchObject({
      method: "safe"
    });
    expect(junit).toContain('tests="1"');
    expect(junit).toContain('name="safe:1"');
    expect(junit).toContain('<property name="status" value="passed"/>');
    expect(stderr.toString()).toBe("");
  });

  it("omits redundant status from primary JUnit reports and writes full JUnit sidecars", async () => {
    const projectRoot = await createTempDir("crap-cli-");
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
    const exitCode = await runCli([
      "--omit-redundancy",
      "--format",
      "junit",
      "--output",
      "reports/primary.xml",
      "--junit-report",
      "reports/sidecar.xml"
    ], projectRoot, stdout, stderr);

    const primary = await readText(`${projectRoot}/reports/primary.xml`);
    const sidecar = await readText(`${projectRoot}/reports/sidecar.xml`);

    expect(exitCode).toBe(0);
    expect(stdout.toString()).toBe("");
    expect(primary).toContain('tests="1"');
    expect(primary).toContain('name="safe:1"');
    expect(primary).not.toContain('<property name="status"');
    expect(sidecar).toContain('tests="1"');
    expect(sidecar).toContain('name="safe:1"');
    expect(sidecar).toContain('<property name="status" value="passed"/>');
    expect(stderr.toString()).toBe("");
  });

  it("writes empty primary files for none reports and keeps full JUnit sidecars", async () => {
    const projectRoot = await createTempDir("crap-cli-");
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
    const exitCode = await runCli([
      "--format",
      "none",
      "--output",
      "reports/primary.txt",
      "--junit-report",
      "reports/sidecar.xml"
    ], projectRoot, stdout, stderr);

    const primary = await readText(`${projectRoot}/reports/primary.txt`);
    const sidecar = await readText(`${projectRoot}/reports/sidecar.xml`);

    expect(exitCode).toBe(0);
    expect(stdout.toString()).toBe("");
    expect(primary).toBe("");
    expect(sidecar).toContain('tests="1"');
    expect(sidecar).toContain('name="safe:1"');
    expect(sidecar).toContain('<property name="status" value="passed"/>');
    expect(stderr.toString()).toBe("");
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
    expect(stdout.toString()).toContain("threshold: 8");
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
    expect(stdout.toString()).toBe("status: passed\nthreshold: 8\nmethods[0]:\n");
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
    expect(stdout.toString()).toBe("status: passed\nthreshold: 8\nmethods[0]:\n");
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

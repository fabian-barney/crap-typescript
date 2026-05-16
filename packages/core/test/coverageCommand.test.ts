import path from "node:path";

import { afterEach, describe, expect, it, vi } from "vitest";

import { ensureCoverageReport, expectedCoveragePath } from "../src/coverage";
import type { CoverageCommand } from "../src/types";
import { createTempDir, disposeTempDir, writeProjectFiles } from "./testUtils";

const tempDirs: string[] = [];

afterEach(async () => {
  await Promise.all(tempDirs.splice(0).map(disposeTempDir));
});

describe("ensureCoverageReport", () => {
  it("returns an existing coverage report without executing a command", async () => {
    const projectRoot = await createTempDir("crap-coverage-command-");
    tempDirs.push(projectRoot);
    const moduleRoot = path.join(projectRoot, "packages", "demo");
    const executor = {
      execute: vi.fn<(_: CoverageCommand) => Promise<number>>()
    };

    await writeProjectFiles(projectRoot, {
      "package.json": '{"name":"root","private":true}',
      "packages/demo/package.json": '{"name":"demo","private":true}',
      "packages/demo/coverage/coverage-final.json": "{}"
    });

    await expect(
      ensureCoverageReport(projectRoot, moduleRoot, "auto", "auto", "auto", undefined, executor)
    ).resolves.toEqual({
      coverageSourcePath: path.join(moduleRoot, "coverage", "coverage-final.json"),
      coverageSourceRoot: moduleRoot,
      command: null
    });
    expect(executor.execute).not.toHaveBeenCalled();
  });

  it("returns null coverage in existing-only mode when no report is present", async () => {
    const projectRoot = await createTempDir("crap-coverage-command-");
    tempDirs.push(projectRoot);
    const moduleRoot = path.join(projectRoot, "packages", "demo");

    await writeProjectFiles(projectRoot, {
      "package.json": '{"name":"root","private":true}',
      "packages/demo/package.json": '{"name":"demo","private":true}'
    });

    await expect(
      ensureCoverageReport(projectRoot, moduleRoot, "auto", "auto", "existing-only", undefined, {
        execute: vi.fn<(_: CoverageCommand) => Promise<number>>()
      })
    ).resolves.toEqual({
      coverageSourcePath: null,
      coverageSourceRoot: null,
      command: null
    });
  });

  it("executes the detected coverage command and returns the generated report", async () => {
    const projectRoot = await createTempDir("crap-coverage-command-");
    tempDirs.push(projectRoot);
    const moduleRoot = path.join(projectRoot, "packages", "demo");

    await writeProjectFiles(projectRoot, {
      "package.json": JSON.stringify({
        name: "root",
        private: true,
        devDependencies: { vitest: "^4.0.0" }
      }),
      "package-lock.json": "{}",
      "packages/demo/package.json": '{"name":"demo","private":true}'
    });

    const expectedCommand = {
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
      cwd: moduleRoot,
      packageManager: "npm",
      testRunner: "vitest"
    } satisfies CoverageCommand;

    const executor = {
      execute: vi.fn(async (command: CoverageCommand) => {
        expect(command).toEqual(expectedCommand);

        await writeProjectFiles(projectRoot, {
          "packages/demo/coverage/coverage-final.json": "{}"
        });
        return 0;
      })
    };

    await expect(
      ensureCoverageReport(projectRoot, moduleRoot, "auto", "auto", "auto", undefined, executor)
    ).resolves.toEqual({
      coverageSourcePath: path.join(moduleRoot, "coverage", "coverage-final.json"),
      coverageSourceRoot: moduleRoot,
      command: expectedCommand
    });
    expect(executor.execute).toHaveBeenCalledOnce();
  });

  it("throws when the generated coverage command fails", async () => {
    const projectRoot = await createTempDir("crap-coverage-command-");
    tempDirs.push(projectRoot);
    const moduleRoot = path.join(projectRoot, "packages", "demo");

    await writeProjectFiles(projectRoot, {
      "package.json": JSON.stringify({
        name: "root",
        private: true,
        devDependencies: { jest: "^30.0.0" }
      }),
      "packages/demo/package.json": '{"name":"demo","private":true}',
      "packages/demo/yarn.lock": ""
    });

    await expect(
      ensureCoverageReport(projectRoot, moduleRoot, "auto", "auto", "auto", undefined, {
        execute: vi.fn(async () => 3)
      })
    ).rejects.toThrow(
      `Coverage command failed with exit 3 for yarn/jest in ${moduleRoot}: yarn jest --coverage --runInBand --coverageReporters=json --coverageReporters=text --coverageDirectory=coverage`
    );
  });
});

describe("expectedCoveragePath", () => {
  it("keeps absolute paths and resolves relative paths from the module root", () => {
    expect(expectedCoveragePath("C:/repo/packages/demo")).toBe(path.join("C:/repo/packages/demo", "coverage", "coverage-final.json"));
    expect(expectedCoveragePath("C:/repo/packages/demo", "custom/coverage-final.json")).toBe(
      path.join("C:/repo/packages/demo", "custom", "coverage-final.json")
    );
    expect(expectedCoveragePath("C:/repo/packages/demo", "D:/coverage/coverage-final.json")).toBe(
      "D:/coverage/coverage-final.json"
    );
  });
});

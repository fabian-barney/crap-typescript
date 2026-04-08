import path from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import {
  locateCoverageReport,
  resolveModuleRoot,
  resolvePackageManager,
  resolveTestRunner
} from "../src/moduleResolution";
import { createTempDir, disposeTempDir, writeProjectFiles } from "./testUtils";

const tempDirs: string[] = [];

afterEach(async () => {
  await Promise.all(tempDirs.splice(0).map(disposeTempDir));
});

describe("resolveModuleRoot", () => {
  it("returns the nearest package root for nested workspace files and falls back to the project root", async () => {
    const tempDir = await createTempDir("crap-module-root-");
    tempDirs.push(tempDir);
    await writeProjectFiles(tempDir, {
      "package.json": '{"name":"root","private":true}',
      "packages/demo/package.json": '{"name":"demo","private":true}',
      "packages/demo/src/example.ts": "export const example = 1;\n",
      "tools/script.ts": "export const script = 1;\n"
    });

    await expect(resolveModuleRoot(tempDir, `${tempDir}/packages/demo/src/example.ts`)).resolves.toBe(`${tempDir}/packages/demo`);
    await expect(resolveModuleRoot(tempDir, `${tempDir}/tools/script.ts`)).resolves.toBe(tempDir);
  });
});

describe("locateCoverageReport", () => {
  it("prefers the module coverage report when both module and project reports exist", async () => {
    const tempDir = await createTempDir("crap-coverage-source-");
    tempDirs.push(tempDir);
    await writeProjectFiles(tempDir, {
      "package.json": '{"name":"root","private":true}',
      "coverage/coverage-final.json": "{}",
      "packages/demo/package.json": '{"name":"demo","private":true}',
      "packages/demo/coverage/coverage-final.json": "{}"
    });

    await expect(locateCoverageReport(tempDir, `${tempDir}/packages/demo`)).resolves.toEqual({
      reportPath: path.join(tempDir, "packages", "demo", "coverage", "coverage-final.json"),
      sourceRoot: `${tempDir}/packages/demo`
    });
  });

  it("falls back to the project coverage report when the module report is missing", async () => {
    const tempDir = await createTempDir("crap-coverage-source-");
    tempDirs.push(tempDir);
    await writeProjectFiles(tempDir, {
      "package.json": '{"name":"root","private":true}',
      "coverage/coverage-final.json": "{}",
      "packages/demo/package.json": '{"name":"demo","private":true}'
    });

    await expect(
      locateCoverageReport(tempDir, `${tempDir}/packages/demo`, "coverage/coverage-final.json")
    ).resolves.toEqual({
      reportPath: path.join(tempDir, "coverage", "coverage-final.json"),
      sourceRoot: tempDir
    });
  });
});

describe("resolvePackageManager", () => {
  it("honors explicit selection and auto-detects lockfiles", async () => {
    const tempDir = await createTempDir("crap-package-manager-");
    tempDirs.push(tempDir);
    await writeProjectFiles(tempDir, {
      "package.json": '{"name":"root","private":true}',
      "pnpm-lock.yaml": "lockfileVersion: 9.0\n",
      "packages/demo/package.json": '{"name":"demo","private":true}',
      "packages/demo/yarn.lock": ""
    });

    await expect(resolvePackageManager("pnpm", tempDir, `${tempDir}/packages/demo`)).resolves.toBe("pnpm");
    await expect(resolvePackageManager("auto", tempDir, `${tempDir}/packages/demo`)).resolves.toBe("yarn");

    await writeProjectFiles(tempDir, {
      "packages/demo/yarn.lock": ""
    });
  });

  it("falls back to npm when npm lockfiles are present or nothing is detected", async () => {
    const tempDir = await createTempDir("crap-package-manager-");
    tempDirs.push(tempDir);
    await writeProjectFiles(tempDir, {
      "package.json": '{"name":"root","private":true}',
      "npm-shrinkwrap.json": "{}",
      "packages/demo/package.json": '{"name":"demo","private":true}'
    });

    await expect(resolvePackageManager("auto", tempDir, `${tempDir}/packages/demo`)).resolves.toBe("npm");
  });
});

describe("resolveTestRunner", () => {
  it("prefers explicit script evidence over ambiguous dependencies", async () => {
    const tempDir = await createTempDir("crap-runner-");
    tempDirs.push(tempDir);
    await writeProjectFiles(tempDir, {
      "package.json": JSON.stringify({
        name: "fixture",
        private: true,
        devDependencies: {
          jest: "^30.0.0",
          vitest: "^4.0.0"
        },
        scripts: {
          test: "jest --runInBand"
        }
      })
    });

    await expect(resolveTestRunner("auto", tempDir, tempDir)).resolves.toBe("jest");
  });

  it("honors explicit selection, falls back to dependencies, and errors when nothing can be detected", async () => {
    const tempDir = await createTempDir("crap-runner-");
    tempDirs.push(tempDir);
    await writeProjectFiles(tempDir, {
      "package.json": JSON.stringify({
        name: "fixture",
        private: true,
        devDependencies: {
          vitest: "^4.0.0"
        }
      }),
      "packages/demo/package.json": JSON.stringify({
        name: "demo",
        private: true
      })
    });

    await expect(resolveTestRunner("vitest", tempDir, `${tempDir}/packages/demo`)).resolves.toBe("vitest");
    await expect(resolveTestRunner("auto", tempDir, `${tempDir}/packages/demo`)).resolves.toBe("vitest");
    await expect(resolveTestRunner("auto", `${tempDir}/packages/demo`, `${tempDir}/packages/demo`)).rejects.toThrow(
      "Unable to detect a test runner"
    );
  });
});

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
  });

  it("falls back to project-level lockfiles and then to npm defaults", async () => {
    const tempDir = await createTempDir("crap-package-manager-");
    tempDirs.push(tempDir);
    await writeProjectFiles(tempDir, {
      "package.json": '{"name":"root","private":true}',
      "package-lock.json": "{}",
      "packages/demo/package.json": '{"name":"demo","private":true}'
    });

    await expect(resolvePackageManager("auto", tempDir, `${tempDir}/packages/demo`)).resolves.toBe("npm");

    const shrinkwrapDir = await createTempDir("crap-package-manager-");
    tempDirs.push(shrinkwrapDir);
    await writeProjectFiles(shrinkwrapDir, {
      "package.json": '{"name":"root","private":true}',
      "npm-shrinkwrap.json": "{}",
      "packages/demo/package.json": '{"name":"demo","private":true}'
    });

    await expect(resolvePackageManager("auto", shrinkwrapDir, `${shrinkwrapDir}/packages/demo`)).resolves.toBe("npm");

    const defaultDir = await createTempDir("crap-package-manager-");
    tempDirs.push(defaultDir);
    await writeProjectFiles(defaultDir, {
      "package.json": '{"name":"root","private":true}',
      "packages/demo/package.json": '{"name":"demo","private":true}'
    });

    await expect(resolvePackageManager("auto", defaultDir, `${defaultDir}/packages/demo`)).resolves.toBe("npm");
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
          test: "./node_modules/.bin/jest --runInBand"
        }
      })
    });

    await expect(resolveTestRunner("auto", tempDir, tempDir)).resolves.toBe("jest");
  });

  it("detects script runners through common command wrappers", async () => {
    const npmExecDir = await createTempDir("crap-runner-");
    const npmExecSeparatorDir = await createTempDir("crap-runner-");
    const npxDir = await createTempDir("crap-runner-");
    const npxFlagDir = await createTempDir("crap-runner-");
    const yarnRunDir = await createTempDir("crap-runner-");
    const pnpmExecDir = await createTempDir("crap-runner-");
    const nodeBinDir = await createTempDir("crap-runner-");
    const nodeRequireDir = await createTempDir("crap-runner-");
    const nodeLoaderDir = await createTempDir("crap-runner-");
    const quotedEnvDir = await createTempDir("crap-runner-");
    tempDirs.push(
      npmExecDir,
      npmExecSeparatorDir,
      npxDir,
      npxFlagDir,
      yarnRunDir,
      pnpmExecDir,
      nodeBinDir,
      nodeRequireDir,
      nodeLoaderDir,
      quotedEnvDir
    );

    await writeProjectFiles(npmExecDir, {
      "package.json": JSON.stringify({
        name: "fixture",
        private: true,
        scripts: {
          test: "npm exec jest -- --runInBand"
        }
      })
    });
    await writeProjectFiles(npmExecSeparatorDir, {
      "package.json": JSON.stringify({
        name: "fixture",
        private: true,
        scripts: {
          test: "npm exec -- jest --runInBand"
        }
      })
    });
    await writeProjectFiles(npxDir, {
      "package.json": JSON.stringify({
        name: "fixture",
        private: true,
        scripts: {
          test: "npx vitest run"
        }
      })
    });
    await writeProjectFiles(npxFlagDir, {
      "package.json": JSON.stringify({
        name: "fixture",
        private: true,
        scripts: {
          test: "npx --yes vitest run"
        }
      })
    });
    await writeProjectFiles(yarnRunDir, {
      "package.json": JSON.stringify({
        name: "fixture",
        private: true,
        scripts: {
          test: "yarn run jest --runInBand"
        }
      })
    });
    await writeProjectFiles(pnpmExecDir, {
      "package.json": JSON.stringify({
        name: "fixture",
        private: true,
        scripts: {
          test: "pnpm exec vitest run"
        }
      })
    });
    await writeProjectFiles(nodeBinDir, {
      "package.json": JSON.stringify({
        name: "fixture",
        private: true,
        scripts: {
          test: "node ./node_modules/.bin/vitest run"
        }
      })
    });
    await writeProjectFiles(nodeRequireDir, {
      "package.json": JSON.stringify({
        name: "fixture",
        private: true,
        scripts: {
          test: "node -r ts-node/register ./node_modules/.bin/jest --runInBand"
        }
      })
    });
    await writeProjectFiles(nodeLoaderDir, {
      "package.json": JSON.stringify({
        name: "fixture",
        private: true,
        scripts: {
          test: "node --loader ts-node/esm ./node_modules/.bin/vitest run"
        }
      })
    });
    await writeProjectFiles(quotedEnvDir, {
      "package.json": JSON.stringify({
        name: "fixture",
        private: true,
        scripts: {
          test: "NODE_OPTIONS=\"--loader ts-node/esm\" vitest run"
        }
      })
    });

    await expect(resolveTestRunner("auto", npmExecDir, npmExecDir)).resolves.toBe("jest");
    await expect(resolveTestRunner("auto", npmExecSeparatorDir, npmExecSeparatorDir)).resolves.toBe("jest");
    await expect(resolveTestRunner("auto", npxDir, npxDir)).resolves.toBe("vitest");
    await expect(resolveTestRunner("auto", npxFlagDir, npxFlagDir)).resolves.toBe("vitest");
    await expect(resolveTestRunner("auto", yarnRunDir, yarnRunDir)).resolves.toBe("jest");
    await expect(resolveTestRunner("auto", pnpmExecDir, pnpmExecDir)).resolves.toBe("vitest");
    await expect(resolveTestRunner("auto", nodeBinDir, nodeBinDir)).resolves.toBe("vitest");
    await expect(resolveTestRunner("auto", nodeRequireDir, nodeRequireDir)).resolves.toBe("jest");
    await expect(resolveTestRunner("auto", nodeLoaderDir, nodeLoaderDir)).resolves.toBe("vitest");
    await expect(resolveTestRunner("auto", quotedEnvDir, quotedEnvDir)).resolves.toBe("vitest");
  });

  it("honors explicit selection, falls back from module to project dependencies, and errors when nothing can be detected", async () => {
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

  it("reports malformed package.json files with their path", async () => {
    const tempDir = await createTempDir("crap-runner-");
    tempDirs.push(tempDir);
    await writeProjectFiles(tempDir, {
      "package.json": "{not-json"
    });

    await expect(resolveTestRunner("auto", tempDir, tempDir)).rejects.toThrow(
      `Package manifest at ${path.join(tempDir, "package.json")} could not be parsed:`
    );
  });

  it("prefers module scripts, detects runners from peer dependencies, and skips missing package.json files", async () => {
    const tempDir = await createTempDir("crap-runner-");
    tempDirs.push(tempDir);
    await writeProjectFiles(tempDir, {
      "package.json": JSON.stringify({
        name: "fixture",
        private: true,
        scripts: {
          test: "jest --runInBand"
        }
      }),
      "packages/demo/package.json": JSON.stringify({
        name: "demo",
        private: true,
        peerDependencies: {
          "ts-jest": "^29.0.0"
        },
        scripts: {
          test: "vitest run"
        }
      })
    });

    await expect(resolveTestRunner("auto", tempDir, `${tempDir}/packages/demo`)).resolves.toBe("vitest");

    const peerDependencyDir = await createTempDir("crap-runner-");
    tempDirs.push(peerDependencyDir);
    await writeProjectFiles(peerDependencyDir, {
      "package.json": '{"name":"fixture","private":true}',
      "packages/demo/package.json": JSON.stringify({
        name: "demo",
        private: true,
        peerDependencies: {
          "ts-jest": "^29.0.0"
        }
      })
    });

    await expect(resolveTestRunner("auto", peerDependencyDir, `${peerDependencyDir}/packages/demo`)).resolves.toBe("jest");

    const missingModulePackageDir = await createTempDir("crap-runner-");
    tempDirs.push(missingModulePackageDir);
    await writeProjectFiles(missingModulePackageDir, {
      "package.json": JSON.stringify({
        name: "fixture",
        private: true,
        devDependencies: {
          vitest: "^4.0.0"
        }
      })
    });

    await expect(
      resolveTestRunner("auto", missingModulePackageDir, `${missingModulePackageDir}/packages/demo`)
    ).resolves.toBe("vitest");
  });

  it("does not detect runners from plugin package names or non-command script text", async () => {
    const tempDir = await createTempDir("crap-runner-");
    tempDirs.push(tempDir);
    await writeProjectFiles(tempDir, {
      "package.json": JSON.stringify({
        name: "fixture",
        private: true,
        devDependencies: {
          "vitest-coverage-istanbul": "^4.0.0",
          "eslint-plugin-jest": "^29.0.0",
          "ts-jest-mock-extended": "^1.0.0"
        },
        scripts: {
          test: "echo vitest-coverage-istanbul && echo eslint-plugin-jest && echo jest && echo vitest",
          env: "NODE_ENV=jest VITEST_POOL=threads"
        }
      })
    });

    await expect(resolveTestRunner("auto", tempDir, tempDir)).rejects.toThrow("Unable to detect a test runner");
  });
});

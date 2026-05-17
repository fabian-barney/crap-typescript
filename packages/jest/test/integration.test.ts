import { access } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";

import { afterEach, describe, expect, it } from "vitest";

import { copyFixture, disposeTempDir, repoPath, runProcess, writeProjectFiles } from "../../core/test/testUtils";

const tempDirs: string[] = [];

afterEach(async () => {
  await Promise.all(tempDirs.splice(0).map(disposeTempDir));
});

describe("crap-typescript-jest", () => {
  it("writes Istanbul JSON coverage and fails the run when the CRAP threshold is exceeded", async () => {
    const projectRoot = await copyFixture("jest-project");
    tempDirs.push(projectRoot);
    const adapterUrl = pathToFileURL(repoPath("packages", "jest", "dist", "index.js")).href;
    const repoRootPath = process.cwd().replace(/\\/g, "/");
    await writeProjectFiles(projectRoot, {
      "jest.config.mjs": `import { createRequire } from "node:module";
import { withCrapTypescriptJest } from ${JSON.stringify(adapterUrl)};

const require = createRequire(import.meta.url);
const tsJestPath = require.resolve("ts-jest", { paths: [${JSON.stringify(repoRootPath)}] });

export default withCrapTypescriptJest(
  {
    testEnvironment: "node",
    testMatch: ["<rootDir>/test/**/*.test.js"],
    moduleFileExtensions: ["ts", "tsx", "js", "json"],
    transform: {
      "^.+\\\\.tsx?$": [tsJestPath, { tsconfig: { module: "CommonJS", target: "ES2022" } }]
    }
  },
  {
    projectRoot: process.cwd()
  }
);
`
    });

    const result = await runProcess(
      process.execPath,
      [repoPath("node_modules", "jest", "bin", "jest.js"), "--config", "jest.config.mjs", "--runInBand"],
      projectRoot
    );

    expect(result.exitCode).toBe(2);
    await expect(access(path.join(projectRoot, "coverage", "coverage-final.json"))).resolves.toBeUndefined();
    expect(`${result.stdout}\n${result.stderr}`).toContain("CRAP threshold exceeded");
  });

  it("honors custom coverage output directories when enforcing the CRAP threshold", async () => {
    const projectRoot = await copyFixture("jest-project");
    tempDirs.push(projectRoot);
    const adapterUrl = pathToFileURL(repoPath("packages", "jest", "dist", "index.js")).href;
    const repoRootPath = process.cwd().replace(/\\/g, "/");
    await writeProjectFiles(projectRoot, {
      "jest.config.mjs": `import { createRequire } from "node:module";
import { withCrapTypescriptJest } from ${JSON.stringify(adapterUrl)};

const require = createRequire(import.meta.url);
const tsJestPath = require.resolve("ts-jest", { paths: [${JSON.stringify(repoRootPath)}] });

export default withCrapTypescriptJest(
  {
    testEnvironment: "node",
    testMatch: ["<rootDir>/test/**/*.test.js"],
    moduleFileExtensions: ["ts", "tsx", "js", "json"],
    coverageDirectory: "custom-coverage",
    transform: {
      "^.+\\\\.tsx?$": [tsJestPath, { tsconfig: { module: "CommonJS", target: "ES2022" } }]
    }
  },
  {
    projectRoot: process.cwd()
  }
);
`
    });

    const result = await runProcess(
      process.execPath,
      [repoPath("node_modules", "jest", "bin", "jest.js"), "--config", "jest.config.mjs", "--runInBand"],
      projectRoot
    );

    expect(result.exitCode).toBe(2);
    await expect(access(path.join(projectRoot, "custom-coverage", "coverage-final.json"))).resolves.toBeUndefined();
    expect(`${result.stdout}\n${result.stderr}`).toContain("CRAP threshold exceeded");
    expect(`${result.stdout}\n${result.stderr}`).not.toContain("Coverage will be N/A");
  });
});

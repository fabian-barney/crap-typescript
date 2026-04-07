import { access } from "node:fs/promises";
import path from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { copyFixture, disposeTempDir, repoPath, runProcess, writeProjectFiles } from "../../core/test/testUtils";

const tempDirs: string[] = [];

afterEach(async () => {
  await Promise.all(tempDirs.splice(0).map(disposeTempDir));
});

describe("crap-typescript-vitest", () => {
  it("writes Istanbul JSON coverage and fails the run when the CRAP threshold is exceeded", async () => {
    const projectRoot = await copyFixture("vitest-project");
    tempDirs.push(projectRoot);
    const adapterPath = repoPath("packages", "vitest", "dist", "index.js").replace(/\\/g, "/");
    await writeProjectFiles(projectRoot, {
      "vitest.config.cjs": `const { withCrapTypescriptVitest } = require(${JSON.stringify(adapterPath)});

module.exports = withCrapTypescriptVitest(
  {
    test: {
      include: ["test/**/*.test.ts"]
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
      [repoPath("node_modules", "vitest", "vitest.mjs"), "run", "--config", "vitest.config.cjs"],
      projectRoot
    );

    expect(result.exitCode).not.toBe(0);
    await expect(access(path.join(projectRoot, "coverage", "coverage-final.json"))).resolves.toBeUndefined();
    expect(`${result.stdout}\n${result.stderr}`).toContain("CRAP threshold exceeded");
  });

  it("honors custom coverage output directories when enforcing the CRAP threshold", async () => {
    const projectRoot = await copyFixture("vitest-project");
    tempDirs.push(projectRoot);
    const adapterPath = repoPath("packages", "vitest", "dist", "index.js").replace(/\\/g, "/");
    await writeProjectFiles(projectRoot, {
      "vitest.config.cjs": `const { withCrapTypescriptVitest } = require(${JSON.stringify(adapterPath)});

module.exports = withCrapTypescriptVitest(
  {
    test: {
      include: ["test/**/*.test.ts"],
      coverage: {
        reportsDirectory: "custom-coverage"
      }
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
      [repoPath("node_modules", "vitest", "vitest.mjs"), "run", "--config", "vitest.config.cjs"],
      projectRoot
    );

    expect(result.exitCode).not.toBe(0);
    await expect(access(path.join(projectRoot, "custom-coverage", "coverage-final.json"))).resolves.toBeUndefined();
    expect(`${result.stdout}\n${result.stderr}`).toContain("CRAP threshold exceeded");
    expect(`${result.stdout}\n${result.stderr}`).not.toContain("Coverage will be N/A");
  });
});

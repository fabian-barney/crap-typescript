import path from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { analyzeProject } from "../src/analyzeProject";
import { CRAP_THRESHOLD } from "../src/constants";
import { copyFixture, createTempDir, disposeTempDir, writeProjectFiles } from "./testUtils";

const tempDirs: string[] = [];

afterEach(async () => {
  await Promise.all(tempDirs.splice(0).map(disposeTempDir));
});

describe("analyzeProject", () => {
  it("analyzes a multi-package workspace using existing Istanbul coverage reports", async () => {
    const projectRoot = await copyFixture("workspace-project");
    tempDirs.push(projectRoot);

    const result = await analyzeProject({
      projectRoot,
      coverageMode: "existing-only"
    });

    expect(result.selectedFiles.map((file) => path.relative(projectRoot, file).replace(/\\/g, "/"))).toEqual([
      "packages/package-a/src/math.ts",
      "packages/package-b/src/text.ts"
    ]);
    expect(result.metrics.map((metric) => ({
      name: metric.displayName,
      coverage: metric.coveragePercent === null ? null : Number(metric.coveragePercent.toFixed(1)),
      crap: metric.crapScore === null ? null : Number(metric.crapScore.toFixed(1))
    }))).toEqual([
      { name: "add", coverage: 100.0, crap: 1.0 },
      { name: "risky", coverage: 0.0, crap: 12.0 },
      { name: "upper", coverage: 100.0, crap: 1.0 }
    ]);
    expect(result.maxCrap).toBeGreaterThan(CRAP_THRESHOLD);
    expect(result.thresholdExceeded).toBe(true);
  });

  it("warns and reports N/A coverage when existing coverage is missing", async () => {
    const projectRoot = await createTempDir("crap-analysis-");
    tempDirs.push(projectRoot);
    const warnings: string[] = [];
    await writeProjectFiles(projectRoot, {
      "package.json": '{"name":"fixture","private":true}',
      "src/sample.ts": `export function risky(flagA: boolean, flagB: boolean): number {
  if (flagA && flagB) {
    return 1;
  }
  return 0;
}
`
    });

    const result = await analyzeProject({
      projectRoot,
      coverageMode: "existing-only",
      stderr: {
        write(chunk: string) {
          warnings.push(chunk);
        }
      }
    });

    expect(result.warnings).toHaveLength(1);
    expect(warnings.join("")).toContain("Coverage will be N/A");
    expect(result.metrics[0]?.coveragePercent).toBeNull();
    expect(result.metrics[0]?.crapScore).toBeNull();
  });

  it("warns and reports N/A coverage when the coverage report cannot be parsed", async () => {
    const projectRoot = await createTempDir("crap-analysis-");
    tempDirs.push(projectRoot);
    const warnings: string[] = [];
    await writeProjectFiles(projectRoot, {
      "package.json": '{"name":"fixture","private":true}',
      "src/sample.ts": `export function risky(flagA: boolean, flagB: boolean): number {
  if (flagA && flagB) {
    return 1;
  }
  return 0;
}
`,
      "coverage/coverage-final.json": "{not-json"
    });

    const result = await analyzeProject({
      projectRoot,
      coverageMode: "existing-only",
      stderr: {
        write(chunk: string) {
          warnings.push(chunk);
        }
      }
    });

    expect(result.warnings).toHaveLength(1);
    expect(warnings.join("")).toContain("could not be parsed");
    expect(result.metrics[0]?.coveragePercent).toBeNull();
    expect(result.metrics[0]?.crapScore).toBeNull();
  });
});

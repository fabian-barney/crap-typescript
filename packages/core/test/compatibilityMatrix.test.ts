import { readFileSync } from "node:fs";
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { analyzeProject } from "../src/analyzeProject";
import { copyFixture, disposeTempDir, repoPath } from "./testUtils";

interface ExpectedMetric {
  name: string;
  coverage: number | null;
}

interface CompatibilityCase {
  name: string;
  fixture: string;
  pathMode?: "relative" | "absolute";
  expectedSelectedFiles?: string[];
  expectedMetrics: ExpectedMetric[];
}

interface CompatibilityMatrix {
  cases: CompatibilityCase[];
}

const tempDirs: string[] = [];
const matrix = JSON.parse(
  readFileSync(repoPath("tests", "fixtures", "compatibility-matrix", "matrix.json"), "utf8")
) as CompatibilityMatrix;

afterEach(async () => {
  await Promise.all(tempDirs.splice(0).map(disposeTempDir));
});

describe("compatibility matrix", () => {
  for (const testCase of matrix.cases) {
    it(`verifies ${testCase.name}`, async () => {
      const projectRoot = await copyFixture(testCase.fixture);
      tempDirs.push(projectRoot);
      await applyCoveragePathMode(projectRoot, testCase);

      const result = await analyzeProject({
        projectRoot,
        coverageMode: "existing-only"
      });

      expect(result.warnings).toEqual([]);

      if (testCase.expectedSelectedFiles) {
        expect(result.selectedFiles.map((file) => path.relative(projectRoot, file).replace(/\\/g, "/"))).toEqual(
          testCase.expectedSelectedFiles
        );
      }

      expect(result.metrics.map((metric) => ({
        name: metric.displayName,
        coverage: metric.coveragePercent === null ? null : Number(metric.coveragePercent.toFixed(1))
      }))).toEqual(testCase.expectedMetrics);
    });
  }
});

async function applyCoveragePathMode(projectRoot: string, testCase: CompatibilityCase): Promise<void> {
  if (testCase.pathMode !== "absolute") {
    return;
  }

  const reportPath = path.join(projectRoot, "coverage", "coverage-final.json");
  const raw = JSON.parse(await readFile(reportPath, "utf8")) as Record<string, Record<string, unknown>>;
  const rewritten = Object.fromEntries(
    Object.entries(raw).map(([entryKey, entryValue]) => {
      const sourcePath = typeof entryValue.path === "string" ? entryValue.path : entryKey;
      return [
        entryKey,
        {
          ...entryValue,
          path: path.join(projectRoot, sourcePath)
        }
      ];
    })
  );

  await writeFile(reportPath, JSON.stringify(rewritten, null, 2));
}

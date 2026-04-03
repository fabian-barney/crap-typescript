import { readFile } from "node:fs/promises";
import path from "node:path";

import { normalizePathForMatch } from "./utils";

export interface FileCoverage {
  lineHits: Map<number, number>;
}

export async function parseLcov(
  lcovPath: string,
  sourceRoot: string
): Promise<Map<string, FileCoverage>> {
  const raw = await readFile(lcovPath, "utf8");
  const records = new Map<string, FileCoverage>();
  let currentFile: string | null = null;
  const coverageDirectory = path.dirname(lcovPath);

  for (const line of raw.split(/\r?\n/)) {
    if (line.startsWith("SF:")) {
      const value = line.slice(3).trim();
      const resolved = path.isAbsolute(value)
        ? value
        : value.startsWith(".")
          ? path.resolve(coverageDirectory, value)
          : path.resolve(sourceRoot, value);
      currentFile = normalizePathForMatch(resolved);
      if (!records.has(currentFile)) {
        records.set(currentFile, { lineHits: new Map() });
      }
      continue;
    }
    if (line === "end_of_record") {
      currentFile = null;
      continue;
    }
    if (line.startsWith("DA:") && currentFile) {
      const [lineNumberText, hitCountText] = line.slice(3).split(",");
      const lineNumber = Number.parseInt(lineNumberText, 10);
      const hitCount = Number.parseInt(hitCountText, 10);
      if (Number.isFinite(lineNumber) && Number.isFinite(hitCount)) {
        const fileCoverage = records.get(currentFile);
        if (fileCoverage) {
          fileCoverage.lineHits.set(lineNumber, (fileCoverage.lineHits.get(lineNumber) ?? 0) + hitCount);
        }
      }
    }
  }
  return records;
}

export function coverageForLineRange(
  lineHits: Map<number, number> | undefined,
  startLine: number,
  endLine: number
): number | null {
  if (!lineHits) {
    return null;
  }
  let executableLines = 0;
  let coveredLines = 0;
  for (const [lineNumber, hits] of lineHits.entries()) {
    if (lineNumber < startLine || lineNumber > endLine) {
      continue;
    }
    executableLines += 1;
    if (hits > 0) {
      coveredLines += 1;
    }
  }
  if (executableLines === 0) {
    return null;
  }
  return (coveredLines / executableLines) * 100;
}

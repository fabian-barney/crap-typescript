import path from "node:path";

import { CRAP_THRESHOLD } from "./constants";
import { ensureCoverageReport, expectedCoveragePath } from "./coverage";
import { calculateCrapScore, maxCrap } from "./crapScore";
import { changedTypeScriptFilesUnderSourceRoots, expandExplicitPaths, findAllTypeScriptFilesUnderSourceRoots } from "./fileSelection";
import { coverageForMethods, parseCoverageReport } from "./istanbul";
import { resolveModuleRoot } from "./moduleResolution";
import { parseFileMethods } from "./parser";
import { DefaultCommandExecutor, normalizePathForMatch, toRelativePath, writeLine } from "./utils";
import type { AnalysisResult, AnalyzeProjectOptions, MethodMetrics, CoverageCommand } from "./types";
import type { FileCoverage } from "./istanbul";

export async function analyzeProject(options: AnalyzeProjectOptions = {}): Promise<AnalysisResult> {
  const projectRoot = path.resolve(options.projectRoot ?? process.cwd());
  const coverageMode = options.coverageMode ?? "auto";
  const packageManager = options.packageManager ?? "auto";
  const testRunner = options.testRunner ?? "auto";
  const coverageReportPath = options.coverageReportPath;
  const executor = options.executor ?? new DefaultCommandExecutor();

  const selectedFiles = await selectFiles(projectRoot, options.explicitPaths ?? [], options.changedOnly ?? false);
  if (selectedFiles.length === 0) {
    return {
      metrics: [],
      maxCrap: 0,
      thresholdExceeded: false,
      selectedFiles: [],
      coverageCommands: [],
      warnings: []
    };
  }

  const groupedByModule = new Map<string, string[]>();
  for (const filePath of selectedFiles) {
    const moduleRoot = await resolveModuleRoot(projectRoot, filePath);
    const files = groupedByModule.get(moduleRoot) ?? [];
    files.push(filePath);
    groupedByModule.set(moduleRoot, files);
  }

  const metrics: MethodMetrics[] = [];
  const coverageCommands: CoverageCommand[] = [];
  const warnings: string[] = [];

  for (const [moduleRoot, moduleFiles] of groupedByModule.entries()) {
    const coverageResult = await ensureCoverageReport(
      projectRoot,
      moduleRoot,
      packageManager,
      testRunner,
      coverageMode,
      coverageReportPath,
      executor
    );
    if (coverageResult.command) {
      coverageCommands.push(coverageResult.command);
    }

    let coverageByFile = new Map<string, FileCoverage>();
    if (coverageResult.coverageSourcePath && coverageResult.coverageSourceRoot) {
      try {
        coverageByFile = await parseCoverageReport(coverageResult.coverageSourcePath, coverageResult.coverageSourceRoot);
      } catch (error) {
        const warning = `Warning: Coverage report at ${coverageResult.coverageSourcePath} could not be parsed: ${(error as Error).message}. Coverage will be N/A.`;
        warnings.push(warning);
        writeLine(options.stderr, warning);
      }
    } else {
      const warning = `Warning: Coverage report not found at ${expectedCoveragePath(moduleRoot, coverageReportPath)}. Coverage will be N/A.`;
      warnings.push(warning);
      writeLine(options.stderr, warning);
    }

    for (const filePath of moduleFiles) {
      const descriptors = await parseFileMethods(filePath);
      const relativePath = toRelativePath(projectRoot, filePath);
      const fileCoverage = resolveFileCoverage(coverageByFile, filePath, relativePath);
      const methodCoverage = coverageForMethods(descriptors, fileCoverage);
      for (const [index, descriptor] of descriptors.entries()) {
        const coverage = methodCoverage[index];
        const coveragePercent = coverage?.coveragePercent ?? null;
        metrics.push({
          ...descriptor,
          filePath,
          relativePath,
          location: `${relativePath}:${descriptor.startLine}-${descriptor.endLine}`,
          moduleRoot,
          coveragePercent,
          crapScore: calculateCrapScore(descriptor.complexity, coveragePercent)
        });
      }
    }
  }

  const max = maxCrap(metrics);
  return {
    metrics,
    maxCrap: max,
    thresholdExceeded: max > CRAP_THRESHOLD,
    selectedFiles,
    coverageCommands,
    warnings
  };
}

async function selectFiles(
  projectRoot: string,
  explicitPaths: string[],
  changedOnly: boolean
): Promise<string[]> {
  if (changedOnly) {
    return changedTypeScriptFilesUnderSourceRoots(projectRoot);
  }
  if (explicitPaths.length > 0) {
    return expandExplicitPaths(projectRoot, explicitPaths);
  }
  return findAllTypeScriptFilesUnderSourceRoots(projectRoot);
}

function resolveFileCoverage(
  coverageByFile: Map<string, FileCoverage>,
  filePath: string,
  relativePath: string
): FileCoverage | undefined {
  const exact = coverageByFile.get(normalizePathForMatch(filePath));
  if (exact) {
    return exact;
  }

  const suffix = `/${relativePath.replace(/\\/g, "/").toLowerCase()}`;
  for (const [candidatePath, coverage] of coverageByFile.entries()) {
    if (candidatePath.endsWith(suffix)) {
      return coverage;
    }
  }
  return undefined;
}

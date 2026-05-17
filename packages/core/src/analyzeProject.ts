import path from "node:path";

import { CRAP_THRESHOLD, thresholdWarning, validateThreshold } from "./constants.js";
import { coverageForMethods } from "./coverageAttribution.js";
import { ensureCoverageReport, expectedCoveragePath } from "./coverage.js";
import type { FileCoverage } from "./coverageUnits.js";
import { calculateCrapScore, maxCrap } from "./crapScore.js";
import { changedTypeScriptFilesUnderSourceRoots, expandExplicitPaths, findAllTypeScriptFilesUnderSourceRoots } from "./fileSelection.js";
import { CoverageReportParseError, parseCoverageReport } from "./istanbul.js";
import { resolveModuleRoot } from "./moduleResolution.js";
import { parseFileMethods } from "./parser.js";
import { emptySourceExclusionAudit, filterSourceFiles } from "./sourceExclusions.js";
import { DefaultCommandExecutor, normalizePathForMatch, toRelativePath, writeLine } from "./utils.js";
import type {
  AnalysisResult,
  AnalyzeProjectOptions,
  CoverageCommand,
  CoverageUnknownReason,
  MethodDescriptor,
  MethodMetrics
} from "./types.js";

export async function analyzeProject(options: AnalyzeProjectOptions = {}): Promise<AnalysisResult> {
  const context = createAnalyzeContext(options);
  const runWarnings = emitThresholdWarning(context.stderr, context.threshold);
  const candidateFiles = await selectFiles(context.projectRoot, options.explicitPaths ?? [], options.changedOnly ?? false);
  const exclusionResult = await filterSourceFiles(context.projectRoot, candidateFiles, options);
  const selectedFiles = exclusionResult.files;
  if (selectedFiles.length === 0) {
    return emptyAnalysisResult(context.threshold, runWarnings, exclusionResult.audit);
  }

  const groupedByModule = await groupFilesByModule(context.projectRoot, selectedFiles);
  const moduleResults = await analyzeModules(groupedByModule, context);
  const metrics = moduleResults.flatMap((result) => result.metrics);
  const coverageCommands = moduleResults.flatMap((result) => result.coverageCommands);
  const warnings = [...runWarnings, ...moduleResults.flatMap((result) => result.warnings)];
  const max = maxCrap(metrics);

  return {
    metrics,
    maxCrap: max,
    threshold: context.threshold,
    thresholdExceeded: max > context.threshold,
    selectedFiles,
    coverageCommands,
    warnings,
    sourceExclusionAudit: exclusionResult.audit
  };
}

interface AnalyzeContext {
  projectRoot: string;
  coverageMode: NonNullable<AnalyzeProjectOptions["coverageMode"]>;
  packageManager: NonNullable<AnalyzeProjectOptions["packageManager"]>;
  testRunner: NonNullable<AnalyzeProjectOptions["testRunner"]>;
  threshold: number;
  coverageReportPath: AnalyzeProjectOptions["coverageReportPath"];
  executor: NonNullable<AnalyzeProjectOptions["executor"]>;
  stderr: AnalyzeProjectOptions["stderr"];
}

interface ModuleAnalysisResult {
  metrics: MethodMetrics[];
  coverageCommands: CoverageCommand[];
  warnings: string[];
}

interface FileAnalysisResult {
  metrics: MethodMetrics[];
  warnings: string[];
}

interface LoadedCoverage {
  coverageByFile: Map<string, FileCoverage>;
  unknownReason: CoverageUnknownReason | null;
  warnings: string[];
}

function createAnalyzeContext(options: AnalyzeProjectOptions): AnalyzeContext {
  return {
    projectRoot: path.resolve(options.projectRoot ?? process.cwd()),
    coverageMode: options.coverageMode ?? "auto",
    packageManager: options.packageManager ?? "auto",
    testRunner: options.testRunner ?? "auto",
    threshold: validateThreshold(options.threshold ?? CRAP_THRESHOLD),
    coverageReportPath: options.coverageReportPath,
    executor: options.executor ?? new DefaultCommandExecutor(),
    stderr: options.stderr
  };
}

function emptyAnalysisResult(
  threshold: number,
  warnings: string[],
  sourceExclusionAudit = emptySourceExclusionAudit()
): AnalysisResult {
  return {
    metrics: [],
    maxCrap: 0,
    threshold,
    thresholdExceeded: false,
    selectedFiles: [],
    coverageCommands: [],
    warnings,
    sourceExclusionAudit
  };
}

async function groupFilesByModule(projectRoot: string, selectedFiles: string[]): Promise<Map<string, string[]>> {
  const groupedByModule = new Map<string, string[]>();
  for (const filePath of selectedFiles) {
    const moduleRoot = await resolveModuleRoot(projectRoot, filePath);
    const files = groupedByModule.get(moduleRoot) ?? [];
    files.push(filePath);
    groupedByModule.set(moduleRoot, files);
  }
  return groupedByModule;
}

async function analyzeModules(groupedByModule: Map<string, string[]>, context: AnalyzeContext): Promise<ModuleAnalysisResult[]> {
  const results: ModuleAnalysisResult[] = [];
  for (const [moduleRoot, moduleFiles] of groupedByModule.entries()) {
    results.push(await analyzeModule(moduleRoot, moduleFiles, context));
  }
  return results;
}

async function analyzeModule(
  moduleRoot: string,
  moduleFiles: string[],
  context: AnalyzeContext
): Promise<ModuleAnalysisResult> {
  const coverageResult = await ensureCoverageReport(
    context.projectRoot,
    moduleRoot,
    context.packageManager,
    context.testRunner,
    context.coverageMode,
    context.coverageReportPath,
    context.executor
  );
  const loadedCoverage = await loadModuleCoverage(moduleRoot, coverageResult, context);
  const fileResults = await analyzeFiles(moduleRoot, moduleFiles, loadedCoverage, context);

  return {
    metrics: fileResults.flatMap((result) => result.metrics),
    coverageCommands: coverageResult.command ? [coverageResult.command] : [],
    warnings: [...loadedCoverage.warnings, ...fileResults.flatMap((result) => result.warnings)]
  };
}

async function loadModuleCoverage(
  moduleRoot: string,
  coverageResult: Awaited<ReturnType<typeof ensureCoverageReport>>,
  context: AnalyzeContext
): Promise<LoadedCoverage> {
  if (!coverageResult.coverageSourcePath || !coverageResult.coverageSourceRoot) {
    return {
      coverageByFile: new Map<string, FileCoverage>(),
      unknownReason: "missing_report",
      warnings: [emitWarning(
        context.stderr,
        `Warning: Coverage report not found at ${expectedCoveragePath(moduleRoot, context.coverageReportPath)}. Coverage will be N/A.`
      )]
    };
  }

  try {
    return {
      coverageByFile: await parseCoverageReport(coverageResult.coverageSourcePath, coverageResult.coverageSourceRoot),
      unknownReason: null,
      warnings: []
    };
  } catch (error) {
    const parseMessage = error instanceof CoverageReportParseError
      ? error.message
      : `Coverage report at ${coverageResult.coverageSourcePath} could not be parsed: ${(error as Error).message}`;
    return {
      coverageByFile: new Map<string, FileCoverage>(),
      unknownReason: "unparseable_report",
      warnings: [emitWarning(
        context.stderr,
        `Warning: ${parseMessage}. Coverage will be N/A.`
      )]
    };
  }
}

async function analyzeFiles(
  moduleRoot: string,
  moduleFiles: string[],
  loadedCoverage: LoadedCoverage,
  context: AnalyzeContext
): Promise<FileAnalysisResult[]> {
  const results: FileAnalysisResult[] = [];
  for (const filePath of moduleFiles) {
    results.push(await analyzeFile(filePath, moduleRoot, loadedCoverage, context));
  }
  return results;
}

async function analyzeFile(
  filePath: string,
  moduleRoot: string,
  loadedCoverage: LoadedCoverage,
  context: AnalyzeContext
): Promise<FileAnalysisResult> {
  const relativePath = toRelativePath(context.projectRoot, filePath);
  let descriptors: MethodDescriptor[];
  try {
    descriptors = await parseFileMethods(filePath);
  } catch (error) {
    return {
      metrics: [],
      warnings: [emitWarning(
        context.stderr,
        `Warning: Could not parse ${relativePath}: ${(error as Error).message}. Skipping file.`
      )]
    };
  }
  const fileCoverage = resolveFileCoverage(loadedCoverage.coverageByFile, filePath, relativePath, loadedCoverage.unknownReason);
  const methodCoverage = coverageForMethods(descriptors, fileCoverage.coverage, fileCoverage.unknownReason ?? undefined);
  const warnings: string[] = [];
  const metrics = descriptors.map((descriptor, index) =>
    toMetric(descriptor, methodCoverage[index]!, filePath, relativePath, moduleRoot, context.stderr, warnings)
  );

  return { metrics, warnings };
}

function toMetric(
  descriptor: MethodDescriptor,
  coverage: ReturnType<typeof coverageForMethods>[number],
  filePath: string,
  relativePath: string,
  moduleRoot: string,
  stderr: AnalyzeProjectOptions["stderr"],
  warnings: string[]
): MethodMetrics {
  const coveragePercent = coverage.coverage.percent;
  if (coverage.coverage.unknownReason === "fnmap_conflict") {
    warnings.push(emitWarning(
      stderr,
      `Warning: Function coverage metadata in ${relativePath} could not be matched unambiguously for ${descriptor.displayName}. Coverage will be N/A.`
    ));
  }

  return {
    ...descriptor,
    filePath,
    relativePath,
    location: `${relativePath}:${descriptor.startLine}-${descriptor.endLine}`,
    moduleRoot,
    coverage: coverage.coverage,
    statementCoverage: coverage.statementCoverage,
    branchCoverage: coverage.branchCoverage,
    coveragePercent,
    crapScore: calculateCrapScore(descriptor.complexity, coveragePercent)
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
  relativePath: string,
  coverageUnavailableReason: CoverageUnknownReason | null
): { coverage: FileCoverage | undefined; unknownReason: CoverageUnknownReason | null } {
  const exact = coverageByFile.get(normalizePathForMatch(filePath));
  if (exact) {
    return { coverage: exact, unknownReason: null };
  }

  const suffix = `/${relativePath.replace(/\\/g, "/").toLowerCase()}`;
  for (const [candidatePath, coverage] of coverageByFile.entries()) {
    if (candidatePath.endsWith(suffix)) {
      return { coverage, unknownReason: null };
    }
  }
  return {
    coverage: undefined,
    unknownReason: coverageUnavailableReason ?? "file_unmatched"
  };
}

function emitWarning(stderr: AnalyzeProjectOptions["stderr"], warning: string): string {
  writeLine(stderr, warning);
  return warning;
}

function emitThresholdWarning(stderr: AnalyzeProjectOptions["stderr"], threshold: number): string[] {
  const warning = thresholdWarning(threshold);
  return warning === "" ? [] : [emitWarning(stderr, warning)];
}

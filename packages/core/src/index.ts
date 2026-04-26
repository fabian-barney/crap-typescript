export { analyzeProject } from "./analyzeProject.js";
export { runCli, parseCliArguments, usage } from "./cli.js";
export { calculateCrapScore, maxCrap } from "./crapScore.js";
export { buildCoverageCommand } from "./coverage.js";
export { changedTypeScriptFilesUnderSourceRoots, expandExplicitPaths, findAllTypeScriptFilesUnderSourceRoots, isAnalyzableFile } from "./fileSelection.js";
export { coverageForMethods, parseCoverageReport } from "./istanbul.js";
export { parseFileMethods } from "./parser.js";
export {
  buildAgentAnalysisReport,
  buildAnalysisReport,
  formatAnalysisReport,
  formatJunitReport,
  formatReport,
  formatTextReport,
  formatToonReport,
  sortMetrics
} from "./report.js";
export { CRAP_THRESHOLD, COVERAGE_REPORT_RELATIVE_PATH, NO_FILES_MESSAGE, NO_ANALYZABLE_FUNCTIONS_MESSAGE } from "./constants.js";
export type {
  AnalysisResult,
  AnalyzeProjectOptions,
  CliArguments,
  CommandExecutor,
  CoverageKind,
  CoverageCommand,
  CoverageMetric,
  CoverageMode,
  CoverageStatus,
  CoverageUnknownReason,
  MethodDescriptor,
  MethodMetrics,
  MethodReportStatus,
  PackageManager,
  PackageManagerSelection,
  ReportFormat,
  ReportStatus,
  TestRunner,
  TestRunnerSelection,
  Writer
} from "./types.js";

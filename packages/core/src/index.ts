export { analyzeProject } from "./analyzeProject.js";
export { runCli, parseCliArguments, usage } from "./cli.js";
export { calculateCrapScore, maxCrap } from "./crapScore.js";
export { buildCoverageCommand } from "./coverage.js";
export { changedTypeScriptFilesUnderSourceRoots, expandExplicitPaths, findAllTypeScriptFilesUnderSourceRoots, isAnalyzableFile } from "./fileSelection.js";
export { coverageForMethods, parseCoverageReport } from "./istanbul.js";
export { ParseError, parseFileMethods } from "./parser.js";
export { filterSourceFiles } from "./sourceExclusions.js";
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
export { validateReportPathTargets } from "./reportPaths.js";
export type {
  AgentAnalysisReport,
  AgentMethodReportEntry,
  AnalysisReport,
  FormatAnalysisReportOptions,
  MethodReportEntry
} from "./report.js";
export type { ReportPathTarget } from "./reportPaths.js";
export {
  CRAP_THRESHOLD,
  COVERAGE_REPORT_RELATIVE_PATH,
  NO_FILES_MESSAGE,
  NO_ANALYZABLE_FUNCTIONS_MESSAGE,
  thresholdWarning,
  validateThreshold
} from "./constants.js";
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
  SourceExclusionAudit,
  SourceExclusionKind,
  SourceExclusionReasonCount,
  SourceExclusionSource,
  TestRunner,
  TestRunnerSelection,
  Writer
} from "./types.js";

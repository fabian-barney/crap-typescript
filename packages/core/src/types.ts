export type CliMode = "all" | "changed" | "explicit" | "help";
export type PackageManager = "npm" | "pnpm" | "yarn";
export type PackageManagerSelection = PackageManager | "auto";
export type TestRunner = "vitest" | "jest";
export type TestRunnerSelection = TestRunner | "auto";
export type CoverageMode = "auto" | "existing-only";
export type ReportFormat = "toon" | "json" | "text" | "junit" | "none";
export type ReportStatus = "passed" | "failed";
export type MethodReportStatus = ReportStatus | "skipped";
export type CoverageKind = "stmt" | "branch" | "N/A";
export type CoverageStatus = "measured" | "structural_na" | "unknown";
export type CoverageUnknownReason =
  | "missing_report"
  | "unparseable_report"
  | "file_unmatched"
  | "fnmap_conflict"
  | "statement_unattributed"
  | "branch_unattributed";

export interface SourceSpan {
  startLine: number;
  startColumn: number;
  endLine: number;
  endColumn: number;
}

export interface CoverageMetric {
  percent: number | null;
  status: CoverageStatus;
  unknownReason: CoverageUnknownReason | null;
}

export interface Writer {
  write(chunk: string): unknown;
}

export interface CliArguments {
  mode: CliMode;
  fileArgs: string[];
  packageManager: PackageManagerSelection;
  testRunner: TestRunnerSelection;
  format: ReportFormat;
  threshold: number;
  agent: boolean;
  failuresOnly: boolean;
  omitRedundancy?: boolean;
  output?: string;
  junit: boolean;
  junitReport?: string;
  excludes?: string[];
  excludePathRegexes?: string[];
  excludeGeneratedMarkers?: string[];
  useDefaultExclusions?: boolean;
}

export interface MethodDescriptor {
  functionName: string;
  containerName: string | null;
  displayName: string;
  startLine: number;
  endLine: number;
  complexity: number;
  bodySpan: SourceSpan;
  expectsStatementCoverage: boolean;
  expectsBranchCoverage: boolean;
}

export interface MethodMetrics extends MethodDescriptor {
  filePath: string;
  relativePath: string;
  location: string;
  moduleRoot: string;
  coverage: CoverageMetric;
  statementCoverage: CoverageMetric;
  branchCoverage: CoverageMetric;
  coveragePercent: number | null;
  crapScore: number | null;
}

export interface CoverageCommand {
  command: string;
  args: string[];
  cwd: string;
  packageManager: PackageManager;
  testRunner: TestRunner;
}

export interface CommandExecutor {
  execute(command: CoverageCommand): Promise<number>;
}

export interface AnalyzeProjectOptions {
  projectRoot?: string;
  explicitPaths?: string[];
  changedOnly?: boolean;
  packageManager?: PackageManagerSelection;
  testRunner?: TestRunnerSelection;
  threshold?: number;
  coverageMode?: CoverageMode;
  coverageReportPath?: string;
  stdout?: Writer;
  stderr?: Writer;
  executor?: CommandExecutor;
  excludes?: string[];
  excludePathRegexes?: string[];
  excludeGeneratedMarkers?: string[];
  useDefaultExclusions?: boolean;
}

export type SourceExclusionSource = "default" | "user";
export type SourceExclusionKind = "path" | "pathRegex" | "generatedMarker";

export interface SourceExclusionReasonCount {
  source: SourceExclusionSource;
  kind: SourceExclusionKind;
  rule: string;
  count: number;
}

export interface SourceExclusionAudit {
  candidateFiles: number;
  includedFiles: number;
  excludedFiles: number;
  reasons: SourceExclusionReasonCount[];
}

export interface AnalysisResult {
  metrics: MethodMetrics[];
  maxCrap: number;
  threshold: number;
  thresholdExceeded: boolean;
  selectedFiles: string[];
  coverageCommands: CoverageCommand[];
  warnings: string[];
  sourceExclusionAudit: SourceExclusionAudit;
}

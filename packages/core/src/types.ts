export type CliMode = "all" | "changed" | "explicit" | "help";
export type PackageManager = "npm" | "pnpm" | "yarn";
export type PackageManagerSelection = PackageManager | "auto";
export type TestRunner = "vitest" | "jest";
export type TestRunnerSelection = TestRunner | "auto";
export type CoverageMode = "auto" | "existing-only";

export interface Writer {
  write(chunk: string): unknown;
}

export interface CliArguments {
  mode: CliMode;
  fileArgs: string[];
  packageManager: PackageManagerSelection;
  testRunner: TestRunnerSelection;
}

export interface MethodDescriptor {
  functionName: string;
  containerName: string | null;
  displayName: string;
  startLine: number;
  endLine: number;
  complexity: number;
}

export interface MethodMetrics extends MethodDescriptor {
  filePath: string;
  relativePath: string;
  location: string;
  moduleRoot: string;
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
  coverageMode?: CoverageMode;
  stdout?: Writer;
  stderr?: Writer;
  executor?: CommandExecutor;
}

export interface AnalysisResult {
  metrics: MethodMetrics[];
  maxCrap: number;
  thresholdExceeded: boolean;
  selectedFiles: string[];
  coverageCommands: CoverageCommand[];
  warnings: string[];
}


import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

import { CRAP_THRESHOLD, validateThreshold } from "./constants.js";
import { analyzeProject } from "./analyzeProject.js";
import { formatAnalysisReport } from "./report.js";
import { validateReportPathTargets } from "./reportPaths.js";
import { formatNumber, writeLine } from "./utils.js";
import type { CliArguments, PackageManagerSelection, ReportFormat, TestRunnerSelection, Writer } from "./types.js";

const REPORT_FORMATS = ["toon", "json", "text", "junit", "none"] as const;
const REPORT_FORMAT_LIST = REPORT_FORMATS.join(", ");
const REPORT_FORMAT_ERROR = `--format requires one of: ${REPORT_FORMAT_LIST}`;

const HELP_TEXT = `crap-typescript

Usage:
  crap-typescript [--help]
  crap-typescript [--changed] [--exclude <glob>] [--exclude-path-regex <regex>] [--exclude-generated-marker <marker>] [--use-default-exclusions[=true|false]] [--package-manager <tool>] [--test-runner <runner>] [--format <format>] [--agent] [--failures-only[=true|false]] [--omit-redundancy[=true|false]] [--output <path>] [--junit-report <path>] [--threshold <number>]
  crap-typescript [--exclude <glob>] [--exclude-path-regex <regex>] [--exclude-generated-marker <marker>] [--use-default-exclusions[=true|false]] [--package-manager <tool>] [--test-runner <runner>] [--format <format>] [--agent] [--failures-only[=true|false]] [--omit-redundancy[=true|false]] [--output <path>] [--junit-report <path>] [--threshold <number>] <path ...>

Options:
  --help                     Print usage to stdout
  --changed                  Analyze changed TypeScript files under src/
  --exclude <glob>           Exclude source paths by project-relative glob; repeatable
  --exclude-path-regex <regex>
                             Exclude source paths by project-relative regex; repeatable
  --exclude-generated-marker <marker>
                             Exclude files with a leading generated-header marker; repeatable
  --use-default-exclusions[=true|false]
                             Enable generated-code defaults (default: true)
  --package-manager <tool>   Force auto, npm, pnpm, or yarn
  --test-runner <runner>     Force auto, vitest, or jest
  --format <format>          Emit ${REPORT_FORMAT_LIST} (default: toon)
  --agent                    Default primary output to --format toon --failures-only --omit-redundancy
  --failures-only[=true|false]
                             Emit failed methods only in the primary report
  --omit-redundancy[=true|false]
                             Omit redundant per-method status in the primary report
  --output <path>            Write the primary report to a file instead of stdout
  --junit-report <path>      Also write a full JUnit XML report for CI test-report UIs
  --threshold <number>       Override the CRAP threshold (default: 8.0)

Behavior:
  (no args)                  Analyze all TypeScript files under any nested src/ tree
  <file ...>                 Analyze explicit TypeScript files
  <directory ...>            Analyze TypeScript files under each directory's nested src/ tree
`;

export function usage(): string {
  return HELP_TEXT;
}

export function parseCliArguments(args: string[]): CliArguments {
  const state = createParseState();

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (!arg.startsWith("--")) {
      state.fileArgs.push(arg);
      continue;
    }
    index = consumeOption(state, args, index);
  }

  return finalizeCliArguments(state);
}

interface ParseState {
  help: boolean;
  changed: boolean;
  packageManager: PackageManagerSelection;
  testRunner: TestRunnerSelection;
  format: ReportFormat;
  threshold: number;
  agent: boolean;
  failuresOnly: boolean;
  omitRedundancy: boolean;
  output?: string;
  junit: boolean;
  junitReport?: string;
  packageManagerSeen: boolean;
  testRunnerSeen: boolean;
  formatSeen: boolean;
  thresholdSeen: boolean;
  agentSeen: boolean;
  failuresOnlySeen: boolean;
  omitRedundancySeen: boolean;
  outputSeen: boolean;
  junitReportSeen: boolean;
  useDefaultExclusionsSeen: boolean;
  fileArgs: string[];
  excludes: string[];
  excludePathRegexes: string[];
  excludeGeneratedMarkers: string[];
  useDefaultExclusions: boolean;
}

type OptionHandler = (state: ParseState, args: string[], index: number) => number;
type InlineBooleanOptionHandler = (state: ParseState, value: string | undefined) => void;

const OPTION_HANDLERS: Record<string, OptionHandler> = {
  "--help": (state, _args, index) => {
    state.help = true;
    return index;
  },
  "--changed": (state, _args, index) => {
    state.changed = true;
    return index;
  },
  "--agent": (state, _args, index) => {
    ensureOptionIsUnique(state.agentSeen, "--agent");
    state.agent = true;
    state.agentSeen = true;
    return index;
  },
  "--package-manager": (state, args, index) => {
    ensureOptionIsUnique(state.packageManagerSeen, "--package-manager");
    state.packageManager = parsePackageManagerSelection(args[index + 1]);
    state.packageManagerSeen = true;
    return index + 1;
  },
  "--test-runner": (state, args, index) => {
    ensureOptionIsUnique(state.testRunnerSeen, "--test-runner");
    state.testRunner = parseTestRunnerSelection(args[index + 1]);
    state.testRunnerSeen = true;
    return index + 1;
  },
  "--format": (state, args, index) => {
    ensureOptionIsUnique(state.formatSeen, "--format");
    state.format = parseReportFormat(args[index + 1]);
    state.formatSeen = true;
    return index + 1;
  },
  "--threshold": (state, args, index) => {
    ensureOptionIsUnique(state.thresholdSeen, "--threshold");
    state.threshold = parseThreshold(args[index + 1]);
    state.thresholdSeen = true;
    return index + 1;
  },
  "--output": (state, args, index) => {
    ensureOptionIsUnique(state.outputSeen, "--output");
    state.output = parsePathOption(args[index + 1], "--output");
    state.outputSeen = true;
    return index + 1;
  },
  "--junit-report": (state, args, index) => {
    ensureOptionIsUnique(state.junitReportSeen, "--junit-report");
    state.junit = true;
    state.junitReport = parsePathOption(args[index + 1], "--junit-report");
    state.junitReportSeen = true;
    return index + 1;
  },
  "--exclude": (state, args, index) => {
    state.excludes.push(parsePathOption(args[index + 1], "--exclude"));
    return index + 1;
  },
  "--exclude-path-regex": (state, args, index) => {
    state.excludePathRegexes.push(parseRequiredOption(args[index + 1], "--exclude-path-regex", "regex"));
    return index + 1;
  },
  "--exclude-generated-marker": (state, args, index) => {
    state.excludeGeneratedMarkers.push(parseRequiredOption(args[index + 1], "--exclude-generated-marker", "marker"));
    return index + 1;
  }
};

const INLINE_BOOLEAN_OPTION_HANDLERS: Record<string, InlineBooleanOptionHandler> = {
  "--failures-only": parseFailuresOnly,
  "--omit-redundancy": parseOmitRedundancy,
  "--use-default-exclusions": parseUseDefaultExclusions
};
const INLINE_VALUE_OPTIONS = new Set([
  "--package-manager",
  "--test-runner",
  "--format",
  "--threshold",
  "--output",
  "--junit-report",
  "--exclude",
  "--exclude-path-regex",
  "--exclude-generated-marker"
]);

function createParseState(): ParseState {
  return {
    help: false,
    changed: false,
    packageManager: "auto",
    testRunner: "auto",
    format: "toon",
    threshold: CRAP_THRESHOLD,
    agent: false,
    failuresOnly: false,
    omitRedundancy: false,
    output: undefined,
    junit: false,
    junitReport: undefined,
    packageManagerSeen: false,
    testRunnerSeen: false,
    formatSeen: false,
    thresholdSeen: false,
    agentSeen: false,
    failuresOnlySeen: false,
    omitRedundancySeen: false,
    outputSeen: false,
    junitReportSeen: false,
    useDefaultExclusionsSeen: false,
    fileArgs: [],
    excludes: [],
    excludePathRegexes: [],
    excludeGeneratedMarkers: [],
    useDefaultExclusions: true
  };
}

function consumeOption(state: ParseState, args: string[], index: number): number {
  const [option, value] = splitInlineOption(args[index]);
  const inlineBooleanHandler = INLINE_BOOLEAN_OPTION_HANDLERS[option];
  if (inlineBooleanHandler) {
    inlineBooleanHandler(state, value);
    return index;
  }

  const handler = requiredOptionHandler(option, args[index]);
  if (value === undefined) {
    return handler(state, args, index);
  }
  return consumeInlineValueOption(state, args, index, option, value, handler);
}

function requiredOptionHandler(option: string, rawArg: string): OptionHandler {
  const handler = OPTION_HANDLERS[option];
  if (!handler) {
    throw new Error(`Unknown option: ${rawArg}`);
  }
  return handler;
}

function consumeInlineValueOption(
  state: ParseState,
  args: string[],
  index: number,
  option: string,
  value: string,
  handler: OptionHandler
): number {
  if (!INLINE_VALUE_OPTIONS.has(option)) {
    throw new Error(`Unknown option: ${args[index]}`);
  }
  handler(state, inlineValueArgs(args, index, option, value), index);
  return index;
}

function ensureOptionIsUnique(seen: boolean, option: string): void {
  if (seen) {
    throw new Error(`${option} can only be provided once`);
  }
}

function finalizeCliArguments(state: ParseState): CliArguments {
  applyAgentDefaults(state);
  validateCliState(state);

  return {
    mode: cliMode(state),
    fileArgs: state.help ? [] : state.fileArgs,
    packageManager: state.packageManager,
    testRunner: state.testRunner,
    format: state.format,
    threshold: state.threshold,
    agent: state.agent,
    failuresOnly: state.failuresOnly,
    omitRedundancy: state.omitRedundancy,
    ...optionalPath("output", state.output),
    junit: state.junit,
    ...optionalPath("junitReport", state.junitReport),
    ...optionalArray("excludes", state.excludes),
    ...optionalArray("excludePathRegexes", state.excludePathRegexes),
    ...optionalArray("excludeGeneratedMarkers", state.excludeGeneratedMarkers),
    ...optionalBoolean("useDefaultExclusions", state.useDefaultExclusions, state.useDefaultExclusionsSeen)
  };
}

function applyAgentDefaults(state: ParseState): void {
  if (!state.agent) {
    return;
  }
  state.format = state.formatSeen ? state.format : "toon";
  state.failuresOnly = state.failuresOnlySeen ? state.failuresOnly : true;
  state.omitRedundancy = state.omitRedundancySeen ? state.omitRedundancy : true;
}

function validateCliState(state: ParseState): void {
  if (state.help) {
    return;
  }
  if (state.changed && state.fileArgs.length > 0) {
    throw new Error("--changed cannot be combined with file arguments");
  }
}

function cliMode(state: ParseState): CliArguments["mode"] {
  if (state.help) {
    return "help";
  }
  if (state.changed) {
    return "changed";
  }
  return state.fileArgs.length > 0 ? "explicit" : "all";
}

function optionalPath<K extends "output" | "junitReport">(key: K, value: string | undefined): Pick<CliArguments, K> | {} {
  return value === undefined ? {} : { [key]: value } as Pick<CliArguments, K>;
}

function parsePackageManagerSelection(value: string | undefined): PackageManagerSelection {
  if (!value) {
    throw new Error("--package-manager requires one of: auto, npm, pnpm, yarn");
  }
  if (value === "auto" || value === "npm" || value === "pnpm" || value === "yarn") {
    return value;
  }
  throw new Error("--package-manager requires one of: auto, npm, pnpm, yarn");
}

function parseTestRunnerSelection(value: string | undefined): TestRunnerSelection {
  if (!value) {
    throw new Error("--test-runner requires one of: auto, vitest, jest");
  }
  if (value === "auto" || value === "vitest" || value === "jest") {
    return value;
  }
  throw new Error("--test-runner requires one of: auto, vitest, jest");
}

function parseReportFormat(value: string | undefined): ReportFormat {
  if (value && isReportFormat(value)) {
    return value;
  }
  throw new Error(REPORT_FORMAT_ERROR);
}

function isReportFormat(value: string): value is ReportFormat {
  return (REPORT_FORMATS as readonly string[]).includes(value);
}

function parseThreshold(value: string | undefined): number {
  if (!value) {
    throw new Error("--threshold requires a finite number greater than 0");
  }
  try {
    return validateThreshold(Number(value));
  } catch {
    throw new Error("--threshold requires a finite number greater than 0");
  }
}

function splitInlineOption(arg: string): [string, string | undefined] {
  const [option, ...values] = arg.split("=");
  return [option, values.length === 0 ? undefined : values.join("=")];
}

function inlineValueArgs(args: string[], index: number, option: string, value: string): string[] {
  const normalized = [...args];
  normalized[index] = option;
  normalized[index + 1] = value;
  return normalized;
}

function parseFailuresOnly(state: ParseState, value: string | undefined): void {
  ensureOptionIsUnique(state.failuresOnlySeen, "--failures-only");
  state.failuresOnly = parseBooleanOption(value, "--failures-only");
  state.failuresOnlySeen = true;
}

function parseOmitRedundancy(state: ParseState, value: string | undefined): void {
  ensureOptionIsUnique(state.omitRedundancySeen, "--omit-redundancy");
  state.omitRedundancy = parseBooleanOption(value, "--omit-redundancy");
  state.omitRedundancySeen = true;
}

function parseUseDefaultExclusions(state: ParseState, value: string | undefined): void {
  ensureOptionIsUnique(state.useDefaultExclusionsSeen, "--use-default-exclusions");
  state.useDefaultExclusions = parseBooleanOption(value, "--use-default-exclusions");
  state.useDefaultExclusionsSeen = true;
}

function parseBooleanOption(value: string | undefined, option: string): boolean {
  if (value === undefined) {
    return true;
  }
  if (value === "true") {
    return true;
  }
  if (value === "false") {
    return false;
  }
  throw new Error(`${option} requires true or false when a value is provided`);
}

function parsePathOption(value: string | undefined, option: string): string {
  return parseRequiredOption(value, option, "path");
}

function parseRequiredOption(value: string | undefined, option: string, valueName: string): string {
  if (!value) {
    throw new Error(`${option} requires a ${valueName}`);
  }
  return value;
}

function optionalArray<K extends "excludes" | "excludePathRegexes" | "excludeGeneratedMarkers">(
  key: K,
  values: string[]
): Pick<CliArguments, K> | {} {
  return values.length === 0 ? {} : { [key]: values } as Pick<CliArguments, K>;
}

function optionalBoolean<K extends "useDefaultExclusions">(
  key: K,
  value: boolean,
  include: boolean
): Pick<CliArguments, K> | {} {
  return include ? { [key]: value } as Pick<CliArguments, K> : {};
}

export async function runCli(
  args: string[],
  projectRoot = process.cwd(),
  stdout: Writer = process.stdout,
  stderr: Writer = process.stderr
): Promise<number> {
  const parsed = parseCliInputs(args, stdout, stderr);
  if (typeof parsed === "number") {
    return parsed;
  }
  if (parsed.mode === "help") {
    writeLine(stdout, usage());
    return 0;
  }

  try {
    await validateCliReportPaths(parsed, projectRoot);
  } catch (error) {
    writeLine(stderr, (error as Error).message);
    return 1;
  }

  return handleCliResult(await analyzeCliProject(parsed, projectRoot, stdout, stderr), parsed, projectRoot, stdout, stderr);
}

function parseCliInputs(args: string[], stdout: Writer, stderr: Writer): CliArguments | number {
  try {
    return parseCliArguments(args);
  } catch (error) {
    writeLine(stderr, (error as Error).message);
    writeLine(stdout, usage());
    return 1;
  }
}

async function analyzeCliProject(
  parsed: CliArguments,
  projectRoot: string,
  stdout: Writer,
  stderr: Writer
) {
  try {
    return await analyzeProject({
      projectRoot: path.resolve(projectRoot),
      explicitPaths: parsed.mode === "explicit" ? parsed.fileArgs : [],
      changedOnly: parsed.mode === "changed",
      packageManager: parsed.packageManager,
      testRunner: parsed.testRunner,
      threshold: parsed.threshold,
      excludes: parsed.excludes,
      excludePathRegexes: parsed.excludePathRegexes,
      excludeGeneratedMarkers: parsed.excludeGeneratedMarkers,
      useDefaultExclusions: parsed.useDefaultExclusions,
      stdout,
      stderr
    });
  } catch (error) {
    writeLine(stderr, (error as Error).message);
    return null;
  }
}

async function handleCliResult(
  result: Awaited<ReturnType<typeof analyzeProject>> | null,
  parsed: CliArguments,
  projectRoot: string,
  stdout: Writer,
  stderr: Writer
): Promise<number> {
  if (!result) {
    return 1;
  }

  try {
    await writeCliReports(result, parsed, projectRoot, stdout);
  } catch (error) {
    writeLine(stderr, (error as Error).message);
    return 1;
  }

  return writeCliThresholdStatus(result, stderr);
}

async function writeCliReports(
  result: Awaited<ReturnType<typeof analyzeProject>>,
  parsed: CliArguments,
  projectRoot: string,
  stdout: Writer
): Promise<void> {
  const primaryReport = formatAnalysisReport(result.metrics, {
    format: parsed.format,
    agent: parsed.agent,
    threshold: result.threshold,
    failuresOnly: parsed.failuresOnly,
    omitRedundancy: parsed.omitRedundancy,
    sourceExclusionAudit: result.sourceExclusionAudit
  });
  if (parsed.output) {
    await writeReportFile(projectRoot, parsed.output, primaryReport);
  } else if (primaryReport.length > 0) {
    stdout.write(primaryReport);
  }

  if (parsed.junit && parsed.junitReport) {
    await writeReportFile(projectRoot, parsed.junitReport, formatAnalysisReport(result.metrics, {
      format: "junit",
      threshold: result.threshold,
      sourceExclusionAudit: result.sourceExclusionAudit
    }));
  }
}

async function validateCliReportPaths(parsed: CliArguments, projectRoot: string): Promise<void> {
  await validateReportPathTargets(projectRoot, [
    { label: "--output", path: parsed.output },
    { label: "--junit-report", path: parsed.junit ? parsed.junitReport : undefined }
  ]);
}

async function writeReportFile(projectRoot: string, reportPath: string, content: string): Promise<void> {
  const absolutePath = path.resolve(projectRoot, reportPath);
  await mkdir(path.dirname(absolutePath), { recursive: true });
  await writeFile(absolutePath, content);
}

function writeCliThresholdStatus(
  result: Awaited<ReturnType<typeof analyzeProject>>,
  stderr: Writer
): number {
  if (!result.thresholdExceeded) {
    return 0;
  }
  writeLine(stderr, `CRAP threshold exceeded: ${formatNumber(result.maxCrap)} > ${formatNumber(result.threshold)}`);
  return 2;
}

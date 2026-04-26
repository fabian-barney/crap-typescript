import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

import { CRAP_THRESHOLD } from "./constants.js";
import { analyzeProject } from "./analyzeProject.js";
import { formatAnalysisReport } from "./report.js";
import { formatNumber, writeLine } from "./utils.js";
import type { CliArguments, PackageManagerSelection, ReportFormat, TestRunnerSelection, Writer } from "./types.js";

const HELP_TEXT = `crap-typescript

Usage:
  crap-typescript [--help]
  crap-typescript [--changed] [--package-manager <tool>] [--test-runner <runner>] [--format <format>] [--agent] [--output <path>] [--junit-report <path>]
  crap-typescript [--package-manager <tool>] [--test-runner <runner>] [--format <format>] [--agent] [--output <path>] [--junit-report <path>] <path ...>

Options:
  --help                     Print usage to stdout
  --changed                  Analyze changed TypeScript files under src/
  --package-manager <tool>   Force auto, npm, pnpm, or yarn
  --test-runner <runner>     Force auto, vitest, or jest
  --format <format>          Emit toon, json, text, or junit (default: toon)
  --agent                    Emit only overall status and failed methods for toon, json, or text
  --output <path>            Write the primary report to a file instead of stdout
  --junit-report <path>      Also write a full JUnit XML report for CI test-report UIs

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
  agent: boolean;
  outputPath?: string;
  junitReportPath?: string;
  packageManagerSeen: boolean;
  testRunnerSeen: boolean;
  formatSeen: boolean;
  agentSeen: boolean;
  outputPathSeen: boolean;
  junitReportPathSeen: boolean;
  fileArgs: string[];
}

type OptionHandler = (state: ParseState, args: string[], index: number) => number;

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
  "--output": (state, args, index) => {
    ensureOptionIsUnique(state.outputPathSeen, "--output");
    state.outputPath = parsePathOption(args[index + 1], "--output");
    state.outputPathSeen = true;
    return index + 1;
  },
  "--junit-report": (state, args, index) => {
    ensureOptionIsUnique(state.junitReportPathSeen, "--junit-report");
    state.junitReportPath = parsePathOption(args[index + 1], "--junit-report");
    state.junitReportPathSeen = true;
    return index + 1;
  }
};

function createParseState(): ParseState {
  return {
    help: false,
    changed: false,
    packageManager: "auto",
    testRunner: "auto",
    format: "toon",
    agent: false,
    outputPath: undefined,
    junitReportPath: undefined,
    packageManagerSeen: false,
    testRunnerSeen: false,
    formatSeen: false,
    agentSeen: false,
    outputPathSeen: false,
    junitReportPathSeen: false,
    fileArgs: []
  };
}

function consumeOption(state: ParseState, args: string[], index: number): number {
  const handler = OPTION_HANDLERS[args[index]];
  if (!handler) {
    throw new Error(`Unknown option: ${args[index]}`);
  }
  return handler(state, args, index);
}

function ensureOptionIsUnique(seen: boolean, option: string): void {
  if (seen) {
    throw new Error(`${option} can only be provided once`);
  }
}

function finalizeCliArguments(state: ParseState): CliArguments {
  validateCliState(state);

  return {
    mode: cliMode(state),
    fileArgs: state.help ? [] : state.fileArgs,
    packageManager: state.packageManager,
    testRunner: state.testRunner,
    format: state.format,
    agent: state.agent,
    ...optionalPath("outputPath", state.outputPath),
    ...optionalPath("junitReportPath", state.junitReportPath)
  };
}

function validateCliState(state: ParseState): void {
  if (state.help) {
    return;
  }
  if (state.changed && state.fileArgs.length > 0) {
    throw new Error("--changed cannot be combined with file arguments");
  }
  if (state.agent && state.format === "junit") {
    throw new Error("--agent cannot be combined with --format junit");
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

function optionalPath<K extends "outputPath" | "junitReportPath">(key: K, value: string | undefined): Pick<CliArguments, K> | {} {
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
  if (!value) {
    throw new Error("--format requires one of: toon, json, text, junit");
  }
  if (value === "toon" || value === "json" || value === "text" || value === "junit") {
    return value;
  }
  throw new Error("--format requires one of: toon, json, text, junit");
}

function parsePathOption(value: string | undefined, option: string): string {
  if (!value) {
    throw new Error(`${option} requires a path`);
  }
  return value;
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
    await writeCliReports(result.metrics, parsed, projectRoot, stdout);
  } catch (error) {
    writeLine(stderr, (error as Error).message);
    return 1;
  }

  return writeCliThresholdStatus(result, stderr);
}

async function writeCliReports(
  metrics: Awaited<ReturnType<typeof analyzeProject>>["metrics"],
  parsed: CliArguments,
  projectRoot: string,
  stdout: Writer
): Promise<void> {
  const primaryReport = formatAnalysisReport(metrics, {
    format: parsed.format,
    agent: parsed.agent
  });
  if (parsed.outputPath) {
    await writeReportFile(projectRoot, parsed.outputPath, primaryReport);
  } else {
    stdout.write(primaryReport);
  }

  if (parsed.junitReportPath) {
    await writeReportFile(projectRoot, parsed.junitReportPath, formatAnalysisReport(metrics, { format: "junit" }));
  }
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
  writeLine(stderr, `CRAP threshold exceeded: ${formatNumber(result.maxCrap)} > ${formatNumber(CRAP_THRESHOLD)}`);
  return 2;
}

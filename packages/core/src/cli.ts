import path from "node:path";

import { CRAP_THRESHOLD, NO_ANALYZABLE_FUNCTIONS_MESSAGE, NO_FILES_MESSAGE } from "./constants";
import { analyzeProject } from "./analyzeProject";
import { formatReport } from "./report";
import { formatNumber, writeLine } from "./utils";
import type { CliArguments, PackageManagerSelection, TestRunnerSelection, Writer } from "./types";

const HELP_TEXT = `crap-typescript

Usage:
  crap-typescript [--help]
  crap-typescript [--changed] [--package-manager <tool>] [--test-runner <runner>] [--coverage-report-path <path>]
  crap-typescript [--package-manager <tool>] [--test-runner <runner>] [--coverage-report-path <path>] <path ...>

Options:
  --help                     Print usage to stdout
  --changed                  Analyze changed TypeScript files under src/
  --package-manager <tool>   Force auto, npm, pnpm, or yarn
  --test-runner <runner>     Force auto, vitest, jest, or karma
  --coverage-report-path <path>
                             Reuse or generate a custom Istanbul JSON coverage report path

Behavior:
  (no args)                  Analyze all TypeScript files under any nested src/ tree
  <file ...>                 Analyze explicit TypeScript files
  <directory ...>            Analyze TypeScript files under each directory's nested src/ tree
`;

export function usage(): string {
  return HELP_TEXT;
}

export function parseCliArguments(args: string[]): CliArguments {
  if (args.length === 0) {
    return {
      mode: "all",
      fileArgs: [],
      packageManager: "auto",
      testRunner: "auto"
    };
  }

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
  coverageReportPath?: string;
  packageManagerSeen: boolean;
  testRunnerSeen: boolean;
  coverageReportPathSeen: boolean;
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
  "--coverage-report-path": (state, args, index) => {
    ensureOptionIsUnique(state.coverageReportPathSeen, "--coverage-report-path");
    state.coverageReportPath = parseCoverageReportPath(args[index + 1]);
    state.coverageReportPathSeen = true;
    return index + 1;
  }
};

function createParseState(): ParseState {
  return {
    help: false,
    changed: false,
    packageManager: "auto",
    testRunner: "auto",
    coverageReportPath: undefined,
    packageManagerSeen: false,
    testRunnerSeen: false,
    coverageReportPathSeen: false,
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
  if (state.help) {
    return {
      mode: "help",
      fileArgs: [],
      packageManager: state.packageManager,
      testRunner: state.testRunner,
      ...coverageReportPathArgument(state)
    };
  }
  if (state.changed && state.fileArgs.length > 0) {
    throw new Error("--changed cannot be combined with file arguments");
  }
  return {
    mode: state.changed ? "changed" : state.fileArgs.length > 0 ? "explicit" : "all",
    fileArgs: state.fileArgs,
    packageManager: state.packageManager,
    testRunner: state.testRunner,
    ...coverageReportPathArgument(state)
  };
}

function coverageReportPathArgument(state: ParseState): Pick<CliArguments, "coverageReportPath"> {
  return state.coverageReportPath === undefined ? {} : { coverageReportPath: state.coverageReportPath };
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
    throw new Error("--test-runner requires one of: auto, vitest, jest, karma");
  }
  if (value === "auto" || value === "vitest" || value === "jest" || value === "karma") {
    return value;
  }
  throw new Error("--test-runner requires one of: auto, vitest, jest, karma");
}

function parseCoverageReportPath(value: string | undefined): string {
  if (!value) {
    throw new Error("--coverage-report-path requires a path");
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

  return handleCliResult(await analyzeCliProject(parsed, projectRoot, stdout, stderr), stdout, stderr);
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
      coverageReportPath: parsed.coverageReportPath,
      stdout,
      stderr
    });
  } catch (error) {
    writeLine(stderr, (error as Error).message);
    return null;
  }
}

function handleCliResult(
  result: Awaited<ReturnType<typeof analyzeProject>> | null,
  stdout: Writer,
  stderr: Writer
): number {
  if (!result) {
    return 1;
  }

  const earlyExit = writeCliEarlyExit(result, stdout);
  if (earlyExit !== null) {
    return earlyExit;
  }

  writeLine(stdout, formatReport(result.metrics));
  return writeCliThresholdStatus(result, stderr);
}

function writeCliEarlyExit(
  result: Awaited<ReturnType<typeof analyzeProject>>,
  stdout: Writer
): number | null {
  if (result.selectedFiles.length === 0) {
    writeLine(stdout, NO_FILES_MESSAGE);
    return 0;
  }
  if (result.metrics.length === 0) {
    writeLine(stdout, NO_ANALYZABLE_FUNCTIONS_MESSAGE);
    return 0;
  }
  return null;
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

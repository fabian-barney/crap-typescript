import path from "node:path";

import { CRAP_THRESHOLD, NO_ANALYZABLE_FUNCTIONS_MESSAGE, NO_FILES_MESSAGE } from "./constants";
import { analyzeProject } from "./analyzeProject";
import { formatReport } from "./report";
import { formatNumber, writeLine } from "./utils";
import type { CliArguments, PackageManagerSelection, TestRunnerSelection, Writer } from "./types";

const HELP_TEXT = `crap-typescript

Usage:
  crap-typescript [--help]
  crap-typescript [--changed] [--package-manager <tool>] [--test-runner <runner>]
  crap-typescript [--package-manager <tool>] [--test-runner <runner>] <path ...>

Options:
  --help                     Print usage to stdout
  --changed                  Analyze changed TypeScript files under src/
  --package-manager <tool>   Force auto, npm, pnpm, or yarn
  --test-runner <runner>     Force auto, vitest, or jest

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

  let help = false;
  let changed = false;
  let packageManager: PackageManagerSelection = "auto";
  let testRunner: TestRunnerSelection = "auto";
  let packageManagerSeen = false;
  let testRunnerSeen = false;
  const fileArgs: string[] = [];

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    switch (arg) {
      case "--help":
        help = true;
        break;
      case "--changed":
        changed = true;
        break;
      case "--package-manager":
        if (packageManagerSeen) {
          throw new Error("--package-manager can only be provided once");
        }
        packageManager = parsePackageManagerSelection(args[++index]);
        packageManagerSeen = true;
        break;
      case "--test-runner":
        if (testRunnerSeen) {
          throw new Error("--test-runner can only be provided once");
        }
        testRunner = parseTestRunnerSelection(args[++index]);
        testRunnerSeen = true;
        break;
      default:
        if (arg.startsWith("--")) {
          throw new Error(`Unknown option: ${arg}`);
        }
        fileArgs.push(arg);
        break;
    }
  }

  if (help) {
    return {
      mode: "help",
      fileArgs: [],
      packageManager,
      testRunner
    };
  }
  if (changed && fileArgs.length > 0) {
    throw new Error("--changed cannot be combined with file arguments");
  }
  return {
    mode: changed ? "changed" : fileArgs.length > 0 ? "explicit" : "all",
    fileArgs,
    packageManager,
    testRunner
  };
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

export async function runCli(
  args: string[],
  projectRoot = process.cwd(),
  stdout: Writer = process.stdout,
  stderr: Writer = process.stderr
): Promise<number> {
  let parsed: CliArguments;
  try {
    parsed = parseCliArguments(args);
  } catch (error) {
    writeLine(stderr, (error as Error).message);
    writeLine(stdout, usage());
    return 1;
  }

  if (parsed.mode === "help") {
    writeLine(stdout, usage());
    return 0;
  }

  let result;
  try {
    result = await analyzeProject({
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
    return 1;
  }

  if (result.selectedFiles.length === 0) {
    writeLine(stdout, NO_FILES_MESSAGE);
    return 0;
  }
  if (result.metrics.length === 0) {
    writeLine(stdout, NO_ANALYZABLE_FUNCTIONS_MESSAGE);
    return 0;
  }

  writeLine(stdout, formatReport(result.metrics));
  if (result.thresholdExceeded) {
    writeLine(stderr, `CRAP threshold exceeded: ${formatNumber(result.maxCrap)} > ${formatNumber(CRAP_THRESHOLD)}`);
    return 2;
  }
  return 0;
}

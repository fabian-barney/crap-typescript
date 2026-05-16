import { access, readFile } from "node:fs/promises";
import path from "node:path";

import { COVERAGE_REPORT_RELATIVE_PATH } from "./constants.js";
import { isAbsolutePath, isWithinOrEqual } from "./utils.js";
import type { PackageManager, PackageManagerSelection, TestRunner, TestRunnerSelection } from "./types.js";

export interface CoverageSource {
  reportPath: string;
  sourceRoot: string;
}

export async function resolveModuleRoot(projectRoot: string, filePath: string): Promise<string> {
  let current = path.dirname(filePath);
  const normalizedProjectRoot = path.resolve(projectRoot);
  while (isWithinOrEqual(current, normalizedProjectRoot)) {
    if (await exists(path.join(current, "package.json"))) {
      return current;
    }
    if (current === normalizedProjectRoot) {
      break;
    }
    const parent = path.dirname(current);
    if (parent === current) {
      break;
    }
    current = parent;
  }
  return normalizedProjectRoot;
}

export async function locateCoverageReport(
  projectRoot: string,
  moduleRoot: string,
  coverageReportPath = COVERAGE_REPORT_RELATIVE_PATH
): Promise<CoverageSource | null> {
  const moduleReportPath = resolveCoveragePath(moduleRoot, coverageReportPath);
  if (await exists(moduleReportPath)) {
    return {
      reportPath: moduleReportPath,
      sourceRoot: moduleRoot
    };
  }

  const projectReportPath = resolveCoveragePath(projectRoot, coverageReportPath);
  if (await exists(projectReportPath)) {
    return {
      reportPath: projectReportPath,
      sourceRoot: projectRoot
    };
  }
  return null;
}

export async function resolvePackageManager(
  selection: PackageManagerSelection,
  projectRoot: string,
  moduleRoot: string
): Promise<PackageManager> {
  if (selection !== "auto") {
    return selection;
  }
  return await detectPackageManagerAtRoot(moduleRoot) ??
    await detectPackageManagerAtRoot(projectRoot) ??
    "npm";
}

export async function resolveTestRunner(
  selection: TestRunnerSelection,
  projectRoot: string,
  moduleRoot: string
): Promise<TestRunner> {
  if (selection !== "auto") {
    return selection;
  }

  const detected = await detectTestRunnerAtRoot(moduleRoot) ??
    await detectTestRunnerAtRoot(projectRoot);
  if (detected) {
    return detected;
  }

  throw new Error(`Unable to detect a test runner from ${path.join(moduleRoot, "package.json")}`);
}

async function detectPackageManagerAtRoot(root: string): Promise<PackageManager | null> {
  for (const [packageManager, lockfiles] of PACKAGE_MANAGER_LOCKFILES) {
    if (await anyExists(root, lockfiles)) {
      return packageManager;
    }
  }
  return null;
}

const PACKAGE_MANAGER_LOCKFILES: [PackageManager, string[]][] = [
  ["pnpm", ["pnpm-lock.yaml"]],
  ["yarn", ["yarn.lock"]],
  ["npm", ["package-lock.json", "npm-shrinkwrap.json"]]
];
const ENVIRONMENT_COMMAND_WRAPPERS = new Set(["cross-env", "cross-env-shell", "dotenv", "env-cmd"]);
const SCRIPT_COMMAND_WRAPPERS = new Set(["npx", "pnpm", "yarn", "bun", "node"]);
const PACKAGE_MANAGER_RUN_SUBCOMMANDS = new Set(["exec", "run"]);
const NPM_RUN_SUBCOMMANDS = new Set(["exec", "x"]);
const ENVIRONMENT_WRAPPER_OPTIONS_WITH_VALUE = new Set(["-e", "-f", "--environments", "--file"]);
const WRAPPER_OPTIONS_WITH_VALUE = new Set([
  "-c",
  "-p",
  "-r",
  "--call",
  "--cwd",
  "--dir",
  "--experimental-loader",
  "--filter",
  "--import",
  "--loader",
  "--package",
  "--require",
  "--shell",
  "--workspace"
]);
const SHELL_TOKEN_PATTERN = /(?:[^\s'"]+|"[^"]*"|'[^']*')+/g;
const QUOTED_SHELL_TOKEN_PART_PATTERN = /"([^"]*)"|'([^']*)'/g;

async function detectTestRunnerAtRoot(root: string): Promise<TestRunner | null> {
  const packageJson = await readPackageJson(root);
  if (!packageJson) {
    return null;
  }

  return detectRunnerFromScripts(packageJson.scripts ?? {}) ??
    detectRunnerFromDependencies(packageJson);
}

interface PackageJsonShape {
  dependencies?: Record<string, string>;
  devDependencies?: Record<string, string>;
  peerDependencies?: Record<string, string>;
  scripts?: Record<string, string>;
}

function detectRunnerFromScripts(scripts: Record<string, string>): TestRunner | null {
  return detectSingleRunner(Object.values(scripts), matchesScriptRunner);
}

function detectRunnerFromDependencies(packageJson: PackageJsonShape): TestRunner | null {
  const dependencyFields = [packageJson.dependencies, packageJson.devDependencies, packageJson.peerDependencies];
  return detectSingleRunner(
    dependencyFields.flatMap((field) => field ? Object.keys(field) : []),
    matchesDependencyRunner
  );
}

function detectSingleRunner(candidates: string[], matcher: (candidate: string, runner: TestRunner) => boolean): TestRunner | null {
  const hasVitest = candidates.some((candidate) => matcher(candidate, "vitest"));
  const hasJest = candidates.some((candidate) => matcher(candidate, "jest"));
  if (hasVitest === hasJest) {
    return null;
  }
  return hasVitest ? "vitest" : "jest";
}

function matchesScriptRunner(script: string, runner: TestRunner): boolean {
  return scriptExecutableNames(script).some((executableName) => executableName === runner);
}

function matchesDependencyRunner(dependencyName: string, runner: TestRunner): boolean {
  return runner === "vitest"
    ? dependencyName === "vitest"
    : dependencyName === "jest" || dependencyName === "ts-jest";
}

function scriptExecutableNames(script: string): string[] {
  return splitShellCommandSegments(script)
    .map(tokenizeShellWords)
    .map(resolveScriptExecutableName)
    .filter((name): name is string => name !== null);
}

function splitShellCommandSegments(script: string): string[] {
  return script.split(/&&|\|\||[;|]/).map((segment) => segment.trim()).filter(Boolean);
}

function tokenizeShellWords(segment: string): string[] {
  return segment.match(SHELL_TOKEN_PATTERN)?.map(unquoteShellTokenParts) ?? [];
}

function unquoteShellTokenParts(token: string): string {
  return token.replace(
    QUOTED_SHELL_TOKEN_PART_PATTERN,
    (_match, doubleQuoted: string | undefined, singleQuoted: string | undefined) => doubleQuoted ?? singleQuoted ?? ""
  );
}

function resolveScriptExecutableName(tokens: string[]): string | null {
  const commandIndex = firstCommandTokenIndex(tokens);
  if (commandIndex === null) {
    return null;
  }
  return executableNameFromRunnerToken(tokens[runnerTokenIndex(tokens, commandIndex)]);
}

function executableNameFromRunnerToken(token: string | undefined): string {
  const commandToken = token?.includes(" ") === true
    ? tokenizeShellWords(token)[0]
    : token;
  return executableBaseName(commandToken);
}

function runnerTokenIndex(tokens: string[], commandIndex: number): number {
  const commandName = executableBaseName(tokens[commandIndex]);
  if (ENVIRONMENT_COMMAND_WRAPPERS.has(commandName)) {
    return environmentWrapperRunnerTokenIndex(tokens, commandIndex);
  }
  if (commandName === "npm") {
    return npmRunnerTokenIndex(tokens, commandIndex);
  }
  if (commandName === "pnpm" || commandName === "yarn") {
    return packageManagerRunnerTokenIndex(tokens, commandIndex);
  }
  return SCRIPT_COMMAND_WRAPPERS.has(commandName)
    ? skipWrapperOptions(tokens, commandIndex + 1)
    : commandIndex;
}

function environmentWrapperRunnerTokenIndex(tokens: string[], commandIndex: number): number {
  const runnerIndex = skipEnvironmentWrapperOptions(tokens, commandIndex + 1);
  return skipEnvironmentAssignments(tokens, runnerIndex);
}

function skipEnvironmentWrapperOptions(tokens: string[], startIndex: number): number {
  let index = startIndex;
  while (isSkippableWrapperToken(tokens[index])) {
    index += environmentWrapperOptionWidth(tokens[index]);
  }
  return index;
}

function environmentWrapperOptionWidth(token: string): number {
  return ENVIRONMENT_WRAPPER_OPTIONS_WITH_VALUE.has(token) ? 2 : 1;
}

function skipEnvironmentAssignments(tokens: string[], startIndex: number): number {
  let index = startIndex;
  while (isEnvironmentAssignment(tokens[index] ?? "")) {
    index += 1;
  }
  return index;
}

function npmRunnerTokenIndex(tokens: string[], commandIndex: number): number {
  const subcommandIndex = skipWrapperOptions(tokens, commandIndex + 1);
  return NPM_RUN_SUBCOMMANDS.has(tokens[subcommandIndex] ?? "")
    ? skipWrapperOptions(tokens, subcommandIndex + 1)
    : commandIndex;
}

function packageManagerRunnerTokenIndex(tokens: string[], commandIndex: number): number {
  const runnerIndex = skipWrapperOptions(tokens, commandIndex + 1);
  const subcommand = tokens[runnerIndex] ?? "";
  return PACKAGE_MANAGER_RUN_SUBCOMMANDS.has(subcommand)
    ? skipWrapperOptions(tokens, runnerIndex + 1)
    : runnerIndex;
}

function skipWrapperOptions(tokens: string[], startIndex: number): number {
  let index = startIndex;
  while (isSkippableWrapperToken(tokens[index])) {
    index += optionWidth(tokens[index]);
  }
  return index;
}

function isSkippableWrapperToken(token: string | undefined): token is string {
  return token === "--" || token?.startsWith("-") === true;
}

function optionWidth(token: string): number {
  return WRAPPER_OPTIONS_WITH_VALUE.has(token) ? 2 : 1;
}

function firstCommandTokenIndex(tokens: string[]): number | null {
  const index = tokens.findIndex((token) => !isEnvironmentAssignment(token));
  return index === -1 ? null : index;
}

function isEnvironmentAssignment(token: string): boolean {
  return /^[A-Za-z_][A-Za-z0-9_]*=/.test(token);
}

function executableBaseName(token: string | undefined): string {
  return path.basename(token?.replace(/\\/g, "/") ?? "").replace(/\.(?:cmd|ps1|bat|exe)$/i, "");
}

async function readPackageJson(root: string): Promise<PackageJsonShape | null> {
  const packageJsonPath = path.join(root, "package.json");
  if (!(await exists(packageJsonPath))) {
    return null;
  }
  const raw = await readFile(packageJsonPath, "utf8");
  return parsePackageJson(packageJsonPath, raw);
}

function parsePackageJson(packageJsonPath: string, content: string): PackageJsonShape {
  try {
    return JSON.parse(content) as PackageJsonShape;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`Package manifest at ${packageJsonPath} could not be parsed: ${message}`);
  }
}

async function exists(filePath: string): Promise<boolean> {
  try {
    await access(filePath);
    return true;
  } catch {
    return false;
  }
}

async function anyExists(root: string, fileNames: string[]): Promise<boolean> {
  for (const fileName of fileNames) {
    if (await exists(path.join(root, fileName))) {
      return true;
    }
  }
  return false;
}

function resolveCoveragePath(root: string, coverageReportPath: string): string {
  return isAbsolutePath(coverageReportPath)
    ? coverageReportPath
    : path.join(root, coverageReportPath);
}

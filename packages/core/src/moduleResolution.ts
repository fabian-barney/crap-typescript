import { access, readFile } from "node:fs/promises";
import path from "node:path";

import { COVERAGE_REPORT_RELATIVE_PATH } from "./constants";
import { isAbsolutePath } from "./utils";
import type { PackageManager, PackageManagerSelection, TestRunner, TestRunnerSelection } from "./types";

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
  return detectSingleRunner(Object.values(scripts).join("\n"));
}

function detectRunnerFromDependencies(packageJson: PackageJsonShape): TestRunner | null {
  const dependencyFields = [packageJson.dependencies, packageJson.devDependencies, packageJson.peerDependencies];
  const dependencyNames = dependencyFields
    .flatMap((field) => field ? Object.keys(field) : [])
    .join("\n");
  return detectSingleRunner(dependencyNames);
}

function detectSingleRunner(text: string): TestRunner | null {
  const hasVitest = /\bvitest\b/.test(text);
  const hasJest = /\bjest\b/.test(text) || /\bts-jest\b/.test(text);
  const hasKarma = /\bkarma\b/.test(text);
  const detected: TestRunner[] = [];
  if (hasVitest) {
    detected.push("vitest");
  }
  if (hasJest) {
    detected.push("jest");
  }
  if (hasKarma) {
    detected.push("karma");
  }
  return detected.length === 1 ? detected[0] : null;
}

async function readPackageJson(root: string): Promise<PackageJsonShape | null> {
  const packageJsonPath = path.join(root, "package.json");
  if (!(await exists(packageJsonPath))) {
    return null;
  }
  const raw = await readFile(packageJsonPath, "utf8");
  return JSON.parse(raw) as PackageJsonShape;
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

function isWithinOrEqual(candidate: string, root: string): boolean {
  const relative = path.relative(root, candidate);
  return relative === "" || (!relative.startsWith("..") && !path.isAbsolute(relative));
}

function resolveCoveragePath(root: string, coverageReportPath: string): string {
  return isAbsolutePath(coverageReportPath)
    ? coverageReportPath
    : path.join(root, coverageReportPath);
}

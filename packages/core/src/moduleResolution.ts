import { access, readFile } from "node:fs/promises";
import path from "node:path";

import { COVERAGE_REPORT_RELATIVE_PATH } from "./constants";
import type { PackageManager, PackageManagerSelection, TestRunner, TestRunnerSelection } from "./types";

export interface CoverageSource {
  lcovPath: string;
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
  moduleRoot: string
): Promise<CoverageSource | null> {
  const moduleReportPath = path.join(moduleRoot, COVERAGE_REPORT_RELATIVE_PATH);
  if (await exists(moduleReportPath)) {
    return {
      lcovPath: moduleReportPath,
      sourceRoot: moduleRoot
    };
  }

  const projectReportPath = path.join(projectRoot, COVERAGE_REPORT_RELATIVE_PATH);
  if (await exists(projectReportPath)) {
    return {
      lcovPath: projectReportPath,
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
  for (const root of [moduleRoot, projectRoot]) {
    if (await exists(path.join(root, "pnpm-lock.yaml"))) {
      return "pnpm";
    }
    if (await exists(path.join(root, "yarn.lock"))) {
      return "yarn";
    }
    if (await exists(path.join(root, "package-lock.json")) || await exists(path.join(root, "npm-shrinkwrap.json"))) {
      return "npm";
    }
  }
  return "npm";
}

export async function resolveTestRunner(
  selection: TestRunnerSelection,
  projectRoot: string,
  moduleRoot: string
): Promise<TestRunner> {
  if (selection !== "auto") {
    return selection;
  }

  for (const root of [moduleRoot, projectRoot]) {
    const packageJson = await readPackageJson(root);
    if (!packageJson) {
      continue;
    }
    const dependencyFields = [packageJson.dependencies, packageJson.devDependencies, packageJson.peerDependencies];
    if (dependencyFields.some((field) => field && "vitest" in field)) {
      return "vitest";
    }
    if (dependencyFields.some((field) => field && ("jest" in field || "ts-jest" in field))) {
      return "jest";
    }
    const scripts = packageJson.scripts ?? {};
    const scriptText = Object.values(scripts).join("\n");
    if (/\bvitest\b/.test(scriptText)) {
      return "vitest";
    }
    if (/\bjest\b/.test(scriptText)) {
      return "jest";
    }
  }

  throw new Error(`Unable to detect a test runner from ${path.join(moduleRoot, "package.json")}`);
}

interface PackageJsonShape {
  dependencies?: Record<string, string>;
  devDependencies?: Record<string, string>;
  peerDependencies?: Record<string, string>;
  scripts?: Record<string, string>;
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

function isWithinOrEqual(candidate: string, root: string): boolean {
  const relative = path.relative(root, candidate);
  return relative === "" || (!relative.startsWith("..") && !path.isAbsolute(relative));
}


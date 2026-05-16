import { access, mkdtemp, realpath, rm, stat, writeFile } from "node:fs/promises";
import path from "node:path";

import { isWithinOrEqual } from "./utils.js";

export interface ReportPathTarget {
  label: string;
  path: string | undefined;
}

interface ResolvedReportPathTarget {
  label: string;
  path: string;
  absolutePath: string;
  collisionPath: string;
}

type FilesystemCaseCache = Map<string, boolean>;

export async function validateReportPathTargets(
  projectRoot: string,
  targets: ReportPathTarget[]
): Promise<void> {
  const reportTargets = targets.filter((target): target is { label: string; path: string } => (
    target.path !== undefined
  ));
  const shouldCheckCaseCollisions = reportTargets.length > 1;
  const filesystemCaseCache: FilesystemCaseCache = new Map();
  const canonicalProjectRoot = await realpath(projectRoot);
  const resolvedTargets = await Promise.all(
    reportTargets.map((target) => (
      resolveReportPathTarget(projectRoot, canonicalProjectRoot, target, shouldCheckCaseCollisions, filesystemCaseCache)
    ))
  );

  for (let leftIndex = 0; leftIndex < resolvedTargets.length; leftIndex += 1) {
    for (let rightIndex = leftIndex + 1; rightIndex < resolvedTargets.length; rightIndex += 1) {
      ensureDistinctReportPaths(resolvedTargets[leftIndex], resolvedTargets[rightIndex]);
    }
  }
}

async function resolveReportPathTarget(
  projectRoot: string,
  canonicalProjectRoot: string,
  target: { label: string; path: string },
  shouldCheckCaseCollisions: boolean,
  filesystemCaseCache: FilesystemCaseCache
): Promise<ResolvedReportPathTarget> {
  const absolutePath = path.resolve(projectRoot, target.path);
  if (isFilesystemRoot(absolutePath)) {
    throw new Error(`${target.label} must target a report file, not a filesystem root`);
  }

  const stats = await statIfExists(absolutePath);
  if (stats?.isDirectory()) {
    throw new Error(`${target.label} must target a report file, not an existing directory`);
  }

  const canonicalPath = await canonicalizeReportPath(absolutePath);
  ensureReportPathInsideProjectRoot(target.label, canonicalPath, canonicalProjectRoot);
  const caseInsensitiveFilesystem = shouldCheckCaseCollisions
    ? await caseInsensitiveFilesystemForTarget(absolutePath, filesystemCaseCache)
    : false;

  return {
    label: target.label,
    path: target.path,
    absolutePath,
    collisionPath: normalizeReportPathForCollision(canonicalPath, caseInsensitiveFilesystem)
  };
}

function ensureReportPathInsideProjectRoot(label: string, filePath: string, projectRoot: string): void {
  if (isWithinOrEqual(filePath, projectRoot)) {
    return;
  }
  throw new Error(`${label} must target a report file inside the project root`);
}

async function caseInsensitiveFilesystemForTarget(
  absolutePath: string,
  filesystemCaseCache: FilesystemCaseCache
): Promise<boolean> {
  const parent = await nearestExistingParent(path.dirname(absolutePath));
  const cached = filesystemCaseCache.get(parent);
  if (cached !== undefined) {
    return cached;
  }
  const caseInsensitiveFilesystem = await isCaseInsensitiveFilesystem(parent);
  filesystemCaseCache.set(parent, caseInsensitiveFilesystem);
  return caseInsensitiveFilesystem;
}

async function statIfExists(filePath: string): Promise<Awaited<ReturnType<typeof stat>> | undefined> {
  try {
    return await stat(filePath);
  } catch (error) {
    if (isMissingPathError(error)) {
      return undefined;
    }
    throw error;
  }
}

function isMissingPathError(error: unknown): boolean {
  return errorCode(error) === "ENOENT";
}

function errorCode(error: unknown): string | undefined {
  if (typeof error !== "object" || error === null || !("code" in error)) {
    return undefined;
  }
  const code = (error as { code?: unknown }).code;
  return typeof code === "string" ? code : undefined;
}

async function canonicalizeReportPath(filePath: string): Promise<string> {
  try {
    return await realpath(filePath);
  } catch (error) {
    if (!isMissingPathError(error)) {
      throw error;
    }
    return path.join(await canonicalizeExistingParent(path.dirname(filePath)), path.basename(filePath));
  }
}

async function canonicalizeExistingParent(directoryPath: string): Promise<string> {
  try {
    return await realpath(directoryPath);
  } catch (error) {
    if (!isMissingPathError(error)) {
      throw error;
    }
    const parent = path.dirname(directoryPath);
    if (parent === directoryPath) {
      return directoryPath;
    }
    return path.join(await canonicalizeExistingParent(parent), path.basename(directoryPath));
  }
}

async function nearestExistingParent(directoryPath: string): Promise<string> {
  const stats = await statIfExists(directoryPath);
  if (stats?.isDirectory()) {
    return realpath(directoryPath);
  }
  const parent = path.dirname(directoryPath);
  if (parent === directoryPath) {
    return directoryPath;
  }
  return nearestExistingParent(parent);
}

function normalizeReportPathForCollision(filePath: string, caseInsensitiveFilesystem: boolean): string {
  const normalized = path.normalize(filePath);
  return caseInsensitiveFilesystem ? normalized.toLowerCase() : normalized;
}

async function isCaseInsensitiveFilesystem(projectRoot: string): Promise<boolean> {
  const probeDirectory = await createCaseProbeDirectory(projectRoot);
  if (probeDirectory === undefined) {
    return defaultCaseInsensitiveFilesystem();
  }

  try {
    const probeFile = path.join(probeDirectory, "crap-typescript-case-probe");
    await writeFile(probeFile, "");
    await access(path.join(probeDirectory, "CRAP-TYPESCRIPT-CASE-PROBE"));
    return true;
  } catch (error) {
    return isMissingPathError(error) ? false : defaultCaseInsensitiveFilesystem();
  } finally {
    await rm(probeDirectory, { force: true, recursive: true });
  }
}

function defaultCaseInsensitiveFilesystem(): boolean {
  return process.platform === "win32" || process.platform === "darwin";
}

async function createCaseProbeDirectory(projectRoot: string): Promise<string | undefined> {
  try {
    return await mkdtemp(path.join(projectRoot, ".crap-typescript-case-"));
  } catch {
    return undefined;
  }
}

function isFilesystemRoot(filePath: string): boolean {
  const parsed = path.parse(filePath);
  return path.resolve(filePath) === parsed.root;
}

function ensureDistinctReportPaths(left: ResolvedReportPathTarget, right: ResolvedReportPathTarget): void {
  if (left.collisionPath !== right.collisionPath) {
    return;
  }
  throw new Error(
    `${left.label} and ${right.label} must target different report files: ${left.path} and ${right.path}`
  );
}

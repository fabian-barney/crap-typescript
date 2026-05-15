import { lstat, realpath } from "node:fs/promises";
import path from "node:path";

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

export async function validateReportPathTargets(
  projectRoot: string,
  targets: ReportPathTarget[]
): Promise<void> {
  const resolvedTargets = await Promise.all(
    targets
      .filter((target): target is { label: string; path: string } => target.path !== undefined)
      .map((target) => resolveReportPathTarget(projectRoot, target))
  );

  for (let leftIndex = 0; leftIndex < resolvedTargets.length; leftIndex += 1) {
    for (let rightIndex = leftIndex + 1; rightIndex < resolvedTargets.length; rightIndex += 1) {
      ensureDistinctReportPaths(resolvedTargets[leftIndex], resolvedTargets[rightIndex]);
    }
  }
}

async function resolveReportPathTarget(
  projectRoot: string,
  target: { label: string; path: string }
): Promise<ResolvedReportPathTarget> {
  const absolutePath = path.resolve(projectRoot, target.path);
  if (isFilesystemRoot(absolutePath)) {
    throw new Error(`${target.label} must target a report file, not a filesystem root`);
  }

  const stats = await lstatIfExists(absolutePath);
  if (stats?.isDirectory()) {
    throw new Error(`${target.label} must target a report file, not an existing directory`);
  }

  return {
    label: target.label,
    path: target.path,
    absolutePath,
    collisionPath: normalizeReportPathForCollision(await canonicalizeReportPath(absolutePath))
  };
}

async function lstatIfExists(filePath: string): Promise<Awaited<ReturnType<typeof lstat>> | undefined> {
  try {
    return await lstat(filePath);
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

function normalizeReportPathForCollision(filePath: string): string {
  const normalized = path.normalize(filePath);
  return isCaseInsensitivePlatform() ? normalized.toLowerCase() : normalized;
}

function isCaseInsensitivePlatform(): boolean {
  return process.platform === "win32";
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

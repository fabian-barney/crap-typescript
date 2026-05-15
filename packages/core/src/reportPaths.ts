import { access, mkdtemp, realpath, rm, stat, writeFile } from "node:fs/promises";
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
  const reportTargets = targets.filter((target): target is { label: string; path: string } => (
    target.path !== undefined
  ));
  const caseInsensitiveFilesystem = reportTargets.length > 1
    ? await isCaseInsensitiveFilesystem(projectRoot)
    : false;
  const resolvedTargets = await Promise.all(
    reportTargets.map((target) => resolveReportPathTarget(projectRoot, target, caseInsensitiveFilesystem))
  );

  for (let leftIndex = 0; leftIndex < resolvedTargets.length; leftIndex += 1) {
    for (let rightIndex = leftIndex + 1; rightIndex < resolvedTargets.length; rightIndex += 1) {
      ensureDistinctReportPaths(resolvedTargets[leftIndex], resolvedTargets[rightIndex]);
    }
  }
}

async function resolveReportPathTarget(
  projectRoot: string,
  target: { label: string; path: string },
  caseInsensitiveFilesystem: boolean
): Promise<ResolvedReportPathTarget> {
  const absolutePath = path.resolve(projectRoot, target.path);
  if (isFilesystemRoot(absolutePath)) {
    throw new Error(`${target.label} must target a report file, not a filesystem root`);
  }

  const stats = await statIfExists(absolutePath);
  if (stats?.isDirectory()) {
    throw new Error(`${target.label} must target a report file, not an existing directory`);
  }

  return {
    label: target.label,
    path: target.path,
    absolutePath,
    collisionPath: normalizeReportPathForCollision(await canonicalizeReportPath(absolutePath), caseInsensitiveFilesystem)
  };
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

function normalizeReportPathForCollision(filePath: string, caseInsensitiveFilesystem: boolean): string {
  const normalized = path.normalize(filePath);
  return caseInsensitiveFilesystem ? normalized.toLowerCase() : normalized;
}

async function isCaseInsensitiveFilesystem(projectRoot: string): Promise<boolean> {
  const probeDirectory = await createCaseProbeDirectory(projectRoot);
  if (probeDirectory === undefined) {
    return process.platform === "win32";
  }

  try {
    const probeFile = path.join(probeDirectory, "crap-typescript-case-probe");
    await writeFile(probeFile, "");
    await access(path.join(probeDirectory, "CRAP-TYPESCRIPT-CASE-PROBE"));
    return true;
  } catch {
    return false;
  } finally {
    await rm(probeDirectory, { force: true, recursive: true });
  }
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

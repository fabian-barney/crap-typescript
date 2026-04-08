import { readdir, stat } from "node:fs/promises";
import path from "node:path";

import { IGNORED_DIRECTORIES } from "./constants";
import { runCommand, toRelativePath } from "./utils";

const ANALYZABLE_EXTENSIONS = [".ts", ".tsx"];
const TEST_FILE_MARKERS = [".test.", ".spec."];
const EXCLUDED_PATH_SEGMENTS = ["/__tests__/", "/dist/", "/coverage/", "/node_modules/"];

export async function findAllTypeScriptFilesUnderSourceRoots(projectRoot: string): Promise<string[]> {
  const files = new Set<string>();
  await walkForSourceRoots(projectRoot, async (sourceRoot) => {
    await walkSourceTree(sourceRoot, async (filePath) => {
      files.add(path.resolve(filePath));
    });
  });
  return Array.from(files).sort();
}

export async function expandExplicitPaths(
  projectRoot: string,
  values: string[]
): Promise<string[]> {
  const files = new Set<string>();
  for (const value of values) {
    const resolvedPath = path.resolve(projectRoot, value);
    const fileStats = await stat(resolvedPath);
    if (fileStats.isDirectory()) {
      await expandDirectoryPath(resolvedPath, files);
      continue;
    }
    if (isAnalyzableFile(resolvedPath)) {
      files.add(resolvedPath);
    }
  }
  return Array.from(files).sort();
}

export async function changedTypeScriptFilesUnderSourceRoots(projectRoot: string): Promise<string[]> {
  const result = await runCommand("git", ["status", "--porcelain", "-z"], projectRoot);
  if (result.exitCode !== 0) {
    throw new Error(result.stderr.trim() || "git status --porcelain failed");
  }
  return Array.from(collectChangedFilesFromStatus(projectRoot, result.stdout.split("\0"))).sort();
}

export function isAnalyzableFile(filePath: string): boolean {
  const normalized = toRelativePath(path.parse(filePath).root, filePath).toLowerCase();
  const baseName = path.basename(normalized);
  if (!hasAnySuffix(normalized, ANALYZABLE_EXTENSIONS)) {
    return false;
  }
  if (normalized.endsWith(".d.ts")) {
    return false;
  }
  if (containsAny(baseName, TEST_FILE_MARKERS)) {
    return false;
  }
  if (containsAny(normalized, EXCLUDED_PATH_SEGMENTS)) {
    return false;
  }
  return true;
}

interface GitStatusEntry {
  status: string;
  pathValue: string;
}

function parseGitStatusEntry(entry: string): GitStatusEntry | null {
  if (!entry) {
    return null;
  }
  return {
    status: entry.slice(0, 2),
    pathValue: entry.slice(3)
  };
}

function collectChangedFile(projectRoot: string, entry: GitStatusEntry, files: Set<string>): void {
  if (!isIncludedGitStatus(entry.status)) {
    return;
  }
  const resolvedPath = path.resolve(projectRoot, entry.pathValue);
  if (isAnalyzableFile(resolvedPath) && isUnderSourceTree(projectRoot, resolvedPath)) {
    files.add(resolvedPath);
  }
}

function collectChangedFilesFromStatus(projectRoot: string, entries: string[]): Set<string> {
  const files = new Set<string>();
  for (let index = 0; index < entries.length; index += 1) {
    const entry = parseGitStatusEntry(entries[index]);
    if (!entry) {
      continue;
    }
    collectChangedFile(projectRoot, entry, files);
    if (isRenameOrCopyStatus(entry.status)) {
      index += 1;
    }
  }
  return files;
}

function isUnderSourceTree(projectRoot: string, filePath: string): boolean {
  const relative = toRelativePath(projectRoot, filePath).toLowerCase();
  return relative.includes("/src/") || relative.startsWith("src/");
}

function isIncludedGitStatus(status: string): boolean {
  if (status === "??") {
    return true;
  }
  return !status.includes("D") && /[AMRCU]/.test(status);
}

function isRenameOrCopyStatus(status: string): boolean {
  return status.includes("R") || status.includes("C");
}

function containsAny(value: string, fragments: string[]): boolean {
  return fragments.some((fragment) => value.includes(fragment));
}

function hasAnySuffix(value: string, suffixes: string[]): boolean {
  return suffixes.some((suffix) => value.endsWith(suffix));
}

async function walkForSourceRoots(
  currentDir: string,
  onSourceRoot: (sourceRoot: string) => Promise<void>
): Promise<void> {
  const entries = await readdir(currentDir, { withFileTypes: true });
  for (const entry of entries) {
    if (!entry.isDirectory()) {
      continue;
    }
    if (IGNORED_DIRECTORIES.has(entry.name)) {
      continue;
    }
    const absolutePath = path.join(currentDir, entry.name);
    if (entry.name === "src") {
      await onSourceRoot(absolutePath);
      continue;
    }
    await walkForSourceRoots(absolutePath, onSourceRoot);
  }
}

async function walkSourceTree(
  currentDir: string,
  onFile: (filePath: string) => Promise<void>
): Promise<void> {
  const entries = await readdir(currentDir, { withFileTypes: true });
  for (const entry of entries) {
    const absolutePath = path.join(currentDir, entry.name);
    if (entry.isDirectory()) {
      if (IGNORED_DIRECTORIES.has(entry.name)) {
        continue;
      }
      await walkSourceTree(absolutePath, onFile);
      continue;
    }
    if (entry.isFile() && isAnalyzableFile(absolutePath)) {
      await onFile(absolutePath);
    }
  }
}

async function expandDirectoryPath(directoryPath: string, files: Set<string>): Promise<void> {
  if (path.basename(directoryPath).toLowerCase() === "src") {
    await walkSourceTree(directoryPath, async (filePath) => {
      files.add(path.resolve(filePath));
    });
    return;
  }

  await walkForSourceRoots(directoryPath, async (sourceRoot) => {
    await walkSourceTree(sourceRoot, async (filePath) => {
      files.add(path.resolve(filePath));
    });
  });
}

import { cp, mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { spawn } from "node:child_process";
import os from "node:os";
import path from "node:path";

export class StringWriter {
  chunks: string[] = [];

  write(chunk: string): void {
    this.chunks.push(chunk);
  }

  toString(): string {
    return this.chunks.join("");
  }
}

export async function createTempDir(prefix: string): Promise<string> {
  return mkdtemp(path.join(os.tmpdir(), prefix));
}

export async function disposeTempDir(tempDir: string): Promise<void> {
  await rm(tempDir, { recursive: true, force: true });
}

export async function copyFixture(name: string): Promise<string> {
  const tempDir = await createTempDir(`crap-typescript-${name}-`);
  const sourceDir = path.join(process.cwd(), "tests", "fixtures", name);
  await cp(sourceDir, tempDir, { recursive: true });
  return tempDir;
}

export async function writeProjectFiles(
  rootDir: string,
  files: Record<string, string>
): Promise<void> {
  for (const [relativePath, content] of Object.entries(files)) {
    const targetPath = path.join(rootDir, relativePath);
    await mkdir(path.dirname(targetPath), { recursive: true });
    await writeFile(targetPath, content);
  }
}

export async function runProcess(
  command: string,
  args: string[],
  cwd: string
): Promise<{ exitCode: number; stdout: string; stderr: string }> {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd,
      stdio: ["ignore", "pipe", "pipe"]
    });
    let stdout = "";
    let stderr = "";

    child.stdout.on("data", (chunk) => {
      stdout += chunk.toString();
    });
    child.stderr.on("data", (chunk) => {
      stderr += chunk.toString();
    });
    child.on("error", reject);
    child.on("close", (exitCode) => {
      resolve({
        exitCode: exitCode ?? 1,
        stdout,
        stderr
      });
    });
  });
}

export async function initGitRepository(rootDir: string): Promise<void> {
  await runProcess("git", ["init", "-b", "main"], rootDir);
  await runProcess("git", ["config", "user.email", "test@example.com"], rootDir);
  await runProcess("git", ["config", "user.name", "Test User"], rootDir);
}

export function repoPath(...parts: string[]): string {
  return path.join(process.cwd(), ...parts);
}

export async function readText(filePath: string): Promise<string> {
  return readFile(filePath, "utf8");
}


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
  const safeName = name.replace(/[\\/]/g, "-");
  const tempDir = await createTempDir(`crap-typescript-${safeName}-`);
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

export function mixedCoverageProjectFiles(): Record<string, string> {
  return {
    "src/sample.ts": `export function safe(value: number): number {
  return value + 1;
}

export function risky(flagA: boolean, flagB: boolean): number {
  if (flagA && flagB) {
    return 1;
  }
  return 0;
}
`,
    "coverage/coverage-final.json": JSON.stringify({
      "src/sample.ts": {
        path: "src/sample.ts",
        statementMap: {
          "0": {
            start: { line: 2, column: 2 },
            end: { line: 2, column: 19 }
          },
          "1": {
            start: { line: 7, column: 4 },
            end: { line: 7, column: 13 }
          },
          "2": {
            start: { line: 9, column: 2 },
            end: { line: 9, column: 11 }
          }
        },
        fnMap: {},
        branchMap: {
          "0": {
            line: 6,
            type: "if",
            loc: {
              start: { line: 6, column: 2 },
              end: { line: 8, column: 3 }
            },
            locations: [
              {
                start: { line: 6, column: 2 },
                end: { line: 8, column: 3 }
              },
              {}
            ]
          },
          "1": {
            line: 6,
            type: "binary-expr",
            loc: {
              start: { line: 6, column: 6 },
              end: { line: 6, column: 31 }
            },
            locations: [
              {
                start: { line: 6, column: 6 },
                end: { line: 6, column: 20 }
              },
              {
                start: { line: 6, column: 24 },
                end: { line: 6, column: 29 }
              }
            ]
          }
        },
        s: {
          "0": 1,
          "1": 0,
          "2": 0
        },
        f: {},
        b: {
          "0": [0, 0],
          "1": [0, 0]
        }
      }
    })
  };
}

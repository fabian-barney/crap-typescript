import path from "node:path";
import { spawn } from "node:child_process";

import type { CoverageCommand, Writer } from "./types";

export function writeLine(writer: Writer | undefined, message: string): void {
  writer?.write(`${message}\n`);
}

export function normalizeSlashes(value: string): string {
  return value.replace(/\\/g, "/");
}

export function normalizePathForMatch(filePath: string): string {
  return normalizeSlashes(path.resolve(filePath)).toLowerCase();
}

export function toRelativePath(projectRoot: string, filePath: string): string {
  const relative = path.relative(projectRoot, filePath);
  return normalizeSlashes(relative || path.basename(filePath));
}

export async function runCommand(
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

export function formatNumber(value: number): string {
  return value.toFixed(1);
}

export function resolveScriptKind(filePath: string): "ts" | "tsx" {
  return filePath.toLowerCase().endsWith(".tsx") ? "tsx" : "ts";
}

export class DefaultCommandExecutor {
  async execute(command: CoverageCommand): Promise<number> {
    const result = await runCommand(command.command, command.args, command.cwd);
    return result.exitCode;
  }
}


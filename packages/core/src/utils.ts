import path from "node:path";
import { spawn } from "node:child_process";

import type { CoverageCommand, Writer } from "./types.js";

const DEFAULT_COMMAND_TIMEOUT_MS = 300_000;
const DEFAULT_COMMAND_MAX_BUFFER_BYTES = 10 * 1024 * 1024;

export interface RunCommandOptions {
  /** Defaults to 300 seconds. */
  timeoutMs?: number;
  /** Defaults to 10 MiB per stream. */
  maxBufferBytes?: number;
}

export function writeLine(writer: Writer | undefined, message: string): void {
  writer?.write(`${message}\n`);
}

export function normalizeSlashes(value: string): string {
  return value.replace(/\\/g, "/");
}

export function normalizePathForMatch(filePath: string): string {
  return normalizeSlashes(path.resolve(filePath)).toLowerCase();
}

export function isAbsolutePath(filePath: string): boolean {
  return path.isAbsolute(filePath) || path.win32.isAbsolute(filePath);
}

export function toRelativePath(projectRoot: string, filePath: string): string {
  const relative = path.relative(projectRoot, filePath);
  return normalizeSlashes(relative || path.basename(filePath));
}

export async function runCommand(
  command: string,
  args: string[],
  cwd: string,
  options: RunCommandOptions = {}
): Promise<{ exitCode: number; stdout: string; stderr: string }> {
  return new Promise((resolve, reject) => {
    const timeoutMs = options.timeoutMs ?? DEFAULT_COMMAND_TIMEOUT_MS;
    const maxBufferBytes = options.maxBufferBytes ?? DEFAULT_COMMAND_MAX_BUFFER_BYTES;
    const child = spawn(command, args, {
      cwd,
      stdio: ["ignore", "pipe", "pipe"]
    });
    const stdout = createBoundedOutput(maxBufferBytes);
    const stderr = createBoundedOutput(maxBufferBytes);
    let timedOut = false;
    let settled = false;
    const timeout = setTimeout(() => {
      timedOut = true;
      child.kill("SIGKILL");
    }, timeoutMs);

    child.stdout.on("data", (chunk) => {
      stdout.append(chunk);
    });
    child.stderr.on("data", (chunk) => {
      stderr.append(chunk);
    });
    child.on("error", (error) => {
      if (settled) {
        return;
      }
      settled = true;
      clearTimeout(timeout);
      reject(error);
    });
    child.on("close", (exitCode) => {
      if (settled) {
        return;
      }
      settled = true;
      clearTimeout(timeout);
      if (timedOut) {
        reject(new Error(`Command timed out after ${timeoutMs}ms: ${command} ${args.join(" ")}`));
        return;
      }
      resolve({
        exitCode: exitCode ?? 1,
        stdout: stdout.toString(),
        stderr: stderr.toString()
      });
    });
  });
}

function createBoundedOutput(maxBufferBytes: number): { append(chunk: Buffer): void; toString(): string } {
  const chunks: Buffer[] = [];
  let totalBytes = 0;
  let truncated = false;
  const limit = Math.max(0, maxBufferBytes);

  return {
    append(chunk) {
      const remainingBytes = limit - totalBytes;
      if (remainingBytes > 0) {
        const retained = chunk.byteLength > remainingBytes ? chunk.subarray(0, remainingBytes) : chunk;
        chunks.push(retained);
        totalBytes += retained.byteLength;
      }
      truncated ||= chunk.byteLength > remainingBytes;
    },
    toString() {
      const output = Buffer.concat(chunks, totalBytes).toString();
      return truncated ? `${output}\n[output truncated after ${limit} bytes]` : output;
    }
  };
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

import path from "node:path";
import { spawn } from "node:child_process";

import type { CoverageCommand, Writer } from "./types.js";

const DEFAULT_COMMAND_TIMEOUT_MS = 300_000;
const DEFAULT_COMMAND_MAX_BUFFER_BYTES = 10 * 1024 * 1024;
const COMMAND_TIMEOUT_ENV_VAR = "CRAP_TYPESCRIPT_COMMAND_TIMEOUT_MS";

export interface RunCommandOptions {
  /** Defaults to 300 seconds. Set 0 to disable the timeout. */
  timeoutMs?: number;
  /** Defaults to 10 MiB per stream. */
  maxBufferBytes?: number;
  /** Reject instead of returning partial stdout/stderr when either stream is truncated. */
  rejectOnTruncatedOutput?: boolean;
}

export interface RunCommandResult {
  exitCode: number;
  stdout: string;
  stderr: string;
  stdoutTruncated: boolean;
  stderrTruncated: boolean;
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

export function isWithinOrEqual(candidatePath: string, parentPath: string): boolean {
  const relative = path.relative(parentPath, candidatePath);
  return relative === "" ||
    (relative !== ".." && !relative.startsWith(`..${path.sep}`) && !path.isAbsolute(relative));
}

export async function runCommand(
  command: string,
  args: string[],
  cwd: string,
  options: RunCommandOptions = {}
): Promise<RunCommandResult> {
  return new Promise((resolve, reject) => {
    const timeoutMs = normalizeNonNegativeOption(options.timeoutMs, defaultCommandTimeoutMs());
    const maxBufferBytes = normalizeNonNegativeOption(options.maxBufferBytes, DEFAULT_COMMAND_MAX_BUFFER_BYTES);
    const child = spawn(command, args, {
      cwd,
      stdio: ["ignore", "pipe", "pipe"]
    });
    const stdout = createBoundedOutput(maxBufferBytes);
    const stderr = createBoundedOutput(maxBufferBytes);
    let settled = false;
    let timeout: ReturnType<typeof setTimeout> | undefined;
    const rejectOnce = (error: Error) => {
      if (settled) {
        return;
      }
      settled = true;
      clearCommandTimeout(timeout);
      reject(error);
    };
    if (timeoutMs > 0) {
      timeout = setTimeout(() => {
        child.kill("SIGKILL");
        rejectOnce(new Error(`Command timed out after ${timeoutMs}ms: ${formatCommandForMessage(command, args)}`));
      }, timeoutMs);
    }

    child.stdout.on("data", (chunk) => {
      stdout.append(chunk);
    });
    child.stderr.on("data", (chunk) => {
      stderr.append(chunk);
    });
    child.on("error", (error) => {
      rejectOnce(error);
    });
    child.on("close", (exitCode) => {
      if (settled) {
        return;
      }
      const stdoutResult = stdout.toResult();
      const stderrResult = stderr.toResult();
      if (options.rejectOnTruncatedOutput && (stdoutResult.truncated || stderrResult.truncated)) {
        rejectOnce(new Error(
          `Command output exceeded ${maxBufferBytes} bytes: ${formatCommandForMessage(command, args)}`
        ));
        return;
      }
      settled = true;
      clearCommandTimeout(timeout);
      resolve({
        exitCode: exitCode ?? 1,
        stdout: stdoutResult.output,
        stderr: stderrResult.output,
        stdoutTruncated: stdoutResult.truncated,
        stderrTruncated: stderrResult.truncated
      });
    });
  });
}

function defaultCommandTimeoutMs(): number {
  const configured = process.env[COMMAND_TIMEOUT_ENV_VAR]?.trim();
  if (configured === undefined || configured === "") {
    return DEFAULT_COMMAND_TIMEOUT_MS;
  }
  const parsed = Number(configured);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : DEFAULT_COMMAND_TIMEOUT_MS;
}

function normalizeNonNegativeOption(value: number | undefined, defaultValue: number): number {
  if (value === undefined || !Number.isFinite(value)) {
    return defaultValue;
  }
  return Math.max(0, value);
}

function clearCommandTimeout(timeout: ReturnType<typeof setTimeout> | undefined): void {
  if (timeout !== undefined) {
    clearTimeout(timeout);
  }
}

function createBoundedOutput(maxBufferBytes: number): {
  append(chunk: Buffer): void;
  toResult(): { output: string; truncated: boolean };
} {
  const limit = Math.max(0, maxBufferBytes);
  const chunks: Buffer[] = [];
  let byteLength = 0;
  let truncated = false;

  return {
    append(chunk) {
      const remainingBytes = limit - byteLength;
      if (remainingBytes > 0) {
        const bytesToCopy = Math.min(chunk.byteLength, remainingBytes);
        chunks.push(Buffer.from(chunk.subarray(0, bytesToCopy)));
        byteLength += bytesToCopy;
      }
      truncated ||= chunk.byteLength > remainingBytes;
    },
    toResult() {
      return {
        output: chunks.length > 0 ? Buffer.concat(chunks, byteLength).toString("utf8") : "",
        truncated
      };
    }
  };
}

export function formatCommandForMessage(command: string, args: string[]): string {
  return [command, ...args].map(quoteCommandArgument).join(" ");
}

function quoteCommandArgument(argument: string): string {
  if (/^[A-Za-z0-9_./:=@+-]+$/.test(argument)) {
    return argument;
  }
  return `"${argument.replace(/(["\\$`])/g, "\\$1")}"`;
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

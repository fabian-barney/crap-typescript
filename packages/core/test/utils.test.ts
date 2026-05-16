import { EventEmitter } from "node:events";
import { PassThrough } from "node:stream";

import { afterEach, describe, expect, it, vi } from "vitest";

import { runCommand } from "../src/utils";

afterEach(() => {
  vi.doUnmock("node:child_process");
  vi.resetModules();
});

describe("runCommand", () => {
  it("rejects when the command exceeds the timeout", async () => {
    await expect(
      runCommand(process.execPath, ["-e", "setTimeout(() => {}, 1000)"], process.cwd(), { timeoutMs: 50 })
    ).rejects.toThrow("Command timed out after 50ms");
  });

  it("rejects on timeout even when the child process does not close", async () => {
    vi.resetModules();
    const kill = vi.fn();
    vi.doMock("node:child_process", () => ({
      spawn: vi.fn(() => {
        const child = new EventEmitter() as EventEmitter & {
          stdout: PassThrough;
          stderr: PassThrough;
          kill: (signal: string) => boolean;
        };
        child.stdout = new PassThrough();
        child.stderr = new PassThrough();
        child.kill = kill.mockReturnValue(true);
        return child;
      })
    }));
    const { runCommand: runMockedCommand } = await import("../src/utils");

    await expect(
      runMockedCommand("never-closes", ["arg with space", 'quoted"value'], process.cwd(), { timeoutMs: 1 })
    ).rejects.toThrow('Command timed out after 1ms: never-closes "arg with space" "quoted\\"value"');
    expect(kill).toHaveBeenCalledWith("SIGKILL");
  });

  it("bounds captured stdout and stderr", async () => {
    const result = await runCommand(
      process.execPath,
      ["-e", "process.stdout.write('abcdef'); process.stderr.write('uvwxyz')"],
      process.cwd(),
      { maxBufferBytes: 3 }
    );

    expect(result.stdout).toBe("abc");
    expect(result.stderr).toBe("uvw");
    expect(result.stdoutTruncated).toBe(true);
    expect(result.stderrTruncated).toBe(true);
  });

  it("does not mutate bounded output with truncation markers", async () => {
    const emptyResult = await runCommand(
      process.execPath,
      ["-e", "process.stdout.write('abc')"],
      process.cwd(),
      { maxBufferBytes: 0 }
    );
    const newlineResult = await runCommand(
      process.execPath,
      ["-e", "process.stdout.write('abc\\ndef')"],
      process.cwd(),
      { maxBufferBytes: 4 }
    );

    expect(emptyResult.stdout).toBe("");
    expect(emptyResult.stdoutTruncated).toBe(true);
    expect(newlineResult.stdout).toBe("abc\n");
    expect(newlineResult.stdoutTruncated).toBe(true);
  });
});

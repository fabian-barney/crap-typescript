import { describe, expect, it } from "vitest";

import { runCommand } from "../src/utils";

describe("runCommand", () => {
  it("rejects when the command exceeds the timeout", async () => {
    await expect(
      runCommand(process.execPath, ["-e", "setTimeout(() => {}, 1000)"], process.cwd(), { timeoutMs: 50 })
    ).rejects.toThrow("Command timed out after 50ms");
  });

  it("bounds captured stdout and stderr", async () => {
    const result = await runCommand(
      process.execPath,
      ["-e", "process.stdout.write('abcdef'); process.stderr.write('uvwxyz')"],
      process.cwd(),
      { maxBufferBytes: 3 }
    );

    expect(result.stdout).toBe("abc\n[output truncated after 3 bytes]");
    expect(result.stderr).toBe("uvw\n[output truncated after 3 bytes]");
  });
});

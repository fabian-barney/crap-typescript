import { spawnSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";

const renderReleaseNotesScript = path.resolve(process.cwd(), "scripts/render-release-notes.mjs");

describe("render-release-notes", () => {
  it("selects the stable section after a prerelease section with the same base header", () => {
    const temporaryDirectory = mkdtempSync(path.join(tmpdir(), "render-release-notes-"));

    try {
      writeFileSync(
        path.join(temporaryDirectory, "CHANGELOG.md"),
        ["## [0.2.2] - prerelease", "", "prerelease notes", "", "## [0.2.2] - 2026-04-10", "", "stable notes", ""].join(
          "\n"
        )
      );

      const environment = { ...process.env };
      delete environment.GITHUB_REF_NAME;

      const result = spawnSync(process.execPath, [renderReleaseNotesScript, "0.2.2"], {
        cwd: temporaryDirectory,
        encoding: "utf8",
        env: environment
      });

      expect(result.status).toBe(0);
      expect(result.stderr).toBe("");
      expect(result.stdout).toBe("stable notes\n");
    } finally {
      rmSync(temporaryDirectory, { recursive: true, force: true });
    }
  });
});

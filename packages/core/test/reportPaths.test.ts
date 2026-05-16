import { afterEach, describe, expect, it, vi } from "vitest";

import { createTempDir, disposeTempDir } from "./testUtils";

const tempDirs: string[] = [];
const originalPlatform = Object.getOwnPropertyDescriptor(process, "platform");

afterEach(async () => {
  vi.doUnmock("node:fs/promises");
  vi.resetModules();
  restorePlatform();
  await Promise.all(tempDirs.splice(0).map(disposeTempDir));
});

describe("report path validation", () => {
  it("falls back to platform defaults when the case-sensitivity probe directory cannot be created", async () => {
    stubPlatform("win32");
    const projectRoot = await createTempDir("crap-report-paths-");
    tempDirs.push(projectRoot);
    await mockCaseProbeDirectoryCreationFailure();
    const { validateReportPathTargets } = await import("../src/reportPaths");

    await expect(validateReportPathTargets(projectRoot, collidingReportTargets())).rejects.toThrow(
      "--output and --junit-report must target different report files"
    );
  });

  it("falls back to platform defaults when the case-sensitivity probe fails unexpectedly", async () => {
    stubPlatform("win32");
    await mockCaseProbeAccessFailure("EACCES");
    const { validateReportPathTargets } = await import("../src/reportPaths");
    const projectRoot = await createTempDir("crap-report-paths-");
    tempDirs.push(projectRoot);

    await expect(validateReportPathTargets(projectRoot, collidingReportTargets())).rejects.toThrow(
      "--output and --junit-report must target different report files"
    );
  });

  it("treats a missing uppercase case-sensitivity probe as a case-sensitive result", async () => {
    stubPlatform("win32");
    await mockCaseProbeAccessFailure("ENOENT");
    const { validateReportPathTargets } = await import("../src/reportPaths");
    const projectRoot = await createTempDir("crap-report-paths-");
    tempDirs.push(projectRoot);

    await expect(validateReportPathTargets(projectRoot, collidingReportTargets())).resolves.toBeUndefined();
  });
});

async function mockCaseProbeDirectoryCreationFailure(): Promise<void> {
  const fsPromises = await vi.importActual<typeof import("node:fs/promises")>("node:fs/promises");
  vi.doMock("node:fs/promises", () => ({
    ...fsPromises,
    mkdtemp: vi.fn(async (prefix: string) => {
      if (prefix.includes(".crap-typescript-case-")) {
        throw Object.assign(new Error("probe directory failed"), { code: "EACCES" });
      }
      return fsPromises.mkdtemp(prefix);
    })
  }));
}

async function mockCaseProbeAccessFailure(code: string): Promise<void> {
  const fsPromises = await vi.importActual<typeof import("node:fs/promises")>("node:fs/promises");
  vi.doMock("node:fs/promises", () => ({
    ...fsPromises,
    access: vi.fn(async (filePath: string | Buffer | URL, mode?: number) => {
      if (String(filePath).includes("CRAP-TYPESCRIPT-CASE-PROBE")) {
        throw Object.assign(new Error("probe failed"), { code });
      }
      return fsPromises.access(filePath, mode);
    })
  }));
}

function collidingReportTargets(): Array<{ label: string; path: string }> {
  return [
    { label: "--output", path: "reports/CRAP.xml" },
    { label: "--junit-report", path: "reports/crap.xml" }
  ];
}

function stubPlatform(platform: NodeJS.Platform): void {
  Object.defineProperty(process, "platform", {
    configurable: true,
    enumerable: true,
    value: platform
  });
}

function restorePlatform(): void {
  if (originalPlatform === undefined) {
    return;
  }
  Object.defineProperty(process, "platform", originalPlatform);
}

import { writeFile } from "node:fs/promises";
import path from "node:path";

import { afterEach, describe, expect, it, vi } from "vitest";

import {
  changedTypeScriptFilesUnderSourceRoots,
  expandExplicitPaths,
  findAllTypeScriptFilesUnderSourceRoots,
  isAnalyzableFile
} from "../src/fileSelection";
import { createTempDir, disposeTempDir, initGitRepository, runProcess, writeProjectFiles } from "./testUtils";

const tempDirs: string[] = [];

afterEach(async () => {
  vi.doUnmock("../src/utils");
  vi.resetModules();
  await Promise.all(tempDirs.splice(0).map(disposeTempDir));
});

describe("file selection", () => {
  it("finds TypeScript files under nested src roots and ignores tests", async () => {
    const tempDir = await createTempDir("crap-files-");
    tempDirs.push(tempDir);
    await writeProjectFiles(tempDir, {
      "package.json": '{"name":"fixture","private":true}',
      "src/app.ts": "export const app = 1;",
      "src/app.spec.ts": "export const appSpec = 1;",
      "packages/demo/src/component.tsx": "export const Component = () => null;",
      "packages/demo/src/types.d.ts": "export interface Types {}",
      "packages/demo/__tests__/demo.test.ts": "export const demo = 1;"
    });

    const files = await findAllTypeScriptFilesUnderSourceRoots(tempDir);
    expect(files.map((file) => path.relative(tempDir, file).replace(/\\/g, "/"))).toEqual([
      "packages/demo/src/component.tsx",
      "src/app.ts"
    ]);
  });

  it("expands explicit files and directories", async () => {
    const tempDir = await createTempDir("crap-files-");
    tempDirs.push(tempDir);
    await writeProjectFiles(tempDir, {
      "package.json": '{"name":"fixture","private":true}',
      "packages/demo/src/component.ts": "export const component = 1;",
      "src/app.ts": "export const app = 1;"
    });

    const files = await expandExplicitPaths(tempDir, ["src/app.ts", "packages/demo"]);
    expect(files.map((file) => path.relative(tempDir, file).replace(/\\/g, "/"))).toEqual([
      "packages/demo/src/component.ts",
      "src/app.ts"
    ]);
  });

  it("expands a directory argument that is itself a src root", async () => {
    const tempDir = await createTempDir("crap-files-");
    tempDirs.push(tempDir);
    await writeProjectFiles(tempDir, {
      "package.json": '{"name":"fixture","private":true}',
      "src/app.ts": "export const app = 1;",
      "src/types.d.ts": "export interface Types {}"
    });

    const files = await expandExplicitPaths(tempDir, ["src"]);
    expect(files.map((file) => path.relative(tempDir, file).replace(/\\/g, "/"))).toEqual([
      "src/app.ts"
    ]);
  });

  it("recurses through nested src folders and skips ignored directories inside source trees", async () => {
    const tempDir = await createTempDir("crap-files-");
    tempDirs.push(tempDir);
    await writeProjectFiles(tempDir, {
      "package.json": '{"name":"fixture","private":true}',
      "src/app.ts": "export const app = 1;",
      "src/nested/util.ts": "export const util = 1;",
      "src/__tests__/ignored.ts": "export const ignored = 1;",
      "src/coverage/ignored.ts": "export const ignored = 1;",
      "src/dist/ignored.ts": "export const ignored = 1;",
      "src/node_modules/ignored.ts": "export const ignored = 1;"
    });

    const files = await findAllTypeScriptFilesUnderSourceRoots(tempDir);
    expect(files.map((file) => path.relative(tempDir, file).replace(/\\/g, "/"))).toEqual([
      "src/app.ts",
      "src/nested/util.ts"
    ]);
  });

  it("finds changed TypeScript files under src trees from git status", async () => {
    const tempDir = await createTempDir("crap-files-");
    tempDirs.push(tempDir);
    await initGitRepository(tempDir);
    await writeProjectFiles(tempDir, {
      "package.json": '{"name":"fixture","private":true}',
      "src/app.ts": "export const app = 1;\n",
      "test/app.test.ts": "export const testValue = 1;\n"
    });
    await runProcess("git", ["add", "."], tempDir);
    await runProcess("git", ["commit", "-m", "initial"], tempDir);

    await writeFile(path.join(tempDir, "src/app.ts"), "export const app = 2;\n", "utf8");
    await writeFile(path.join(tempDir, "src/new-file.ts"), "export const next = 3;\n", "utf8");
    await writeFile(path.join(tempDir, "test/app.test.ts"), "export const testValue = 2;\n", "utf8");

    const files = await changedTypeScriptFilesUnderSourceRoots(tempDir);
    expect(files.map((file) => path.relative(tempDir, file).replace(/\\/g, "/"))).toEqual([
      "src/app.ts",
      "src/new-file.ts"
    ]);
  });

  it("parses quoted git porcelain paths when changed files contain spaces", async () => {
    const tempDir = await createTempDir("crap-files-");
    tempDirs.push(tempDir);
    await initGitRepository(tempDir);
    await writeProjectFiles(tempDir, {
      "package.json": '{"name":"fixture","private":true}',
      "src/hello world.ts": "export const app = 1;\n"
    });
    await runProcess("git", ["add", "."], tempDir);
    await runProcess("git", ["commit", "-m", "initial"], tempDir);

    await writeFile(path.join(tempDir, "src", "hello world.ts"), "export const app = 2;\n", "utf8");

    const files = await changedTypeScriptFilesUnderSourceRoots(tempDir);
    expect(files.map((file) => path.relative(tempDir, file).replace(/\\/g, "/"))).toEqual([
      "src/hello world.ts"
    ]);
  });

  it("tracks renamed source files under src trees", async () => {
    const tempDir = await createTempDir("crap-files-");
    tempDirs.push(tempDir);
    await initGitRepository(tempDir);
    await writeProjectFiles(tempDir, {
      "package.json": '{"name":"fixture","private":true}',
      "src/old-name.ts": "export const app = 1;\n"
    });
    await runProcess("git", ["add", "."], tempDir);
    await runProcess("git", ["commit", "-m", "initial"], tempDir);

    await runProcess("git", ["mv", "src/old-name.ts", "src/new-name.ts"], tempDir);

    const files = await changedTypeScriptFilesUnderSourceRoots(tempDir);
    expect(files.map((file) => path.relative(tempDir, file).replace(/\\/g, "/"))).toEqual([
      "src/new-name.ts"
    ]);
  });

  it("filters declaration, test, dist, coverage, and node_modules paths from analyzable files", () => {
    expect(isAnalyzableFile("C:/repo/src/app.ts")).toBe(true);
    expect(isAnalyzableFile("C:/repo/src/component.tsx")).toBe(true);
    expect(isAnalyzableFile("C:/repo/src/types.d.ts")).toBe(false);
    expect(isAnalyzableFile("C:/repo/src/app.spec.ts")).toBe(false);
    expect(isAnalyzableFile("C:/repo/src/app.test.ts")).toBe(false);
    expect(isAnalyzableFile("C:/repo/src/__tests__/app.ts")).toBe(false);
    expect(isAnalyzableFile("C:/repo/dist/app.ts")).toBe(false);
    expect(isAnalyzableFile("C:/repo/coverage/app.ts")).toBe(false);
    expect(isAnalyzableFile("C:/repo/node_modules/pkg/index.ts")).toBe(false);
    expect(isAnalyzableFile("dist/app.ts")).toBe(false);
    expect(isAnalyzableFile("coverage/app.ts")).toBe(false);
    expect(isAnalyzableFile("node_modules/pkg/index.ts")).toBe(false);

    const filesystemRoot = path.parse(process.cwd()).root;
    expect(isAnalyzableFile(path.join(filesystemRoot, "dist", "app.ts"))).toBe(false);
    expect(isAnalyzableFile(path.join(filesystemRoot, "coverage", "app.ts"))).toBe(false);
    expect(isAnalyzableFile(path.join(filesystemRoot, "node_modules", "pkg", "index.ts"))).toBe(false);
  });

  it("ignores deleted and non-source changes and reports git errors clearly", async () => {
    const tempDir = await createTempDir("crap-files-");
    tempDirs.push(tempDir);
    await initGitRepository(tempDir);
    await writeProjectFiles(tempDir, {
      "package.json": '{"name":"fixture","private":true}',
      "src/app.ts": "export const app = 1;\n",
      "src/remove.ts": "export const removeMe = 1;\n",
      "docs/readme.ts": "export const docs = 1;\n"
    });
    await runProcess("git", ["add", "."], tempDir);
    await runProcess("git", ["commit", "-m", "initial"], tempDir);

    await writeFile(path.join(tempDir, "src/app.ts"), "export const app = 2;\n", "utf8");
    await writeFile(path.join(tempDir, "docs/readme.ts"), "export const docs = 2;\n", "utf8");
    await runProcess("git", ["rm", "src/remove.ts"], tempDir);

    const files = await changedTypeScriptFilesUnderSourceRoots(tempDir);
    expect(files.map((file) => path.relative(tempDir, file).replace(/\\/g, "/"))).toEqual([
      "src/app.ts"
    ]);

    const nonRepoDir = await createTempDir("crap-files-nonrepo-");
    tempDirs.push(nonRepoDir);
    await expect(changedTypeScriptFilesUnderSourceRoots(nonRepoDir)).rejects.toThrow("not a git repository");
  });

  it("requires complete git status output for changed-file parsing", async () => {
    vi.resetModules();
    const runCommand = vi.fn(async () => {
      throw new Error("Command output exceeded 1 bytes: git status --porcelain -z");
    });
    vi.doMock("../src/utils", async () => {
      const actual = await vi.importActual<typeof import("../src/utils")>("../src/utils");
      return {
        ...actual,
        runCommand
      };
    });
    const { changedTypeScriptFilesUnderSourceRoots: changedFiles } = await import("../src/fileSelection");

    await expect(changedFiles("repo")).rejects.toThrow("Command output exceeded 1 bytes");
    expect(runCommand).toHaveBeenCalledWith("git", ["status", "--porcelain", "-z"], "repo", {
      rejectOnTruncatedOutput: true
    });
  });
});

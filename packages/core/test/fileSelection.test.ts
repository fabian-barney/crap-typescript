import { writeFile } from "node:fs/promises";
import path from "node:path";

import { afterEach, describe, expect, it, vi } from "vitest";

import {
  changedTypeScriptFilesUnderSourceRoots,
  expandExplicitPaths,
  findAllTypeScriptFilesUnderSourceRoots,
  isAnalyzableFile
} from "../src/fileSelection";
import type * as UtilsModule from "../src/utils";
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
      "src/.next/ignored.ts": "export const ignored = 1;",
      "src/.vite/ignored.ts": "export const ignored = 1;",
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

  it("skips build-output roots during source-root discovery without excluding src/build source folders", async () => {
    const tempDir = await createTempDir("crap-files-");
    tempDirs.push(tempDir);
    await writeProjectFiles(tempDir, {
      "package.json": '{"name":"fixture","private":true}',
      "src/app.ts": "export const app = 1;",
      "src/build/handwritten.ts": "export const handwritten = 1;",
      "packages/demo/build/src/generated.ts": "export const generated = 1;",
      "packages/demo/out/src/generated.ts": "export const generated = 1;",
      "packages/demo/target/src/generated.ts": "export const generated = 1;",
      "packages/demo/.next/src/generated.ts": "export const generated = 1;",
      "packages/demo/.nuxt/src/generated.ts": "export const generated = 1;",
      "packages/demo/.svelte-kit/src/generated.ts": "export const generated = 1;",
      "packages/demo/.turbo/src/generated.ts": "export const generated = 1;",
      "packages/demo/.vite/src/generated.ts": "export const generated = 1;"
    });

    const files = await findAllTypeScriptFilesUnderSourceRoots(tempDir);
    expect(files.map((file) => path.relative(tempDir, file).replace(/\\/g, "/"))).toEqual([
      "src/app.ts",
      "src/build/handwritten.ts"
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

  it("filters declaration, test, and generated-output paths from analyzable files", () => {
    expect(isAnalyzableFile("C:/repo/src/app.ts")).toBe(true);
    expect(isAnalyzableFile("C:/repo/src/component.tsx")).toBe(true);
    expect(isAnalyzableFile("C:/repo/src/types.d.ts")).toBe(false);
    expect(isAnalyzableFile("C:/repo/src/app.spec.ts")).toBe(false);
    expect(isAnalyzableFile("C:/repo/src/app.test.ts")).toBe(false);
    expect(isAnalyzableFile("C:/repo/src/__tests__/app.ts")).toBe(false);
    expect(isAnalyzableFile("C:/repo/.next/app.ts")).toBe(false);
    expect(isAnalyzableFile("C:/repo/.nuxt/app.ts")).toBe(false);
    expect(isAnalyzableFile("C:/repo/.svelte-kit/app.ts")).toBe(false);
    expect(isAnalyzableFile("C:/repo/.turbo/app.ts")).toBe(false);
    expect(isAnalyzableFile("C:/repo/.vite/app.ts")).toBe(false);
    expect(isAnalyzableFile("C:/repo/dist/app.ts")).toBe(false);
    expect(isAnalyzableFile("C:/repo/coverage/app.ts")).toBe(false);
    expect(isAnalyzableFile("C:/repo/node_modules/pkg/index.ts")).toBe(false);
    expect(isAnalyzableFile(".next/app.ts")).toBe(false);
    expect(isAnalyzableFile(".nuxt/app.ts")).toBe(false);
    expect(isAnalyzableFile(".svelte-kit/app.ts")).toBe(false);
    expect(isAnalyzableFile(".turbo/app.ts")).toBe(false);
    expect(isAnalyzableFile(".vite/app.ts")).toBe(false);
    expect(isAnalyzableFile("dist/app.ts")).toBe(false);
    expect(isAnalyzableFile("coverage/app.ts")).toBe(false);
    expect(isAnalyzableFile("node_modules/pkg/index.ts")).toBe(false);

    const filesystemRoot = path.parse(process.cwd()).root;
    expect(isAnalyzableFile(path.join(filesystemRoot, "dist", "app.ts"))).toBe(false);
    expect(isAnalyzableFile(path.join(filesystemRoot, "coverage", "app.ts"))).toBe(false);
    expect(isAnalyzableFile(path.join(filesystemRoot, "node_modules", "pkg", "index.ts"))).toBe(false);
  });

  it("does not expand explicit build-output directories that would only contain generated source roots", async () => {
    const tempDir = await createTempDir("crap-files-");
    tempDirs.push(tempDir);
    await writeProjectFiles(tempDir, {
      "package.json": '{"name":"fixture","private":true}',
      "src/build/handwritten.ts": "export const handwritten = 1;",
      "packages/demo/build/src/generated.ts": "export const generated = 1;",
      "packages/demo/out/src/generated.ts": "export const generated = 1;"
    });

    await expect(expandExplicitPaths(tempDir, ["packages/demo/build", "packages/demo/out"])).resolves.toEqual([]);
    await expect(expandExplicitPaths(tempDir, ["src/build"])).resolves.toEqual([
      path.join(tempDir, "src", "build", "handwritten.ts")
    ]);
  });

  it("ignores changed files under generated build-output src roots while keeping src/build files", async () => {
    const tempDir = await createTempDir("crap-files-");
    tempDirs.push(tempDir);
    await initGitRepository(tempDir);
    await writeProjectFiles(tempDir, {
      "package.json": '{"name":"fixture","private":true}',
      "src/build/handwritten.ts": "export const handwritten = 1;\n",
      "packages/demo/build/src/generated.ts": "export const generated = 1;\n"
    });
    await runProcess("git", ["add", "."], tempDir);
    await runProcess("git", ["commit", "-m", "initial"], tempDir);

    await writeFile(path.join(tempDir, "src", "build", "handwritten.ts"), "export const handwritten = 2;\n", "utf8");
    await writeFile(path.join(tempDir, "packages", "demo", "build", "src", "generated.ts"), "export const generated = 2;\n", "utf8");

    const files = await changedTypeScriptFilesUnderSourceRoots(tempDir);
    expect(files.map((file) => path.relative(tempDir, file).replace(/\\/g, "/"))).toEqual([
      "src/build/handwritten.ts"
    ]);
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
      const actual = await vi.importActual<typeof UtilsModule>("../src/utils");
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

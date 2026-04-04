import { writeFile } from "node:fs/promises";
import path from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import {
  changedTypeScriptFilesUnderSourceRoots,
  expandExplicitPaths,
  findAllTypeScriptFilesUnderSourceRoots
} from "../src/fileSelection";
import { createTempDir, disposeTempDir, initGitRepository, runProcess, writeProjectFiles } from "./testUtils";

const tempDirs: string[] = [];

afterEach(async () => {
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
});

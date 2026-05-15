import path from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { filterSourceFiles } from "../src/sourceExclusions";
import { createTempDir, disposeTempDir, writeProjectFiles } from "./testUtils";

const tempDirs: string[] = [];

afterEach(async () => {
  await Promise.all(tempDirs.splice(0).map(disposeTempDir));
});

async function createFiles(files: Record<string, string>): Promise<string> {
  const tempDir = await createTempDir("crap-exclusions-");
  tempDirs.push(tempDir);
  await writeProjectFiles(tempDir, files);
  return tempDir;
}

function absoluteFiles(projectRoot: string, relativePaths: string[]): string[] {
  return relativePaths.map((relativePath) => path.join(projectRoot, relativePath));
}

function relativeFiles(projectRoot: string, files: string[]): string[] {
  return files.map((file) => path.relative(projectRoot, file).replace(/\\/g, "/"));
}

describe("source exclusions", () => {
  it("applies conservative generated-code path defaults", async () => {
    const relativePaths = [
      "src/handwritten/app.ts",
      "src/generated/model.ts",
      "src/foo-generated/model.ts",
      "src/gen/model.ts",
      "src/api/client.generated.ts",
      "src/api/client.generated.tsx",
      "src/api/client.gen.ts",
      "src/api/client.gen.tsx",
      "src/api/ClientGenerated.ts",
      "src/api/ClientGenerated.tsx",
      "src/proto/user_pb.ts",
      "src/proto/user_grpc_pb.ts",
      "src/proto/user.pb.ts",
      "src/angular/app.ngfactory.ts",
      "src/angular/app.ngsummary.ts",
      "src/angular/app.ngtypecheck.ts"
    ];
    const projectRoot = await createFiles(Object.fromEntries(relativePaths.map((file) => [file, "export const value = 1;\n"])));

    const result = await filterSourceFiles(projectRoot, absoluteFiles(projectRoot, relativePaths), {});

    expect(relativeFiles(projectRoot, result.files)).toEqual(["src/handwritten/app.ts"]);
    expect(result.audit).toMatchObject({
      candidateFiles: relativePaths.length,
      includedFiles: 1,
      excludedFiles: relativePaths.length - 1
    });
    expect(result.audit.reasons).toContainEqual({
      source: "default",
      kind: "path",
      rule: "**/*_grpc_pb.ts",
      count: 1
    });
  });

  it("does not add broad handwritten-code patterns as defaults", async () => {
    const relativePaths = [
      "src/component.g.ts",
      "src/query.graphql.ts",
      "src/openapi/client.ts",
      "src/build/output.ts",
      "src/story.stories.ts",
      "src/api/clientgenerated.ts",
      "src/models/user.schema.ts"
    ];
    const projectRoot = await createFiles(Object.fromEntries(relativePaths.map((file) => [file, "export const value = 1;\n"])));

    const result = await filterSourceFiles(projectRoot, absoluteFiles(projectRoot, relativePaths), {});

    expect(relativeFiles(projectRoot, result.files)).toEqual(relativePaths);
    expect(result.audit.excludedFiles).toBe(0);
  });

  it("supports user globs and normalized source-path regexes independently from defaults", async () => {
    const relativePaths = [
      "src/generated/model.ts",
      "src/gen/model.ts",
      "src/api/client1.ts",
      "src/api/nested/client2.ts",
      "src/manual.ts",
      "packages/api/src/internal.ts",
      "src/generatedByRegex.ts"
    ];
    const projectRoot = await createFiles(Object.fromEntries(relativePaths.map((file) => [file, "export const value = 1;\n"])));

    const result = await filterSourceFiles(projectRoot, absoluteFiles(projectRoot, relativePaths), {
      excludes: ["packages/api/**", "src/*/client?.ts"],
      excludePathRegexes: ["^src/generatedByRegex\\.ts$"],
      useDefaultExclusions: false
    });

    expect(relativeFiles(projectRoot, result.files)).toEqual([
      "src/generated/model.ts",
      "src/gen/model.ts",
      "src/api/nested/client2.ts",
      "src/manual.ts"
    ]);
    expect(result.audit.reasons).toEqual([
      {
        source: "user",
        kind: "path",
        rule: "packages/api/**",
        count: 1
      },
      {
        source: "user",
        kind: "path",
        rule: "src/*/client?.ts",
        count: 1
      },
      {
        source: "user",
        kind: "pathRegex",
        rule: "^src/generatedByRegex\\.ts$",
        count: 1
      }
    ]);
  });

  it("matches generated markers only in the leading header comments", async () => {
    const files = {
      "src/generated-header.ts": "// @generated\nexport const value = 1;\n",
      "src/generated-block.ts": "/* This file was generated */\nexport const value = 1;\n",
      "src/custom-marker.ts": "// custom generated\nexport const value = 1;\n",
      "src/later-comment.ts": "export const value = 1;\n// @generated\n",
      "src/string-literal.ts": "export const value = \"DO NOT EDIT\";\n",
      "src/eslint.ts": "/* eslint-disable */\nexport const value = 1;\n"
    };
    const projectRoot = await createFiles(files);

    const result = await filterSourceFiles(projectRoot, absoluteFiles(projectRoot, Object.keys(files)), {
      excludeGeneratedMarkers: ["custom generated"]
    });

    expect(relativeFiles(projectRoot, result.files)).toEqual([
      "src/later-comment.ts",
      "src/string-literal.ts",
      "src/eslint.ts"
    ]);
    expect(result.audit.reasons).toEqual([
      {
        source: "default",
        kind: "generatedMarker",
        rule: "@generated",
        count: 1
      },
      {
        source: "default",
        kind: "generatedMarker",
        rule: "This file was generated",
        count: 1
      },
      {
        source: "user",
        kind: "generatedMarker",
        rule: "custom generated",
        count: 1
      }
    ]);
  });
});

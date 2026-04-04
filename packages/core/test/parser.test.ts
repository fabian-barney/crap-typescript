import { writeFile } from "node:fs/promises";
import path from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { parseFileMethods } from "../src/parser";
import { createTempDir, disposeTempDir } from "./testUtils";

const tempDirs: string[] = [];

afterEach(async () => {
  await Promise.all(tempDirs.splice(0).map(disposeTempDir));
});

describe("parseFileMethods", () => {
  it("extracts named function-like bodies and counts complexity from the TypeScript AST", async () => {
    const tempDir = await createTempDir("crap-parser-");
    tempDirs.push(tempDir);
    const filePath = path.join(tempDir, "sample.ts");
    await writeFile(
      filePath,
      `class Example {
  value(flagA: boolean, flagB: boolean): number {
    if (flagA && flagB) {
      return 1;
    }
    return 0;
  }

  callback(): number {
    const inner = () => {
      if (true) {
        return 1;
      }
      return 0;
    };
    return inner();
  }
}

const helper = {
  score(value: number): number {
    switch (value) {
      case 1:
        return 1;
      default:
        return 0;
    }
  }
};

const arrow = (items: number[]) => {
  for (const item of items) {
    if (item > 0) {
      return item;
    }
  }
  return 0;
};
`,
      "utf8"
    );

    const methods = await parseFileMethods(filePath);
    expect(methods).toEqual([
      {
        functionName: "value",
        containerName: "Example",
        displayName: "Example.value",
        startLine: 2,
        endLine: 7,
        complexity: 3
      },
      {
        functionName: "callback",
        containerName: "Example",
        displayName: "Example.callback",
        startLine: 9,
        endLine: 17,
        complexity: 1
      },
      {
        functionName: "inner",
        containerName: "Example",
        displayName: "Example.inner",
        startLine: 10,
        endLine: 15,
        complexity: 2
      },
      {
        functionName: "score",
        containerName: "helper",
        displayName: "helper.score",
        startLine: 21,
        endLine: 28,
        complexity: 2
      },
      {
        functionName: "arrow",
        containerName: null,
        displayName: "arrow",
        startLine: 31,
        endLine: 38,
        complexity: 3
      }
    ]);
  });

  it("ignores declaration files", async () => {
    const tempDir = await createTempDir("crap-parser-");
    tempDirs.push(tempDir);
    const filePath = path.join(tempDir, "sample.d.ts");
    await writeFile(filePath, "export declare function missing(): void;", "utf8");

    expect(await parseFileMethods(filePath)).toEqual([]);
  });

  it("includes anonymous default-exported function declarations", async () => {
    const tempDir = await createTempDir("crap-parser-");
    tempDirs.push(tempDir);
    const filePath = path.join(tempDir, "defaultExport.ts");
    await writeFile(
      filePath,
      `export default function () {
  if (true) {
    return 1;
  }
  return 0;
}
`,
      "utf8"
    );

    expect(await parseFileMethods(filePath)).toEqual([
      {
        functionName: "default",
        containerName: null,
        displayName: "default",
        startLine: 1,
        endLine: 6,
        complexity: 2
      }
    ]);
  });
});

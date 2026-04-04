import { afterEach, describe, expect, it } from "vitest";

import { resolveTestRunner } from "../src/moduleResolution";
import { createTempDir, disposeTempDir, writeProjectFiles } from "./testUtils";

const tempDirs: string[] = [];

afterEach(async () => {
  await Promise.all(tempDirs.splice(0).map(disposeTempDir));
});

describe("resolveTestRunner", () => {
  it("prefers explicit script evidence over ambiguous dependencies", async () => {
    const tempDir = await createTempDir("crap-runner-");
    tempDirs.push(tempDir);
    await writeProjectFiles(tempDir, {
      "package.json": JSON.stringify({
        name: "fixture",
        private: true,
        devDependencies: {
          jest: "^30.0.0",
          vitest: "^4.0.0"
        },
        scripts: {
          test: "jest --runInBand"
        }
      })
    });

    await expect(resolveTestRunner("auto", tempDir, tempDir)).resolves.toBe("jest");
  });
});

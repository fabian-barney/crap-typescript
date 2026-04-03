import { describe, expect, it } from "vitest";

import { buildCoverageCommand } from "../src/coverage";
import { coverageForLineRange } from "../src/lcov";

describe("coverage helpers", () => {
  it("builds npm vitest coverage commands", () => {
    expect(buildCoverageCommand("npm", "vitest", "C:/tmp")).toEqual({
      command: "npm",
      args: [
        "exec",
        "--no",
        "--",
        "vitest",
        "run",
        "--coverage.enabled=true",
        "--coverage.reporter=lcov",
        "--coverage.reporter=text"
      ],
      cwd: "C:/tmp",
      packageManager: "npm",
      testRunner: "vitest"
    });
  });

  it("builds yarn jest coverage commands", () => {
    expect(buildCoverageCommand("yarn", "jest", "C:/tmp")).toEqual({
      command: "yarn",
      args: [
        "jest",
        "--coverage",
        "--runInBand",
        "--coverageReporters=lcov",
        "--coverageReporters=text"
      ],
      cwd: "C:/tmp",
      packageManager: "yarn",
      testRunner: "jest"
    });
  });

  it("computes line-range coverage percentages", () => {
    const lineHits = new Map([
      [10, 1],
      [11, 0],
      [12, 3],
      [20, 1]
    ]);

    expect(coverageForLineRange(lineHits, 10, 12)).toBeCloseTo(66.666, 2);
    expect(coverageForLineRange(lineHits, 13, 19)).toBeNull();
    expect(coverageForLineRange(undefined, 10, 12)).toBeNull();
  });
});

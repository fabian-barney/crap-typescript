import { describe, expect, it } from "vitest";

import { withCrapTypescriptJest } from "../src/index";

describe("withCrapTypescriptJest", () => {
  it("adds default reporters and coverage output when config is empty", () => {
    const config = withCrapTypescriptJest();

    expect(config.collectCoverage).toBe(true);
    expect(config.coverageDirectory).toBe("coverage");
    expect(config.coverageReporters).toEqual(["json", "text"]);

    const reporters = config.reporters as unknown[];
    const reporterEntry = reporters[1] as [string, { coverageReportPath: string; junitReportPath: string }];
    expect(reporters[0]).toBe("default");
    expect(Array.isArray(reporterEntry)).toBe(true);
    expect(reporterEntry[0].replace(/\\/g, "/")).toContain("/packages/jest/src/reporter");
    expect(reporterEntry[1]).toMatchObject({
      coverageReportPath: "coverage/coverage-final.json",
      junitReportPath: "coverage/crap-typescript-junit.xml"
    });
  });

  it("normalizes single reporter values and appends missing defaults", () => {
    const config = withCrapTypescriptJest({
      coverageDirectory: "custom-coverage",
      coverageReporters: "json",
      reporters: "summary"
    });

    expect(config.coverageReporters).toEqual(["json", "text"]);
    expect(config.reporters).toEqual([
      "default",
      "summary",
      [
        expect.any(String),
        expect.objectContaining({
          coverageReportPath: "custom-coverage/coverage-final.json",
          junitReportPath: "custom-coverage/crap-typescript-junit.xml"
        })
      ]
    ]);
  });

  it("preserves existing default and coverage reporter entries without duplication", () => {
    const config = withCrapTypescriptJest({
      coverageDirectory: "custom-coverage",
      coverageReporters: ["json", "text"],
      reporters: [
        "default",
        ["summary", { verbose: true }]
      ]
    });

    expect(config.coverageReporters).toEqual(["json", "text"]);
    expect(config.reporters).toEqual([
      "default",
      ["summary", { verbose: true }],
      [
        expect.any(String),
        expect.objectContaining({
          coverageReportPath: "custom-coverage/coverage-final.json",
          junitReportPath: "custom-coverage/crap-typescript-junit.xml"
        })
      ]
    ]);
  });
});

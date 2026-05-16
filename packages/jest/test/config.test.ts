import { describe, expect, it } from "vitest";

import { withCrapTypescriptJest } from "../src/index";

describe("withCrapTypescriptJest", () => {
  it("adds default reporters and coverage output when config is empty", () => {
    const config = withCrapTypescriptJest();

    expect(config.collectCoverage).toBe(true);
    expect(config.coverageDirectory).toBe("coverage");
    expect(config.coverageReporters).toEqual(["json", "text"]);

    const reporters = config.reporters as unknown[];
    const reporterEntry = reporters[1] as [string, { coverageReportPath: string; junitReport: string }];
    expect(reporters[0]).toBe("default");
    expect(Array.isArray(reporterEntry)).toBe(true);
    expect(reporterEntry[0].replace(/\\/g, "/")).toContain("/packages/jest/src/reporter");
    expect(reporterEntry[1]).toMatchObject({
      coverageReportPath: "coverage/coverage-final.json",
      format: "none",
      junit: true,
      junitReport: "coverage/crap-typescript-junit.xml"
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
          format: "none",
          junit: true,
          junitReport: "custom-coverage/crap-typescript-junit.xml"
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
          format: "none",
          junit: true,
          junitReport: "custom-coverage/crap-typescript-junit.xml"
        })
      ]
    ]);
  });

  it("passes renamed reporting options to the reporter", () => {
    const config = withCrapTypescriptJest({}, {
      format: "json",
      agent: true,
      failuresOnly: true,
      omitRedundancy: true,
      output: "reports/crap.txt",
      junit: false,
      junitReport: "reports/custom-junit.xml",
      coverageReportWaitMs: 10_000,
      excludes: ["src/generated/**"],
      excludePathRegexes: ["^src/proto/"],
      excludeGeneratedMarkers: ["@custom-generated"],
      useDefaultExclusions: false
    });

    expect(config.reporters).toEqual([
      "default",
      [
        expect.any(String),
        expect.objectContaining({
          format: "json",
          agent: true,
          failuresOnly: true,
          omitRedundancy: true,
          output: "reports/crap.txt",
          junit: false,
          junitReport: "reports/custom-junit.xml",
          coverageReportWaitMs: 10_000,
          excludes: ["src/generated/**"],
          excludePathRegexes: ["^src/proto/"],
          excludeGeneratedMarkers: ["@custom-generated"],
          useDefaultExclusions: false
        })
      ]
    ]);
  });

  it("derives the default JUnit report from an overridden coverage report", () => {
    const config = withCrapTypescriptJest({}, {
      coverageReportPath: "custom-coverage/results/coverage-final.json"
    });

    expect(config.reporters).toEqual([
      "default",
      [
        expect.any(String),
        expect.objectContaining({
          coverageReportPath: "custom-coverage/results/coverage-final.json",
          format: "none",
          junit: true,
          junitReport: "custom-coverage/results/crap-typescript-junit.xml"
        })
      ]
    ]);
  });
});

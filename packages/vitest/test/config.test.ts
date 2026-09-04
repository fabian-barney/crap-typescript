import { describe, expect, it } from "vitest";

import { CrapTypescriptVitestReporter, withCrapTypescriptVitest } from "../src/index";

describe("withCrapTypescriptVitest", () => {
  it("preserves the default reporter when no reporters are configured", () => {
    const config = withCrapTypescriptVitest({
      test: {
        include: ["test/**/*.test.ts"]
      }
    });

    const reporters = config.test?.reporters;
    const coverageReporters = config.test?.coverage?.reporter;
    const crapReporter = reporters?.[1] as CrapTypescriptVitestReporter;
    expect(Array.isArray(reporters)).toBe(true);
    expect(reporters?.[0]).toBe("default");
    expect(crapReporter).toBeInstanceOf(CrapTypescriptVitestReporter);
    expect(crapReporter).toMatchObject({
      options: expect.objectContaining({
        format: "none",
        junit: true,
        junitReport: "coverage/crap-typescript-junit.xml"
      })
    });
    expect(coverageReporters).toEqual(["json", "text"]);
  });

  it("preserves explicit single reporters and adds only the required reporters", () => {
    const config = withCrapTypescriptVitest({
      test: {
        reporters: "dot",
        coverage: {
          reporter: "text-summary",
          reportsDirectory: "custom-coverage"
        }
      }
    });

    expect(config.test?.reporters).toEqual(["dot", expect.any(CrapTypescriptVitestReporter)]);
    expect(config.test?.coverage?.reporter).toEqual(["text-summary", "json"]);
    expect(config.test?.coverage?.reportsDirectory).toBe("custom-coverage");
    expect(config.test?.reporters?.[1]).toMatchObject({
      options: expect.objectContaining({
        format: "none",
        junit: true,
        junitReport: "custom-coverage/crap-typescript-junit.xml"
      })
    });
  });

  it("preserves explicit reporter arrays and tuple options without mutating the input", () => {
    const testReporters: Array<string | [string, unknown]> = [["default", { summary: false }], "dot"];
    const coverageReporters: Array<string | [string, unknown]> = [
      ["text", { skipFull: true }],
      ["json", { file: "coverage-final.json" }]
    ];
    const input = {
      test: {
        reporters: testReporters,
        coverage: {
          reporter: coverageReporters
        }
      }
    };

    const config = withCrapTypescriptVitest(input);

    expect(config.test?.reporters).toEqual([
      ["default", { summary: false }],
      "dot",
      expect.any(CrapTypescriptVitestReporter)
    ]);
    expect(config.test?.coverage?.reporter).toEqual([
      ["text", { skipFull: true }],
      ["json", { file: "coverage-final.json" }]
    ]);
    expect(testReporters).toEqual([["default", { summary: false }], "dot"]);
    expect(coverageReporters).toEqual([
      ["text", { skipFull: true }],
      ["json", { file: "coverage-final.json" }]
    ]);
    expect(config.test?.reporters).not.toBe(testReporters);
    expect(config.test?.coverage?.reporter).not.toBe(coverageReporters);
  });

  it("honors explicitly empty reporter arrays", () => {
    const config = withCrapTypescriptVitest({
      test: {
        reporters: [],
        coverage: {
          reporter: []
        }
      }
    });

    expect(config.test?.reporters).toEqual([expect.any(CrapTypescriptVitestReporter)]);
    expect(config.test?.coverage?.reporter).toEqual(["json"]);
  });

  it("passes renamed reporting options to the reporter", () => {
    const config = withCrapTypescriptVitest(
      {},
      {
        format: "json",
        agent: true,
        failuresOnly: true,
        omitRedundancy: true,
        output: "reports/crap.txt",
        junit: false,
        junitReport: "reports/custom-junit.xml",
        excludes: ["src/generated/**"],
        excludePathRegexes: ["^src/proto/"],
        excludeGeneratedMarkers: ["@custom-generated"],
        useDefaultExclusions: false
      }
    );

    expect(config.test?.reporters).toEqual([
      "default",
      expect.objectContaining({
        options: expect.objectContaining({
          output: "reports/crap.txt",
          format: "json",
          agent: true,
          failuresOnly: true,
          omitRedundancy: true,
          junit: false,
          junitReport: "reports/custom-junit.xml",
          excludes: ["src/generated/**"],
          excludePathRegexes: ["^src/proto/"],
          excludeGeneratedMarkers: ["@custom-generated"],
          useDefaultExclusions: false
        })
      })
    ]);
  });

  it("preserves explicitly disabled coverage without registering the CRAP reporter", () => {
    const config = withCrapTypescriptVitest({
      test: {
        reporters: ["dot"],
        coverage: {
          enabled: false,
          reporter: "json",
          reportsDirectory: "custom-coverage"
        }
      }
    });

    expect(config.test?.coverage?.enabled).toBe(false);
    expect(config.test?.coverage?.provider).toBe("v8");
    expect(config.test?.coverage?.reporter).toEqual(["json"]);
    expect(config.test?.coverage?.reportsDirectory).toBe("custom-coverage");
    expect(config.test?.reporters).toEqual(["dot"]);
  });

  it("derives the default JUnit report from an overridden coverage report", () => {
    const config = withCrapTypescriptVitest(
      {},
      {
        coverageReportPath: "custom-coverage/results/coverage-final.json"
      }
    );

    expect(config.test?.reporters).toEqual([
      "default",
      expect.objectContaining({
        options: expect.objectContaining({
          coverageReportPath: "custom-coverage/results/coverage-final.json",
          format: "none",
          junit: true,
          junitReport: "custom-coverage/results/crap-typescript-junit.xml"
        })
      })
    ]);
  });
});

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
        junitReport: "coverage/crap-typescript-junit.xml"
      })
    });
    expect(coverageReporters).toEqual(["json", "text"]);
  });

  it("preserves existing default reporters and augments single coverage reporter values", () => {
    const config = withCrapTypescriptVitest({
      test: {
        reporters: ["default"],
        coverage: {
          reporter: "json",
          reportsDirectory: "custom-coverage"
        }
      }
    });

    expect(config.test?.reporters).toEqual([
      "default",
      expect.any(CrapTypescriptVitestReporter)
    ]);
    expect(config.test?.coverage?.reporter).toEqual(["json", "text"]);
    expect(config.test?.coverage?.reportsDirectory).toBe("custom-coverage");
    expect(config.test?.reporters?.[1]).toMatchObject({
      options: expect.objectContaining({
        junitReport: "custom-coverage/crap-typescript-junit.xml"
      })
    });
  });

  it("passes renamed reporting options to the reporter", () => {
    const config = withCrapTypescriptVitest({}, {
      output: "reports/crap.txt",
      junit: false,
      junitReport: "reports/custom-junit.xml"
    });

    expect(config.test?.reporters).toEqual([
      "default",
      expect.objectContaining({
        options: expect.objectContaining({
          output: "reports/crap.txt",
          junit: false,
          junitReport: "reports/custom-junit.xml"
        })
      })
    ]);
  });
});

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
    expect(Array.isArray(reporters)).toBe(true);
    expect(reporters?.[0]).toBe("default");
    expect(reporters?.[1]).toBeInstanceOf(CrapTypescriptVitestReporter);
  });
});

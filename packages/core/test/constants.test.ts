import { describe, expect, it } from "vitest";

import { CRAP_THRESHOLD, thresholdWarning } from "../src/constants";

describe("thresholdWarning", () => {
  it("does not warn at the default threshold boundary", () => {
    expect(thresholdWarning(CRAP_THRESHOLD)).toBe("");
  });

  it("warns when the threshold is above the default hard-gate threshold", () => {
    expect(thresholdWarning(CRAP_THRESHOLD + 0.5)).toContain(
      `CRAP threshold above ${CRAP_THRESHOLD.toFixed(1)} is too lenient`,
    );
  });
});

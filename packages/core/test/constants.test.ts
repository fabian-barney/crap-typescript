import { describe, expect, it } from "vitest";

import { CRAP_THRESHOLD, thresholdWarning } from "../src/constants";

describe("thresholdWarning", () => {
  it("does not warn at the default threshold or hard-gate boundary", () => {
    expect(thresholdWarning(CRAP_THRESHOLD)).toBe("");
    expect(thresholdWarning(8.0)).toBe("");
  });

  it("warns when the threshold is above the hard-gate threshold", () => {
    expect(thresholdWarning(8.5)).toContain("CRAP threshold above 8.0 is too lenient");
  });
});

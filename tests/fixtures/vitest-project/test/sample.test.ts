import { describe, expect, it } from "vitest";

import { safe } from "../src/sample";

describe("safe", () => {
  it("increments a value", () => {
    expect(safe(1)).toBe(2);
  });
});


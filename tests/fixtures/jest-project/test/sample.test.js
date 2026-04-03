const { safe } = require("../src/sample");

describe("safe", () => {
  it("increments a value", () => {
    expect(safe(1)).toBe(2);
  });
});

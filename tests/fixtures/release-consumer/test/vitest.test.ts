import { expect, it } from "vitest";
import { safe } from "../src/safe";

it("runs the consumer's TypeScript code", () => {
  expect(safe(1)).toBe(2);
});

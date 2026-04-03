import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    coverage: {
      provider: "v8",
      reporter: ["text", "lcov"],
      reportsDirectory: "coverage"
    },
    include: ["packages/*/test/**/*.test.ts"],
    testTimeout: 120000
  }
});


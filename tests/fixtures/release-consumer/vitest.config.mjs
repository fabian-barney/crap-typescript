import { withCrapTypescriptVitest } from "@barney-media/crap-typescript-vitest";
import { options, reportsDirectory, scenario } from "./options.mjs";

export default withCrapTypescriptVitest(
  {
    test: {
      include: ["test/vitest.test.ts"],
      ...(scenario === "suppressed" ? { reporters: [] } : {}),
      coverage: {
        enabled: scenario !== "disabled",
        include: ["src/**/*.ts"],
        reportsDirectory,
        ...(scenario === "suppressed" ? { reporter: [] } : {})
      }
    }
  },
  options
);

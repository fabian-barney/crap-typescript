import { withCrapTypescriptVitest } from "@barney-media/crap-typescript-vitest";

import baseConfig from "./vitest.config";

export default withCrapTypescriptVitest(baseConfig, {
  packageManager: "npm",
  paths: ["packages"],
  projectRoot: process.cwd()
});

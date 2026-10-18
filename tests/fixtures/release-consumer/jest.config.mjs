import { withCrapTypescriptJest } from "@barney-media/crap-typescript-jest";
import { options, reportsDirectory } from "./options.mjs";

export default withCrapTypescriptJest(
  {
    testEnvironment: "node",
    testMatch: ["<rootDir>/test/jest.test.cjs"],
    collectCoverageFrom: ["src/**/*.ts"],
    coverageDirectory: reportsDirectory,
    transform: {
      "^.+\\.tsx?$": ["ts-jest", { tsconfig: { module: "CommonJS", target: "ES2022" } }]
    }
  },
  options
);

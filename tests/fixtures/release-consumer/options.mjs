export const scenario = process.env.CRAP_SMOKE_SCENARIO ?? "threshold";
export const reportsDirectory = `coverage-${scenario}`;
export const options = {
  projectRoot: process.cwd(),
  paths: scenario === "pass" ? ["src/safe.ts"] : ["src"],
  ...(scenario === "error" ? { output: reportsDirectory } : {})
};

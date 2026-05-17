export const CRAP_THRESHOLD = 8.0;
export const COVERAGE_REPORT_RELATIVE_PATH = "coverage/coverage-final.json";
export const NO_FILES_MESSAGE = "No TypeScript files to analyze.";
export const NO_ANALYZABLE_FUNCTIONS_MESSAGE = "No analyzable functions found.";

export function validateThreshold(value: number): number {
  if (!Number.isFinite(value) || value <= 0) {
    throw new Error("Threshold must be a finite number greater than 0");
  }
  return value;
}

export function thresholdWarning(value: number): string {
  if (value < 4.0) {
    return `Warning: CRAP threshold below 4.0 is likely too noisy. ${thresholdRecommendation()}`;
  }
  if (value > CRAP_THRESHOLD) {
    return `Warning: CRAP threshold above ${CRAP_THRESHOLD.toFixed(1)} is too lenient even for hard gates. ${thresholdRecommendation()}`;
  }
  return "";
}

function thresholdRecommendation(): string {
  const defaultThreshold = CRAP_THRESHOLD.toFixed(1);
  return `Use ${defaultThreshold} for hard gates, target 6.0 during implementation, and use the ${defaultThreshold} default when in doubt.`;
}

export const IGNORED_DIRECTORIES = new Set([
  ".git",
  "coverage",
  "dist",
  "node_modules"
]);

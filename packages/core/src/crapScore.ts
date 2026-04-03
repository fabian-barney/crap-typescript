export function calculateCrapScore(
  complexity: number,
  coveragePercent: number | null
): number | null {
  if (coveragePercent === null) {
    return null;
  }
  const uncovered = 1.0 - coveragePercent / 100.0;
  return complexity * complexity * uncovered * uncovered * uncovered + complexity;
}

export function maxCrap(metrics: Array<{ crapScore: number | null }>): number {
  let max = 0;
  for (const metric of metrics) {
    if (metric.crapScore !== null && metric.crapScore > max) {
      max = metric.crapScore;
    }
  }
  return max;
}

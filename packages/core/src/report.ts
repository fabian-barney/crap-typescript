import { formatNumber } from "./utils";
import type { MethodMetrics } from "./types";

const HEADERS = ["Function", "CC", "Coverage", "CRAP", "Location"];

export function sortMetrics(metrics: MethodMetrics[]): MethodMetrics[] {
  return [...metrics].sort((left, right) => {
    if (left.crapScore === null && right.crapScore !== null) {
      return 1;
    }
    if (left.crapScore !== null && right.crapScore === null) {
      return -1;
    }
    if (left.crapScore !== null && right.crapScore !== null && left.crapScore !== right.crapScore) {
      return right.crapScore - left.crapScore;
    }
    if (left.relativePath !== right.relativePath) {
      return left.relativePath.localeCompare(right.relativePath);
    }
    return left.startLine - right.startLine;
  });
}

export function formatReport(metrics: MethodMetrics[]): string {
  const rows = sortMetrics(metrics).map((metric) => [
    metric.displayName,
    String(metric.complexity),
    metric.coveragePercent === null ? "N/A" : `${formatNumber(metric.coveragePercent)}%`,
    metric.crapScore === null ? "N/A" : formatNumber(metric.crapScore),
    metric.location
  ]);

  const widths = HEADERS.map((header, index) => {
    const rowWidth = rows.reduce((max, row) => Math.max(max, row[index].length), header.length);
    return rowWidth;
  });

  const headerLine = HEADERS.map((header, index) => header.padEnd(widths[index])).join("  ");
  const separator = widths.map((width) => "-".repeat(width)).join("  ");
  const body = rows.map((row) => row.map((value, index) => value.padEnd(widths[index])).join("  "));
  return [headerLine, separator, ...body].join("\n");
}


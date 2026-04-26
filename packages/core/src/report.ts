import { CRAP_THRESHOLD } from "./constants";
import { formatNumber } from "./utils";
import type {
  CoverageKind,
  CoverageMetric,
  MethodMetrics,
  MethodReportStatus,
  ReportFormat,
  ReportStatus
} from "./types";

const METHOD_COLUMNS = ["status", "crap", "cc", "cov", "covKind", "func", "src", "lineStart", "lineEnd"] as const;
const AGENT_METHOD_COLUMNS = ["crap", "cc", "cov", "covKind", "func", "src", "lineStart", "lineEnd"] as const;
const RIGHT_ALIGNED_TEXT_COLUMNS = new Set<MethodColumn>(["crap", "cc", "cov", "lineStart", "lineEnd"]);

export interface MethodReportEntry {
  status: MethodReportStatus;
  crap: number | null;
  cc: number;
  cov: number | null;
  covKind: CoverageKind;
  func: string;
  src: string;
  lineStart: number;
  lineEnd: number;
}

export type AgentMethodReportEntry = Omit<MethodReportEntry, "status">;

export interface AnalysisReport {
  status: ReportStatus;
  threshold: number;
  methods: MethodReportEntry[];
}

export interface AgentAnalysisReport {
  status: ReportStatus;
  threshold: number;
  methods: AgentMethodReportEntry[];
}

export interface FormatAnalysisReportOptions {
  format: ReportFormat;
  agent?: boolean;
}

type SerializableReport = AnalysisReport | AgentAnalysisReport;
type ReportValue = string | number | null;
type ReportFormatter = (report: SerializableReport, agent: boolean) => string;
type MethodColumn = typeof METHOD_COLUMNS[number];
type AgentMethodColumn = typeof AGENT_METHOD_COLUMNS[number];

const REPORT_FORMATTERS: Record<ReportFormat, ReportFormatter> = {
  toon: formatToonReport,
  json: (report) => `${JSON.stringify(report, null, 2)}\n`,
  text: formatTextReport,
  junit: (report) => formatJunitReport(report as AnalysisReport)
};

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

export function buildAnalysisReport(metrics: MethodMetrics[]): AnalysisReport {
  const methods = sortMetrics(metrics).map(toMethodReportEntry);
  return {
    status: methods.some((method) => method.status === "failed") ? "failed" : "passed",
    threshold: CRAP_THRESHOLD,
    methods
  };
}

export function buildAgentAnalysisReport(metrics: MethodMetrics[]): AgentAnalysisReport {
  const report = buildAnalysisReport(metrics);
  return {
    status: report.status,
    threshold: report.threshold,
    methods: report.methods
      .filter((method) => method.status === "failed")
      .map(({ status: _status, ...method }) => method)
  };
}

export function formatAnalysisReport(metrics: MethodMetrics[], options: FormatAnalysisReportOptions): string {
  const agent = options.agent ?? false;
  validateReportOptions(options.format, agent);
  return REPORT_FORMATTERS[options.format](agent ? buildAgentAnalysisReport(metrics) : buildAnalysisReport(metrics), agent);
}

function validateReportOptions(format: ReportFormat, agent: boolean): void {
  if (agent && format === "junit") {
    throw new Error("--agent cannot be combined with --format junit");
  }
}

export function formatReport(metrics: MethodMetrics[]): string {
  return formatTextReport(buildAnalysisReport(metrics), false);
}

export function formatToonReport(report: SerializableReport, agent = false): string {
  const lines = [`status: ${report.status}`, `threshold: ${formatNumber(report.threshold)}`];
  const includeStatus = !agent && reportHasMethodStatus(report);
  const columns = includeStatus ? METHOD_COLUMNS : AGENT_METHOD_COLUMNS;

  if (report.methods.length === 0) {
    return agent ? `${lines.join("\n")}\n` : `${[...lines, "methods[0]:"].join("\n")}\n`;
  }

  lines.push(`methods[${report.methods.length}]{${columns.join(",")}}:`);
  for (const method of report.methods) {
    lines.push(`  ${columns.map((column) => formatToonValue(method[column as keyof typeof method] as ReportValue)).join(",")}`);
  }
  return `${lines.join("\n")}\n`;
}

export function formatTextReport(report: SerializableReport, agent = false): string {
  const summary = [`status: ${report.status}`, `threshold: ${formatNumber(report.threshold)}`];
  if (report.methods.length === 0) {
    return `${summary.join("\n")}\n`;
  }

  const includeStatus = !agent && reportHasMethodStatus(report);
  const columns = includeStatus ? METHOD_COLUMNS : AGENT_METHOD_COLUMNS;
  const rows = includeStatus
    ? report.methods.map((method) => METHOD_COLUMNS.map((column) => formatTextValue(column, method[column])))
    : (report as AgentAnalysisReport).methods.map((method) =>
      AGENT_METHOD_COLUMNS.map((column) => formatTextValue(column, method[column]))
    );
  const widths = columns.map((column, index) =>
    rows.reduce((max, row) => Math.max(max, row[index].length), column.length)
  );
  const headerLine = formatTextRow([...columns], widths, columns);
  const separator = formatTextSeparator(widths);
  const body = rows.map((row) => formatTextRow(row, widths, columns));

  return [...summary, "", headerLine, separator, ...body].join("\n") + "\n";
}

export function formatJunitReport(report: AnalysisReport): string {
  const failures = report.methods.filter((method) => method.status === "failed").length;
  const skipped = report.methods.filter((method) => method.status === "skipped").length;
  const lines = [
    '<?xml version="1.0" encoding="UTF-8"?>',
    `<testsuite name="crap-typescript" status="${report.status}" tests="${report.methods.length}" failures="${failures}" skipped="${skipped}" errors="0">`
  ];
  lines.push("  <properties>");
  lines.push(`    <property name="threshold" value="${formatNumber(report.threshold)}" />`);
  lines.push("  </properties>");

  for (const method of report.methods) {
    lines.push(
      `  <testcase classname="${escapeXmlAttribute(method.src)}" name="${escapeXmlAttribute(method.func)}" file="${escapeXmlAttribute(method.src)}" line="${method.lineStart}">`
    );
    lines.push("    <properties>");
    for (const [name, value] of methodProperties(method)) {
      lines.push(`      <property name="${name}" value="${escapeXmlAttribute(value)}" />`);
    }
    lines.push("    </properties>");
    if (method.status === "failed") {
      const message = `CRAP score ${formatNullableNumber(method.crap)} exceeds threshold ${formatNumber(report.threshold)}`;
      lines.push(`    <failure type="crap-threshold" message="${escapeXmlAttribute(message)}">${escapeXmlText(message)}</failure>`);
    }
    if (method.status === "skipped") {
      lines.push('    <skipped message="CRAP score unavailable" />');
    }
    lines.push("  </testcase>");
  }

  lines.push("</testsuite>");
  return `${lines.join("\n")}\n`;
}

function toMethodReportEntry(metric: MethodMetrics): MethodReportEntry {
  return {
    status: methodStatus(metric),
    crap: metric.crapScore,
    cc: metric.complexity,
    cov: metric.coveragePercent,
    covKind: coverageKind(metric),
    func: metric.displayName,
    src: metric.relativePath,
    lineStart: metric.startLine,
    lineEnd: metric.endLine
  };
}

function reportHasMethodStatus(report: SerializableReport): report is AnalysisReport {
  return report.methods.every((method) => "status" in method);
}

function methodStatus(metric: MethodMetrics): MethodReportStatus {
  if (metric.crapScore === null) {
    return "skipped";
  }
  return metric.crapScore > CRAP_THRESHOLD ? "failed" : "passed";
}

function coverageKind(metric: MethodMetrics): CoverageKind {
  if (metric.statementCoverage.status === "unknown") {
    return "stmt";
  }
  if (metric.branchCoverage.status === "unknown") {
    return "branch";
  }
  const statementPercent = effectivePercent(metric.statementCoverage);
  const branchPercent = effectivePercent(metric.branchCoverage);
  return branchPercent < statementPercent ? "branch" : "stmt";
}

function effectivePercent(metric: CoverageMetric): number {
  return metric.percent ?? 100;
}

function formatToonValue(value: ReportValue): string {
  if (value === null) {
    return "null";
  }
  if (typeof value === "number") {
    return formatToonNumber(value);
  }
  return formatToonString(value);
}

function formatToonNumber(value: number): string {
  return Number.isInteger(value) ? String(value) : formatNumber(value);
}

function formatToonString(value: string): string {
  return /^[A-Za-z0-9_.:/#@$-]+$/.test(value) ? value : JSON.stringify(value);
}

function formatNullableNumber(value: number | null): string {
  return value === null ? "N/A" : formatNumber(value);
}

function formatJunitNullableNumber(value: number | null): string {
  return value === null ? "" : formatNumber(value);
}

function formatTextValue(column: MethodColumn | AgentMethodColumn, value: ReportValue): string {
  if (column === "cov") {
    return value === null ? "N/A" : `${formatNumber(value as number)}%`;
  }
  if (column === "crap") {
    return formatNullableNumber(value as number | null);
  }
  return value === null ? "N/A" : String(value);
}

function formatTextRow(
  values: string[],
  widths: number[],
  columns: readonly (MethodColumn | AgentMethodColumn)[] = METHOD_COLUMNS
): string {
  return `| ${values.map((value, index) => formatTextCell(value, widths[index], columns[index])).join(" | ")} |`;
}

function formatTextCell(value: string, width: number, column: MethodColumn | AgentMethodColumn): string {
  return RIGHT_ALIGNED_TEXT_COLUMNS.has(column as MethodColumn) ? value.padStart(width) : value.padEnd(width);
}

function formatTextSeparator(widths: number[]): string {
  return `| ${widths.map((width) => "-".repeat(width)).join(" | ")} |`;
}

function methodProperties(method: MethodReportEntry): Array<[string, string]> {
  return [
    ["status", method.status],
    ["crap", formatJunitNullableNumber(method.crap)],
    ["cc", String(method.cc)],
    ["cov", formatJunitNullableNumber(method.cov)],
    ["covKind", method.covKind],
    ["func", method.func],
    ["src", method.src],
    ["lineStart", String(method.lineStart)],
    ["lineEnd", String(method.lineEnd)]
  ];
}

function escapeXmlAttribute(value: string): string {
  return escapeXmlText(value).replace(/"/g, "&quot;");
}

function escapeXmlText(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

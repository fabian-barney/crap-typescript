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

const TEXT_HEADERS = ["Status", "Function", "CC", "Coverage Kind", "Coverage", "CRAP", "Threshold", "Location"];
const AGENT_TEXT_HEADERS = ["Function", "CC", "Coverage Kind", "Coverage", "CRAP", "Threshold", "Location"];

export interface MethodReportEntry {
  status: MethodReportStatus;
  name: string;
  sourcePath: string;
  startLine: number;
  endLine: number;
  complexity: number;
  coverageKind: CoverageKind;
  coveragePercent: number | null;
  crapScore: number | null;
  threshold: number;
}

export type AgentMethodReportEntry = Omit<MethodReportEntry, "status">;

export interface AnalysisReport {
  status: ReportStatus;
  methods: MethodReportEntry[];
}

export interface AgentAnalysisReport {
  status: ReportStatus;
  methods: AgentMethodReportEntry[];
}

export interface FormatAnalysisReportOptions {
  format: ReportFormat;
  agent?: boolean;
}

type SerializableReport = AnalysisReport | AgentAnalysisReport;
type ReportValue = string | number | null;
type ReportFormatter = (report: SerializableReport, agent: boolean) => string;

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
    methods
  };
}

export function buildAgentAnalysisReport(metrics: MethodMetrics[]): AgentAnalysisReport {
  const report = buildAnalysisReport(metrics);
  return {
    status: report.status,
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
  const lines = [`status: ${report.status}`];
  const includeStatus = !agent && reportHasMethodStatus(report);
  const columns = includeStatus
    ? ["status", "name", "sourcePath", "startLine", "endLine", "complexity", "coverageKind", "coveragePercent", "crapScore", "threshold"]
    : ["name", "sourcePath", "startLine", "endLine", "complexity", "coverageKind", "coveragePercent", "crapScore", "threshold"];

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
  if (report.methods.length === 0) {
    return `Status: ${report.status}\n`;
  }

  const includeStatus = !agent && reportHasMethodStatus(report);
  const headers = includeStatus ? TEXT_HEADERS : AGENT_TEXT_HEADERS;
  const rows = report.methods.map((method) => {
    const values = [
      method.name,
      String(method.complexity),
      method.coverageKind,
      formatNullablePercent(method.coveragePercent),
      formatNullableNumber(method.crapScore),
      formatNumber(method.threshold),
      `${method.sourcePath}:${method.startLine}-${method.endLine}`
    ];
    return includeStatus && "status" in method ? [method.status, ...values] : values;
  });
  const widths = headers.map((header, index) =>
    rows.reduce((max, row) => Math.max(max, row[index].length), header.length)
  );
  const headerLine = headers.map((header, index) => header.padEnd(widths[index])).join("  ");
  const separator = widths.map((width) => "-".repeat(width)).join("  ");
  const body = rows.map((row) => row.map((value, index) => value.padEnd(widths[index])).join("  "));

  return [`Status: ${report.status}`, "", headerLine, separator, ...body].join("\n") + "\n";
}

export function formatJunitReport(report: AnalysisReport): string {
  const failures = report.methods.filter((method) => method.status === "failed").length;
  const skipped = report.methods.filter((method) => method.status === "skipped").length;
  const lines = [
    '<?xml version="1.0" encoding="UTF-8"?>',
    `<testsuite name="crap-typescript" status="${report.status}" tests="${report.methods.length}" failures="${failures}" skipped="${skipped}" errors="0">`
  ];

  for (const method of report.methods) {
    lines.push(
      `  <testcase classname="${escapeXmlAttribute(method.sourcePath)}" name="${escapeXmlAttribute(method.name)}" file="${escapeXmlAttribute(method.sourcePath)}" line="${method.startLine}">`
    );
    lines.push("    <properties>");
    for (const [name, value] of methodProperties(method)) {
      lines.push(`      <property name="${name}" value="${escapeXmlAttribute(value)}" />`);
    }
    lines.push("    </properties>");
    if (method.status === "failed") {
      const message = `CRAP score ${formatNullableNumber(method.crapScore)} exceeds threshold ${formatNumber(method.threshold)}`;
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
    name: metric.displayName,
    sourcePath: metric.relativePath,
    startLine: metric.startLine,
    endLine: metric.endLine,
    complexity: metric.complexity,
    coverageKind: coverageKind(metric),
    coveragePercent: metric.coveragePercent,
    crapScore: metric.crapScore,
    threshold: CRAP_THRESHOLD
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
    return Number.isInteger(value) ? String(value) : formatNumber(value);
  }
  return /^[A-Za-z0-9_.:/#@$-]+$/.test(value) ? value : JSON.stringify(value);
}

function formatNullablePercent(value: number | null): string {
  return value === null ? "N/A" : `${formatNumber(value)}%`;
}

function formatNullableNumber(value: number | null): string {
  return value === null ? "N/A" : formatNumber(value);
}

function formatJunitNullableNumber(value: number | null): string {
  return value === null ? "" : formatNumber(value);
}

function methodProperties(method: MethodReportEntry): Array<[string, string]> {
  return [
    ["status", method.status],
    ["score", formatJunitNullableNumber(method.crapScore)],
    ["threshold", formatNumber(method.threshold)],
    ["complexity", String(method.complexity)],
    ["coveragePercent", formatJunitNullableNumber(method.coveragePercent)],
    ["coverageKind", method.coverageKind],
    ["sourcePath", method.sourcePath],
    ["startLine", String(method.startLine)],
    ["endLine", String(method.endLine)],
    ["lineRange", `${method.startLine}-${method.endLine}`]
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

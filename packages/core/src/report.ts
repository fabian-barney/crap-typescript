import { encode } from "@toon-format/toon";
import { XMLBuilder } from "fast-xml-parser";

import { CRAP_THRESHOLD } from "./constants.js";
import { formatNumber } from "./utils.js";
import type {
  CoverageKind,
  CoverageMetric,
  MethodMetrics,
  MethodReportStatus,
  ReportFormat,
  ReportStatus
} from "./types.js";

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
type XmlNode = Record<string, unknown>;

interface JunitMethodCounts {
  failures: number;
  skipped: number;
}

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
  const toonReport = agent && reportHasMethodStatus(report)
    ? omitMethodStatuses(report)
    : report;
  return `${encode(toonReport)}\n`;
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
  return `${formatXmlDeclaration()}\n${createXmlBuilder().build(toJunitXml(report)).trimEnd()}\n`;
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
  return report.methods.length > 0 && report.methods.every((method) => "status" in method);
}

function omitMethodStatuses(report: AnalysisReport): AgentAnalysisReport {
  return {
    status: report.status,
    threshold: report.threshold,
    methods: report.methods.map(({ status: _status, ...method }) => method)
  };
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

function formatXmlDeclaration(): string {
  return '<?xml version="1.0" encoding="UTF-8"?>';
}

function createXmlBuilder(): XMLBuilder {
  return new XMLBuilder({
    attributeNamePrefix: "@_",
    format: true,
    ignoreAttributes: false,
    suppressEmptyNode: true
  });
}

function toJunitXml(report: AnalysisReport): XmlNode {
  const counts = countJunitMethodStatuses(report.methods);
  const testsuite: XmlNode = {
    "@_name": "crap-typescript",
    "@_status": report.status,
    "@_tests": report.methods.length,
    "@_failures": counts.failures,
    "@_skipped": counts.skipped,
    "@_errors": 0,
    properties: {
      property: [
        toXmlProperty("threshold", formatNumber(report.threshold))
      ]
    }
  };

  if (report.methods.length > 0) {
    testsuite.testcase = report.methods.map((method) => toJunitTestcaseXml(method, report.threshold));
  }

  return { testsuite };
}

function countJunitMethodStatuses(methods: MethodReportEntry[]): JunitMethodCounts {
  const counts = { failures: 0, skipped: 0 };
  for (const method of methods) {
    if (method.status === "failed") {
      counts.failures += 1;
    } else if (method.status === "skipped") {
      counts.skipped += 1;
    }
  }
  return counts;
}

function toJunitTestcaseXml(method: MethodReportEntry, threshold: number): XmlNode {
  return {
    "@_classname": method.src,
    "@_name": method.func,
    "@_file": method.src,
    "@_line": method.lineStart,
    properties: {
      property: methodProperties(method).map(([name, value]) => toXmlProperty(name, value))
    },
    ...junitStatusXml(method, threshold)
  };
}

function toXmlProperty(name: string, value: string): XmlNode {
  return {
    "@_name": name,
    "@_value": value
  };
}

function junitStatusXml(method: MethodReportEntry, threshold: number): XmlNode {
  if (method.status === "failed") {
    const message = `CRAP score ${formatNullableNumber(method.crap)} exceeds threshold ${formatNumber(threshold)}`;
    return {
      failure: {
        "@_type": "crap-threshold",
        "@_message": message,
        "#text": message
      }
    };
  }
  if (method.status === "skipped") {
    return {
      skipped: {
        "@_message": "CRAP score unavailable"
      }
    };
  }
  return {};
}

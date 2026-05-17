import { encode } from "@toon-format/toon";
import { XMLBuilder } from "fast-xml-parser";

import { CRAP_THRESHOLD, validateThreshold } from "./constants.js";
import { formatNumber } from "./utils.js";
import type {
  CoverageKind,
  MethodMetrics,
  MethodReportStatus,
  ReportFormat,
  ReportStatus,
  SourceExclusionAudit
} from "./types.js";

const METHOD_COLUMNS = ["status", "crap", "cc", "cov", "covKind", "method", "src", "lineStart", "lineEnd"] as const;
const AGENT_METHOD_COLUMNS = ["crap", "cc", "cov", "covKind", "method", "src", "lineStart", "lineEnd"] as const;
const RIGHT_ALIGNED_TEXT_COLUMNS = new Set<MethodColumn>(["crap", "cc", "cov", "lineStart", "lineEnd"]);
const REPORT_SORT_COLLATOR = new Intl.Collator("en");

export interface MethodReportEntry {
  status: MethodReportStatus;
  crap: number | null;
  cc: number;
  cov: number | null;
  covKind: CoverageKind;
  method: string;
  src: string;
  lineStart: number;
  lineEnd: number;
}

export type AgentMethodReportEntry = Omit<MethodReportEntry, "status">;

export interface AnalysisReport {
  status: ReportStatus;
  threshold: number;
  methods: MethodReportEntry[];
  sourceExclusions?: SourceExclusionAudit;
}

export interface AgentAnalysisReport {
  status: ReportStatus;
  threshold: number;
  methods: AgentMethodReportEntry[];
  sourceExclusions?: SourceExclusionAudit;
}

export interface FormatAnalysisReportOptions {
  format: ReportFormat;
  agent?: boolean;
  threshold?: number;
  failuresOnly?: boolean;
  omitRedundancy?: boolean;
  sourceExclusionAudit?: SourceExclusionAudit;
  includeExclusionAudit?: boolean;
}

type SerializableReport = AnalysisReport | AgentAnalysisReport;
type ReportValue = string | number | null;
type ReportFormatter = (report: SerializableReport, omitMethodStatus: boolean) => string;
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
  junit: (report, omitMethodStatus) => formatJunitReport(report as AnalysisReport, omitMethodStatus),
  none: () => ""
};

export function sortMetrics(metrics: MethodMetrics[]): MethodMetrics[] {
  return [...metrics].sort((left, right) => {
    return compareCrapScores(left.crapScore, right.crapScore)
      || compareReportText(left.relativePath, right.relativePath)
      || compareNumber(left.startLine, right.startLine)
      || compareReportText(left.displayName, right.displayName)
      || compareNumber(left.bodySpan.startColumn, right.bodySpan.startColumn)
      || compareNumber(left.endLine, right.endLine)
      || compareNumber(left.bodySpan.endLine, right.bodySpan.endLine)
      || compareNumber(left.bodySpan.endColumn, right.bodySpan.endColumn)
      || compareReportText(left.containerName ?? "", right.containerName ?? "")
      || compareReportText(left.functionName, right.functionName);
  });
}

function compareCrapScores(left: number | null, right: number | null): number {
  if (left === null && right !== null) {
    return 1;
  }
  if (left !== null && right === null) {
    return -1;
  }
  if (left !== null && right !== null) {
    return right - left;
  }
  return 0;
}

function compareReportText(left: string, right: string): number {
  return REPORT_SORT_COLLATOR.compare(left, right);
}

function compareNumber(left: number, right: number): number {
  return left - right;
}

export function buildAnalysisReport(
  metrics: MethodMetrics[],
  threshold = CRAP_THRESHOLD,
  failuresOnly = false,
  sourceExclusionAudit?: SourceExclusionAudit
): AnalysisReport {
  threshold = validateThreshold(threshold);
  const allMethods = sortMetrics(metrics).map((metric) => toMethodReportEntry(metric, threshold));
  return {
    status: allMethods.some((method) => method.status === "failed") ? "failed" : "passed",
    threshold,
    methods: failuresOnly ? allMethods.filter((method) => method.status === "failed") : allMethods,
    ...optionalSourceExclusions(sourceExclusionAudit)
  };
}

export function buildAgentAnalysisReport(
  metrics: MethodMetrics[],
  threshold = CRAP_THRESHOLD,
  sourceExclusionAudit?: SourceExclusionAudit
): AgentAnalysisReport {
  const report = buildAnalysisReport(metrics, threshold, false, sourceExclusionAudit);
  return {
    status: report.status,
    threshold: report.threshold,
    methods: report.methods
      .filter((method) => method.status === "failed")
      .map(({ status: _status, ...method }) => method),
    ...optionalSourceExclusions(report.sourceExclusions)
  };
}

export function formatAnalysisReport(metrics: MethodMetrics[], options: FormatAnalysisReportOptions): string {
  const threshold = options.threshold ?? CRAP_THRESHOLD;
  if (options.format === "none") {
    validateThreshold(threshold);
    return "";
  }

  const resolvedOptions = resolveFormatOptions(options);
  const report = buildPrimaryAnalysisReport(metrics, threshold, options.format, resolvedOptions);
  return REPORT_FORMATTERS[options.format](
    report,
    resolvedOptions.omitRedundancy
  );
}

interface ResolvedFormatOptions {
  failuresOnly: boolean;
  omitRedundancy: boolean;
  sourceExclusionAudit: SourceExclusionAudit | undefined;
}

function resolveFormatOptions(options: FormatAnalysisReportOptions): ResolvedFormatOptions {
  const agent = options.agent ?? false;
  const failuresOnly = options.failuresOnly ?? agent;
  const omitRedundancy = options.omitRedundancy ?? agent;
  return {
    failuresOnly,
    omitRedundancy,
    sourceExclusionAudit: resolvedSourceExclusionAudit(options, agent, failuresOnly, omitRedundancy)
  };
}

function resolvedSourceExclusionAudit(
  options: FormatAnalysisReportOptions,
  agent: boolean,
  failuresOnly: boolean,
  omitRedundancy: boolean
): SourceExclusionAudit | undefined {
  const optimizedAgentPrimary = agent && failuresOnly && omitRedundancy;
  const includeExclusionAudit = options.includeExclusionAudit ?? !optimizedAgentPrimary;
  return includeExclusionAudit ? options.sourceExclusionAudit : undefined;
}

function buildPrimaryAnalysisReport(
  metrics: MethodMetrics[],
  threshold: number,
  format: ReportFormat,
  options: ResolvedFormatOptions
): SerializableReport {
  const report = buildAnalysisReport(metrics, threshold, options.failuresOnly, options.sourceExclusionAudit);
  return options.omitRedundancy && format !== "junit" ? omitMethodStatuses(report) : report;
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
  const sourceExclusionLines = formatTextSourceExclusions(report.sourceExclusions);
  if (report.methods.length === 0) {
    return `${[...summary, ...sourceExclusionLines].join("\n")}\n`;
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

  return [...summary, ...sourceExclusionLines, "", headerLine, separator, ...body].join("\n") + "\n";
}

export function formatJunitReport(report: AnalysisReport, omitRedundancy = false): string {
  return `${formatXmlDeclaration()}\n${createXmlBuilder().build(toJunitXml(report, omitRedundancy)).trimEnd()}\n`;
}

function toMethodReportEntry(metric: MethodMetrics, threshold: number): MethodReportEntry {
  return {
    status: methodStatus(metric, threshold),
    crap: metric.crapScore,
    cc: metric.complexity,
    cov: metric.coveragePercent,
    covKind: coverageKind(metric),
    method: metric.displayName,
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
    methods: report.methods.map(({ status: _status, ...method }) => method),
    ...optionalSourceExclusions(report.sourceExclusions)
  };
}

function methodStatus(metric: MethodMetrics, threshold: number): MethodReportStatus {
  if (metric.crapScore === null) {
    return "skipped";
  }
  return metric.crapScore > threshold ? "failed" : "passed";
}

function coverageKind(metric: MethodMetrics): CoverageKind {
  if (metric.coverage.status === "unknown") {
    return "N/A";
  }
  if (metric.statementCoverage.status === "measured" && metric.branchCoverage.status === "measured") {
    return metric.branchCoverage.percent! < metric.statementCoverage.percent! ? "branch" : "stmt";
  }
  if (metric.statementCoverage.status === "measured") {
    return "stmt";
  }
  if (metric.branchCoverage.status === "measured") {
    return "branch";
  }
  return "stmt";
}

function formatNullableNumber(value: number | null): string {
  return value === null ? "N/A" : formatNumber(value);
}

function formatJunitNullableNumber(value: number | null): string {
  return value === null ? "" : formatNumber(value);
}

function formatJunitDiagnosticNumber(value: number | null): string {
  return value === null ? "N/A" : formatNumber(value);
}

function formatJunitDiagnosticPercent(value: number | null): string {
  return value === null ? "N/A" : `${formatNumber(value)}%`;
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

function methodProperties(entry: MethodReportEntry, omitRedundancy: boolean): Array<[string, string]> {
  const properties: Array<[string, string]> = [
    ["crap", formatJunitNullableNumber(entry.crap)],
    ["cc", String(entry.cc)],
    ["cov", formatJunitNullableNumber(entry.cov)],
    ["covKind", entry.covKind],
    ["method", entry.method],
    ["src", entry.src],
    ["lineStart", String(entry.lineStart)],
    ["lineEnd", String(entry.lineEnd)]
  ];
  return omitRedundancy ? properties : [["status", entry.status], ...properties];
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

function toJunitXml(report: AnalysisReport, omitRedundancy: boolean): XmlNode {
  const counts = countJunitMethodStatuses(report.methods);
  const testsuite: XmlNode = {
    "@_name": "crap-typescript",
    "@_status": report.status,
    "@_tests": report.methods.length,
    "@_failures": counts.failures,
    "@_skipped": counts.skipped,
    "@_errors": 0,
    "@_time": 0,
    properties: {
      property: [
        toXmlProperty("threshold", formatNumber(report.threshold)),
        ...sourceExclusionXmlProperties(report.sourceExclusions)
      ]
    }
  };

  if (report.methods.length > 0) {
    testsuite.testcase = report.methods.map((method) => toJunitTestcaseXml(method, report.threshold, omitRedundancy));
  }

  return {
    testsuites: {
      "@_name": "crap-typescript",
      "@_tests": report.methods.length,
      "@_failures": counts.failures,
      "@_skipped": counts.skipped,
      "@_errors": 0,
      "@_time": 0,
      testsuite
    }
  };
}

function optionalSourceExclusions(sourceExclusionAudit: SourceExclusionAudit | undefined): {
  sourceExclusions?: SourceExclusionAudit;
} {
  if (!sourceExclusionAudit || sourceExclusionAudit.excludedFiles === 0) {
    return {};
  }
  return { sourceExclusions: sourceExclusionAudit };
}

function formatTextSourceExclusions(sourceExclusions: SourceExclusionAudit | undefined): string[] {
  if (!sourceExclusions) {
    return [];
  }
  const lines = [
    "sourceExclusions:",
    `  candidates: ${sourceExclusions.candidateFiles}`,
    `  included: ${sourceExclusions.includedFiles}`,
    `  excluded: ${sourceExclusions.excludedFiles}`
  ];
  for (const reason of sourceExclusions.reasons) {
    lines.push(`  ${reason.source} ${reason.kind} ${reason.rule}: ${reason.count}`);
  }
  return lines;
}

function sourceExclusionXmlProperties(sourceExclusions: SourceExclusionAudit | undefined): XmlNode[] {
  if (!sourceExclusions) {
    return [];
  }
  const properties = [
    toXmlProperty("sourceExclusions.candidateFiles", String(sourceExclusions.candidateFiles)),
    toXmlProperty("sourceExclusions.includedFiles", String(sourceExclusions.includedFiles)),
    toXmlProperty("sourceExclusions.excludedFiles", String(sourceExclusions.excludedFiles))
  ];
  sourceExclusions.reasons.forEach((reason, index) => {
    properties.push(toXmlProperty(
      `sourceExclusions.reason.${index}`,
      `${reason.source} ${reason.kind} ${reason.rule}: ${reason.count}`
    ));
  });
  return properties;
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

function toJunitTestcaseXml(entry: MethodReportEntry, threshold: number, omitRedundancy: boolean): XmlNode {
  return {
    "@_classname": entry.src,
    "@_name": junitTestcaseName(entry),
    "@_file": entry.src,
    "@_time": 0,
    "@_line": entry.lineStart,
    properties: {
      property: methodProperties(entry, omitRedundancy).map(([name, value]) => toXmlProperty(name, value))
    },
    ...junitStatusXml(entry, threshold)
  };
}

function junitTestcaseName(entry: MethodReportEntry): string {
  return `${entry.method}:${entry.lineStart}`;
}

function toXmlProperty(name: string, value: string): XmlNode {
  return {
    "@_name": name,
    "@_value": value
  };
}

function junitStatusXml(entry: MethodReportEntry, threshold: number): XmlNode {
  if (entry.status === "failed") {
    const message = `CRAP score ${formatNullableNumber(entry.crap)} exceeds threshold ${formatNumber(threshold)}`;
    return {
      failure: {
        "@_type": "crap-threshold",
        "@_message": message,
        "#text": junitDiagnosticText(entry, threshold)
      }
    };
  }
  if (entry.status === "skipped") {
    return {
      skipped: {
        "@_message": "CRAP score unavailable",
        "#text": junitDiagnosticText(entry, threshold)
      }
    };
  }
  return {};
}

function junitDiagnosticText(entry: MethodReportEntry, threshold: number): string {
  return [
    `CRAP score: ${formatJunitDiagnosticNumber(entry.crap)}`,
    `Threshold: ${formatNumber(threshold)}`,
    `Coverage: ${formatJunitDiagnosticPercent(entry.cov)} (${entry.covKind})`,
    `Source: ${entry.src}:${entry.lineStart}-${entry.lineEnd}`,
    `Method: ${entry.method}`,
    `Complexity: ${entry.cc}`
  ].join("\n");
}

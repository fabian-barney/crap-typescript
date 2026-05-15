import { readFile } from "node:fs/promises";
import path from "node:path";

import { normalizeSlashes, toRelativePath } from "./utils.js";
import type {
  AnalyzeProjectOptions,
  SourceExclusionAudit,
  SourceExclusionKind,
  SourceExclusionReasonCount,
  SourceExclusionSource
} from "./types.js";

const DEFAULT_PATH_GLOBS = [
  "**/*.generated.ts",
  "**/*.generated.tsx",
  "**/*.gen.ts",
  "**/*.gen.tsx",
  "**/*Generated.ts",
  "**/*Generated.tsx",
  "**/*_pb.ts",
  "**/*_grpc_pb.ts",
  "**/*.pb.ts",
  "**/*.ngfactory.ts",
  "**/*.ngsummary.ts",
  "**/*.ngtypecheck.ts"
];

const DEFAULT_GENERATED_MARKERS = [
  "@generated",
  "@auto-generated",
  "AUTO-GENERATED",
  "This file was generated",
  "This file is generated",
  "Do not edit",
  "DO NOT EDIT"
];

interface ExclusionReason {
  source: SourceExclusionSource;
  kind: SourceExclusionKind;
  rule: string;
}

interface PathGlobRule extends ExclusionReason {
  pattern: RegExp;
}

interface PathRegexRule extends ExclusionReason {
  pattern: RegExp;
}

interface EffectiveExclusionOptions {
  useDefaultExclusions: boolean;
  userPathGlobs: PathGlobRule[];
  userPathRegexes: PathRegexRule[];
  userGeneratedMarkers: ExclusionReason[];
  defaultPathGlobs: PathGlobRule[];
  defaultGeneratedMarkers: ExclusionReason[];
}

export async function filterSourceFiles(
  projectRoot: string,
  candidateFiles: string[],
  options: AnalyzeProjectOptions
): Promise<{ files: string[]; audit: SourceExclusionAudit }> {
  const effectiveOptions = createEffectiveOptions(options);
  const includedFiles: string[] = [];
  const reasons = new Map<string, SourceExclusionReasonCount>();

  for (const filePath of candidateFiles) {
    const relativePath = normalizedRelativePath(projectRoot, filePath);
    const reason = await exclusionReason(filePath, relativePath, effectiveOptions);
    if (reason) {
      recordReason(reasons, reason);
      continue;
    }
    includedFiles.push(filePath);
  }

  return {
    files: includedFiles,
    audit: {
      candidateFiles: candidateFiles.length,
      includedFiles: includedFiles.length,
      excludedFiles: candidateFiles.length - includedFiles.length,
      reasons: Array.from(reasons.values()).sort(compareReasonCounts)
    }
  };
}

export function emptySourceExclusionAudit(): SourceExclusionAudit {
  return {
    candidateFiles: 0,
    includedFiles: 0,
    excludedFiles: 0,
    reasons: []
  };
}

export function normalizedRelativePath(projectRoot: string, filePath: string): string {
  return toRelativePath(projectRoot, path.resolve(filePath));
}

function createEffectiveOptions(options: AnalyzeProjectOptions): EffectiveExclusionOptions {
  const useDefaultExclusions = options.useDefaultExclusions ?? true;
  return {
    useDefaultExclusions,
    userPathGlobs: (options.excludes ?? []).map((glob) => pathGlobRule("user", glob)),
    userPathRegexes: (options.excludePathRegexes ?? []).map((regex) => pathRegexRule("user", regex)),
    userGeneratedMarkers: (options.excludeGeneratedMarkers ?? []).map((marker) =>
      markerRule("user", marker)
    ),
    defaultPathGlobs: useDefaultExclusions
      ? DEFAULT_PATH_GLOBS.map((glob) => pathGlobRule("default", glob))
      : [],
    defaultGeneratedMarkers: useDefaultExclusions
      ? DEFAULT_GENERATED_MARKERS.map((marker) => markerRule("default", marker))
      : []
  };
}

async function exclusionReason(
  filePath: string,
  relativePath: string,
  options: EffectiveExclusionOptions
): Promise<ExclusionReason | null> {
  return pathExclusionReason(relativePath, options)
    ?? await generatedMarkerExclusionReason(filePath, options);
}

function pathExclusionReason(
  relativePath: string,
  options: EffectiveExclusionOptions
): ExclusionReason | null {
  if (options.useDefaultExclusions) {
    const directoryReason = generatedDirectoryReason(relativePath);
    if (directoryReason) {
      return directoryReason;
    }
  }
  return firstMatchingPathGlob(relativePath, options.defaultPathGlobs)
    ?? firstMatchingPathGlob(relativePath, options.userPathGlobs)
    ?? firstMatchingPathRegex(relativePath, options.userPathRegexes);
}

function generatedDirectoryReason(relativePath: string): ExclusionReason | null {
  const segments = normalizeSlashes(relativePath).split("/");
  for (const segment of segments.slice(0, -1)) {
    const normalizedSegment = segment.toLowerCase();
    if (normalizedSegment.includes("generated")) {
      return {
        source: "default",
        kind: "path",
        rule: "directory segment contains generated"
      };
    }
    if (normalizedSegment === "gen") {
      return {
        source: "default",
        kind: "path",
        rule: "directory segment is gen"
      };
    }
  }
  return null;
}

function firstMatchingPathGlob(relativePath: string, rules: PathGlobRule[]): ExclusionReason | null {
  return rules.find((rule) => rule.pattern.test(relativePath)) ?? null;
}

function firstMatchingPathRegex(relativePath: string, rules: PathRegexRule[]): ExclusionReason | null {
  return rules.find((rule) => rule.pattern.test(relativePath)) ?? null;
}

async function generatedMarkerExclusionReason(
  filePath: string,
  options: EffectiveExclusionOptions
): Promise<ExclusionReason | null> {
  const markerRules = [...options.defaultGeneratedMarkers, ...options.userGeneratedMarkers];
  if (markerRules.length === 0) {
    return null;
  }
  const header = leadingCommentHeader(await readFile(filePath, "utf8"));
  return markerRules.find((rule) => rule.rule.length > 0 && header.includes(rule.rule)) ?? null;
}

function leadingCommentHeader(sourceText: string): string {
  let index = sourceText.charCodeAt(0) === 0xfeff ? 1 : 0;
  const comments: string[] = [];

  while (index < sourceText.length) {
    index = skipWhitespace(sourceText, index);
    const comment = readLeadingComment(sourceText, index);
    if (!comment) {
      break;
    }
    comments.push(comment.text);
    index = comment.nextIndex;
  }

  return comments.join("\n");
}

interface LeadingComment {
  text: string;
  nextIndex: number;
}

function readLeadingComment(sourceText: string, index: number): LeadingComment | null {
  if (sourceText.startsWith("#!", index) || sourceText.startsWith("//", index)) {
    return readLineComment(sourceText, index);
  }
  if (sourceText.startsWith("/*", index)) {
    return readBlockComment(sourceText, index);
  }
  return null;
}

function readLineComment(sourceText: string, index: number): LeadingComment {
  const end = nextLineIndex(sourceText, index);
  return {
    text: sourceText.slice(index, end),
    nextIndex: end
  };
}

function readBlockComment(sourceText: string, index: number): LeadingComment {
  const end = sourceText.indexOf("*/", index + 2);
  if (end === -1) {
    return {
      text: sourceText.slice(index),
      nextIndex: sourceText.length
    };
  }
  return {
    text: sourceText.slice(index, end + 2),
    nextIndex: end + 2
  };
}

function skipWhitespace(sourceText: string, startIndex: number): number {
  let index = startIndex;
  while (index < sourceText.length && /\s/.test(sourceText[index])) {
    index += 1;
  }
  return index;
}

function nextLineIndex(sourceText: string, startIndex: number): number {
  const lineFeed = sourceText.indexOf("\n", startIndex);
  return lineFeed === -1 ? sourceText.length : lineFeed;
}

function pathGlobRule(source: SourceExclusionSource, glob: string): PathGlobRule {
  return {
    source,
    kind: "path",
    rule: glob,
    pattern: globToRegex(glob)
  };
}

function pathRegexRule(source: SourceExclusionSource, regex: string): PathRegexRule {
  return {
    source,
    kind: "pathRegex",
    rule: regex,
    pattern: new RegExp(regex)
  };
}

function markerRule(source: SourceExclusionSource, marker: string): ExclusionReason {
  return {
    source,
    kind: "generatedMarker",
    rule: marker
  };
}

function globToRegex(glob: string): RegExp {
  const normalizedGlob = normalizeGlob(glob);
  let pattern = "^";
  for (let index = 0; index < normalizedGlob.length; index += 1) {
    const char = normalizedGlob[index];
    if (char === "*") {
      const nextChar = normalizedGlob[index + 1];
      if (nextChar === "*") {
        if (normalizedGlob[index + 2] === "/") {
          pattern += "(?:.*/)?";
          index += 2;
        } else {
          pattern += ".*";
          index += 1;
        }
      } else {
        pattern += "[^/]*";
      }
      continue;
    }
    if (char === "?") {
      pattern += "[^/]";
      continue;
    }
    pattern += escapeRegex(char);
  }
  return new RegExp(`${pattern}$`, "i");
}

function normalizeGlob(glob: string): string {
  const normalized = normalizeSlashes(glob).replace(/^\.\//, "");
  return normalized.includes("/") ? normalized : `**/${normalized}`;
}

function escapeRegex(value: string): string {
  return value.replace(/[\\^$.*+?()[\]{}|]/g, "\\$&");
}

function recordReason(reasons: Map<string, SourceExclusionReasonCount>, reason: ExclusionReason): void {
  const key = `${reason.source}\0${reason.kind}\0${reason.rule}`;
  const existing = reasons.get(key);
  if (existing) {
    existing.count += 1;
    return;
  }
  reasons.set(key, {
    source: reason.source,
    kind: reason.kind,
    rule: reason.rule,
    count: 1
  });
}

function compareReasonCounts(left: SourceExclusionReasonCount, right: SourceExclusionReasonCount): number {
  return left.source.localeCompare(right.source)
    || left.kind.localeCompare(right.kind)
    || left.rule.localeCompare(right.rule);
}

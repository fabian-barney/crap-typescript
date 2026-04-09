import { readFile } from "node:fs/promises";
import path from "node:path";

const tagRef = process.env.GITHUB_REF_NAME ?? process.argv[2];
if (!tagRef) {
  throw new Error("A tag name is required.");
}

const expectedVersion = tagRef.startsWith("v") ? tagRef.slice(1) : tagRef;
const changelog = await readFile(path.resolve("CHANGELOG.md"), "utf8");
const lines = changelog.replace(/\r\n/g, "\n").split("\n");
const sectionHeader = `## [${expectedVersion}]`;
const startIndex = lines.findIndex((line) => line.startsWith(sectionHeader));

if (startIndex === -1) {
  throw new Error(`CHANGELOG.md does not contain a section for ${expectedVersion}.`);
}

const sectionLines = [];
for (let index = startIndex + 1; index < lines.length; index += 1) {
  const line = lines[index];
  if (line.startsWith("## [")) {
    break;
  }
  sectionLines.push(line);
}

const releaseNotes = sectionLines.join("\n").trim();
if (!releaseNotes) {
  throw new Error(`CHANGELOG.md section ${expectedVersion} is empty.`);
}

process.stdout.write(`${releaseNotes}\n`);

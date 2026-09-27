import { packages, readJson, validateVersions } from "./release-lib.mjs";

const tagRef = process.argv[2] ?? process.env.GITHUB_REF_NAME;
if (!tagRef) {
  throw new Error("A tag name is required.");
}

const expectedVersion = tagRef.startsWith("v") ? tagRef.slice(1) : tagRef;
validateVersions(expectedVersion, readJson("package.json"), packages(), readJson("package-lock.json"));

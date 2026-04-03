#!/usr/bin/env node
import { runCli } from "crap-typescript-core";

void runCli(process.argv.slice(2)).then((exitCode) => {
  process.exitCode = exitCode;
});

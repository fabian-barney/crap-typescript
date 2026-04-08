#!/usr/bin/env node
import { runCli } from "@barney-media/crap-typescript-core";

void runCli(process.argv.slice(2)).then((exitCode) => {
  process.exitCode = exitCode;
});

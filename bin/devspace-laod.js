#!/usr/bin/env node
import { runLaoDaemon } from "../dist/lao/daemon-main.js";
runLaoDaemon().catch((error) => {
  console.error("LAO daemon failed:", error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});

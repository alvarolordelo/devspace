import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import test from "node:test";

test("LAO Windows tray uses approved icons and parses without opening a GUI",
  { skip: process.platform !== "win32" }, () => {
    const tray = fileURLToPath(new URL("./windows/lao-tray.ps1", import.meta.url));
    const stdout = execFileSync("powershell.exe", [
      "-NoProfile", "-STA", "-ExecutionPolicy", "Bypass", "-File", tray, "-CheckOnly",
    ], { encoding: "utf8", windowsHide: true, timeout: 15000 });
    assert.match(stdout, /LAO tray check passed/);
    // The operator must still explicitly start the monitor in an interactive session.
  });

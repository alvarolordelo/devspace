import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

const installer = fileURLToPath(new URL("../../scripts/install-lao-shortcuts.ps1", import.meta.url));
test("LAO shortcut uses the approved icon, cannot expose credentials, and is reversible",
  { skip: process.platform !== "win32" }, () => {
    const folder = mkdtempSync(join(tmpdir(), "lao-shortcut-"));
    const ps = (args: string[]) => execFileSync("powershell.exe", [
      "-NoProfile", "-ExecutionPolicy", "Bypass", "-File", installer,
      "-DesktopOnly", "-DestinationDirectory", folder, ...args,
    ], { encoding: "utf8", timeout: 15000, windowsHide: true });
    try {
      assert.match(ps([]), /LAO shortcut ready/);
      const inspect = execFileSync("powershell.exe", [
        "-NoProfile", "-Command",
        `$s=(New-Object -ComObject WScript.Shell).CreateShortcut('${join(folder, "LAO DevSpace Monitor.lnk").replaceAll("'", "''")}');` +
        "[pscustomobject]@{Target=$s.TargetPath;Args=$s.Arguments;Icon=$s.IconLocation} | ConvertTo-Json -Compress",
      ], { encoding: "utf8", timeout: 15000, windowsHide: true });
      const shortcut = JSON.parse(inspect);
      assert.match(shortcut.Target, /powershell\.exe$/i);
      assert.match(shortcut.Args, /-STA.*-File .*launch-lao-monitor\.ps1/i);
      assert.match(shortcut.Icon, /lao-tray-idle\.ico,0$/i);
      assert.doesNotMatch(JSON.stringify(shortcut), /token\.txt|LAO_DASHBOARD_TOKEN/i);
      assert.match(ps([]), /LAO shortcut ready/, "creating twice is safe");
      assert.match(ps(["-Remove"]), /Removed LAO shortcut/);
      assert.doesNotThrow(() => ps(["-Remove"]));
    } finally {
      rmSync(folder, { recursive: true, force: true });
    }
  });

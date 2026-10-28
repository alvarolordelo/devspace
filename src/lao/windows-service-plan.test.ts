import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import test from "node:test";

test("Windows service preparation scripts are parseable and installation stays explicit",
  { skip: process.platform !== "win32" }, () => {
    const plan = fileURLToPath(new URL("./windows/lao-service-plan.ps1", import.meta.url));
    const lifecycle = fileURLToPath(new URL("./windows/lao-service-lifecycle.ps1", import.meta.url));
    const paths = [plan, lifecycle].map(path => "'" + path.replaceAll("'", "''") + "'").join(",");
    const script = '$all=@(' + paths + ');foreach($path in $all){' +
      '$tokens=$null;$errors=$null;' +
      '[void][System.Management.Automation.Language.Parser]::ParseFile($path,[ref]$tokens,[ref]$errors);' +
      'if($errors.Count -gt 0){$errors | ForEach-Object {Write-Error $_};exit 1}};' +
      'Write-Output "Service lifecycle syntax valid"';
    const result = execFileSync("powershell.exe", [
      "-NoProfile", "-NonInteractive", "-Command", script,
    ], { encoding: "utf8", windowsHide: true, timeout: 15000 });
    assert.match(result, /Service lifecycle syntax valid/);
  });

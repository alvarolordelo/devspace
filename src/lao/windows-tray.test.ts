import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { execFile } from "node:child_process";
import { readFileSync, readdirSync } from "node:fs";
import { createServer } from "node:http";
import { dirname, join } from "node:path";
import type { AddressInfo } from "node:net";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import test from "node:test";

const run = promisify(execFile);
const tray = fileURLToPath(new URL("./windows/lao-tray.ps1", import.meta.url));
const token = "lao-test-local-monitor-access-token-12345";

test("LAO native action icons are supplied as approved vector-origin image assets", () => {
  const assetRoot = fileURLToPath(new URL("../../docs/lao-devspace/assets/icons/", import.meta.url));
  const sources = ["abrir-painel", "logs", "reiniciar", "configuracoes",
    "revisao", "chevron-direita", "documento"];
  const outputs = ["abrir-painel", "logs", "reiniciar", "configuracoes",
    "revisao", "chevron-direita", "documento-verde", "documento-amarelo",
    "documento-vermelho"];
  for (const icon of sources) {
    const svg = readFileSync(join(assetRoot, "actions", icon + ".svg"), "utf8");
    assert.match(svg, /viewBox="0 0 24 24"/);
    assert.match(svg, /<(path|rect|circle)\b/);
    const body = svg.replace('xmlns="http://www.w3.org/2000/svg"', "");
    assert.doesNotMatch(body, /<(text|image|use|script|foreignObject)\b|<\!DOCTYPE|https?:\/\//i,
      `${icon}: only locally maintained vector geometry is allowed`);
  }
  for (const icon of outputs) {
    const bitmap = readFileSync(join(assetRoot, "png", `lao-action-${icon}-64.png`));
    assert.ok(bitmap.subarray(0, 8).equals(Buffer.from("89504e470d0a1a0a", "hex")), icon);
    assert.equal(bitmap.readUInt32BE(16), 64, `${icon}: wrong raster width`);
    assert.equal(bitmap.readUInt32BE(20), 64, `${icon}: wrong raster height`);
    assert.ok(bitmap.byteLength > 350, `${icon}: empty or missing artwork`);
  }
  const popup = readFileSync(fileURLToPath(new URL("./windows/lao-popup.ps1", import.meta.url)), "utf8");
  assert.match(popup, /\[IO\.File\]::ReadAllBytes\(\$assetPath\)/);
  assert.match(popup, /\[Drawing\.Bitmap\]::new\(\$sourceImage\)/);
  assert.match(popup, /\$settings\.Tag=\$assets\['configuracoes'\]/);
  assert.match(popup, /\$cardIcon\.Image=\$assets\['documento-verde'\]/);
  assert.doesNotMatch(popup, /Text\s*=\s*'⚙'|DrawText\(\$_\.Graphics,'›'/,
    "Do not regress to OS-dependent font glyphs for approved icons");
});

test("Windows tray preserves approved popup and never opens settings from dependency status rows", () => {
  const popup = readFileSync(fileURLToPath(new URL("./windows/lao-popup.ps1", import.meta.url)), "utf8");
  const trayText = readFileSync(tray, "utf8");
  const settings = readFileSync(fileURLToPath(new URL("./windows/lao-settings.ps1", import.meta.url)), "utf8");
  assert.match(popup, /\$modelCombo\.DropDownStyle=\[Windows\.Forms\.ComboBoxStyle\]::DropDownList/);
  assert.match(trayText, /dashboard\/api\/models\/select/);
  assert.match(trayText, /function Open-LaoSettings/);
  assert.match(settings, /Iniciar LAO e Monitor com Windows/);
  assert.match(settings, /Restart-Service -Name \$fresh\.ServiceName/);
  assert.match(settings, /Start-Service -Name \$fresh\.ServiceName/);
  assert.match(settings, /function Get-LaoDependencyRecoveryAction/);
  assert.match(settings, /devspace_unavailable/);
  assert.doesNotMatch(settings, /reasons\s*-contains\s*'devspace_unverified'/,
    "DevSpace not verified is not an outage and must not allow a restart");
  assert.match(trayText, /\$control\.Add_Click\(\{ Invoke-LaoDependencyRowClick/);
  assert.doesNotMatch(trayText, /Rows\[\$key\]\.Title\.Add_Click\(\{ Open-LaoSettings \}\)/);
  assert.match(trayText, /function Update-LaoDependencyRowActions/);
  assert.match(settings, /MessageBoxButtons\]::YesNo/);
  assert.match(settings, /LAO_MANAGED_OLLAMA_SERVICE/);
  assert.match(settings, /LAO_MANAGED_DEVSPACE_SERVICE/);
});

test("Windows PowerShell 5.1 entrypoints keep the UTF-8 BOM when non-ASCII labels are present", () => {
  const dirs = [dirname(tray), fileURLToPath(new URL("../../scripts/", import.meta.url))];
  for (const directory of dirs) {
    for (const name of readdirSync(directory).filter(name => name.endsWith(".ps1"))) {
      const bytes = readFileSync(join(directory, name));
      const bom = bytes.subarray(0, 3).equals(Buffer.from([0xef, 0xbb, 0xbf]));
      // Legacy powershell.exe reads UTF-8 sans BOM as the ANSI code page.
      if (bytes.some(byte => byte > 0x7f)) {
        assert.ok(bom, `${name}: PowerShell 5.1 requires UTF-8 BOM for accents/symbols`);
      }
    }
  }
});

test("LAO Windows tray uses approved icons and parses without opening a GUI",
  { skip: process.platform !== "win32" }, () => {
    const stdout = execFileSync("powershell.exe", [
      "-NoProfile", "-STA", "-ExecutionPolicy", "Bypass", "-File", tray, "-CheckOnly",
    ], { encoding: "utf8", windowsHide: true, timeout: 15000 });
    assert.match(stdout, /LAO tray check passed/);
    // The operator must still explicitly start the monitor in an interactive session.
  });

test("native LAO popup matches the approved 420 DIP structure without opening a window",
  { skip: process.platform !== "win32" }, () => {
    const stdout = execFileSync("powershell.exe", [
      "-NoProfile", "-STA", "-ExecutionPolicy", "Bypass", "-File", tray, "-UiCheckOnly",
    ], { encoding: "utf8", windowsHide: true, timeout: 15000 });
    const layout = JSON.parse(stdout) as {
      validated: boolean; widthDip: number; healthRows: number;
      actions: number; keyboardEscape: boolean; fontFamily: string;
      uiTextBase64: string;
    };
    assert.equal(layout.validated, true);
    assert.equal(layout.widthDip, 420);
    assert.equal(layout.healthRows, 8);
    assert.equal(layout.actions, 4);
    assert.equal(layout.keyboardEscape, true);
    assert.equal(layout.fontFamily, "Segoe UI");
    const labels = JSON.parse(Buffer.from(layout.uiTextBase64, "base64").toString("utf8"));
    assert.equal(labels.settings, "Configurações");
    assert.equal(labels.model, "Modelo padrão");
    assert.equal(labels.last, "Última execução");
    assert.equal(labels.statusDot, "●");
    assert.equal(labels.dashboardAction, "Abrir painel");
    assert.equal(labels.restartAction, "Reiniciar LAO");
    assert.equal(labels.idleHeading, "Atenção · parcialmente disponível");
  });

test("LAO Windows tray polls loopback status and reads task counts only with a Bearer token",
  { skip: process.platform !== "win32" }, async () => {
    let tokenUsed = false;
    const server = createServer((req, res) => {
      res.setHeader("content-type", "application/json");
      if (req.url === "/health/live") {
        res.end(JSON.stringify({ live: true }));
      } else if (req.url === "/health/ready") {
        res.end(JSON.stringify({ ready: true }));
      } else if (req.url === "/dashboard/api/tasks") {
        tokenUsed = true;
        if (req.headers.authorization !== "Bearer " + token) {
          res.writeHead(401); res.end(JSON.stringify({ error: "unauthorized" }));
          return;
        }
        res.end(JSON.stringify({ tasks: [
          { status: "running" }, { status: "awaiting_review" },
          { status: "completed" }, { status: "validating" },
        ] }));
      } else { res.writeHead(404); res.end("{}"); }
    });
    await new Promise<void>(resolve => server.listen(0, "127.0.0.1", resolve));
    const port = (server.address() as AddressInfo).port;
    const probe = async (secret?: string) => {
      const env = { ...process.env };
      if (secret) env.LAO_DASHBOARD_TOKEN = secret;
      else delete env.LAO_DASHBOARD_TOKEN;
      const { stdout } = await run("powershell.exe", [
        "-NoProfile", "-STA", "-ExecutionPolicy", "Bypass", "-File",
        tray, "-ProbeOnly", "-Port", String(port),
      ], { env, timeout: 15000, windowsHide: true });
      assert.doesNotMatch(stdout, /lao-test-local-monitor-access-token/);
      return JSON.parse(stdout) as {
        status: string; activeTasks: number | null;
        pendingReviews: number | null; tasksAuthenticated: boolean;
      };
    };
    try {
      const without = await probe();
      assert.equal(without.status, "active");
      assert.equal(without.activeTasks, null, "unknown is not zero");
      assert.equal(without.tasksAuthenticated, false);
      assert.equal(tokenUsed, false);

      const withToken = await probe(token);
      assert.equal(tokenUsed, true);
      assert.equal(withToken.status, "review");
      assert.equal(withToken.activeTasks, 2);
      assert.equal(withToken.pendingReviews, 1);
      assert.equal(withToken.tasksAuthenticated, true);

      const unauthorized = await probe("x".repeat(40));
      assert.equal(unauthorized.tasksAuthenticated, false);
      assert.equal(unauthorized.activeTasks, null);
    } finally { await new Promise<void>(resolve => server.close(() => resolve())); }
  });

test("LAO Windows tray reports an unavailable daemon without a false task count",
  { skip: process.platform !== "win32" }, async () => {
    const server = createServer((_req, res) => {
      res.writeHead(503, { "content-type": "application/json" }); res.end("{}");
    });
    await new Promise<void>(resolve => server.listen(0, "127.0.0.1", resolve));
    const port = (server.address() as AddressInfo).port;
    try {
      const { stdout } = await run("powershell.exe", [
        "-NoProfile", "-STA", "-ExecutionPolicy", "Bypass", "-File",
        tray, "-ProbeOnly", "-Port", String(port),
      ], { timeout: 15000, windowsHide: true });
      const result = JSON.parse(stdout) as { status: string; activeTasks: number | null };
      assert.equal(result.status, "offline");
      assert.equal(result.activeTasks, null);
    } finally { await new Promise<void>(resolve => server.close(() => resolve())); }
  });

test("LAO Windows tray never follows a dashboard redirect with its secret",
  { skip: process.platform !== "win32" }, async () => {
    let interceptedAuthorization: string | undefined;
    const receiver = createServer((req, res) => {
      interceptedAuthorization = req.headers.authorization;
      res.writeHead(200, { "content-type": "application/json" });
      res.end(JSON.stringify({ tasks: [{ status: "awaiting_review" }] }));
    });
    await new Promise<void>(resolve => receiver.listen(0, "127.0.0.1", resolve));
    const receiverPort = (receiver.address() as AddressInfo).port;
    const server = createServer((req, res) => {
      if (req.url === "/health/live") {
        res.writeHead(200, { "content-type": "application/json" });
        res.end(JSON.stringify({ live: true }));
      } else if (req.url === "/health/ready") {
        res.writeHead(200, { "content-type": "application/json" });
        res.end(JSON.stringify({ ready: true }));
      } else {
        res.writeHead(302, { location: "http://127.0.0.1:" + receiverPort + "/capture" });
        res.end();
      }
    });
    await new Promise<void>(resolve => server.listen(0, "127.0.0.1", resolve));
    try {
      const { stdout } = await run("powershell.exe", [
        "-NoProfile", "-STA", "-ExecutionPolicy", "Bypass", "-File",
        tray, "-ProbeOnly", "-Port", String((server.address() as AddressInfo).port),
      ], { env: { ...process.env, LAO_DASHBOARD_TOKEN: token },
        timeout: 15000, windowsHide: true });
      const result = JSON.parse(stdout) as { status: string; tasksAuthenticated: boolean };
      assert.equal(result.status, "active");
      assert.equal(result.tasksAuthenticated, false);
      assert.equal(interceptedAuthorization, undefined);
    } finally {
      await new Promise<void>(resolve => server.close(() => resolve()));
      await new Promise<void>(resolve => receiver.close(() => resolve()));
    }
  });

test("LAO Windows tray keeps pumping UI events while a slow health request is pending",
  { skip: process.platform !== "win32" }, async () => {
    const server = createServer((req, res) => {
      res.setHeader("content-type", "application/json");
      if (req.url === "/health/live") {
        setTimeout(() => res.end(JSON.stringify({ live: true })), 1250);
      } else if (req.url === "/health/ready") {
        res.end(JSON.stringify({ ready: true }));
      } else if (req.url === "/dashboard/api/tasks") {
        if (req.headers.authorization !== "Bearer " + token) {
          res.writeHead(401); res.end("{}"); return;
        }
        res.end(JSON.stringify({ tasks: [
          { status: "running" }, { status: "awaiting_review" },
        ] }));
      } else { res.writeHead(404); res.end("{}"); }
    });
    await new Promise<void>(resolve => server.listen(0, "127.0.0.1", resolve));
    try {
      const { stdout } = await run("powershell.exe", [
        "-NoProfile", "-STA", "-ExecutionPolicy", "Bypass", "-File",
        tray, "-AsyncProbeOnly", "-Port", String((server.address() as AddressInfo).port),
      ], { env: { ...process.env, LAO_DASHBOARD_TOKEN: token },
        timeout: 15000, windowsHide: true });
      const result = JSON.parse(stdout) as {
        status: string; activeTasks: number; pendingReviews: number;
        tasksAuthenticated: boolean; uiHeartbeatTicks: number;
      };
      assert.equal(result.status, "review");
      assert.equal(result.activeTasks, 1);
      assert.equal(result.pendingReviews, 1);
      assert.equal(result.tasksAuthenticated, true);
      assert.ok(result.uiHeartbeatTicks >= 6,
        "the WinForms timer must continue ticking during the delayed HTTP response");
    } finally {
      await new Promise<void>(resolve => server.close(() => resolve()));
    }
  });

test("LAO asynchronous tray never sends a Bearer token to a redirect destination",
  { skip: process.platform !== "win32" }, async () => {
    let redirected = false;
    const receiver = createServer((_req, res) => {
      redirected = true; res.end("{}");
    });
    await new Promise<void>(resolve => receiver.listen(0, "127.0.0.1", resolve));
    const receiverPort = (receiver.address() as AddressInfo).port;
    const server = createServer((req, res) => {
      res.setHeader("content-type", "application/json");
      if (req.url === "/health/live") res.end(JSON.stringify({ live: true }));
      else if (req.url === "/health/ready") res.end(JSON.stringify({ ready: true }));
      else {
        res.writeHead(302, { location: "http://127.0.0.1:" + receiverPort + "/capture" });
        res.end();
      }
    });
    await new Promise<void>(resolve => server.listen(0, "127.0.0.1", resolve));
    try {
      const { stdout } = await run("powershell.exe", [
        "-NoProfile", "-STA", "-ExecutionPolicy", "Bypass", "-File",
        tray, "-AsyncProbeOnly", "-Port", String((server.address() as AddressInfo).port),
      ], { env: { ...process.env, LAO_DASHBOARD_TOKEN: token },
        timeout: 15000, windowsHide: true });
      const result = JSON.parse(stdout) as {
        status: string; tasksAuthenticated: boolean;
      };
      assert.equal(result.status, "active");
      assert.equal(result.tasksAuthenticated, false);
      assert.equal(redirected, false);
    } finally {
      await new Promise<void>(resolve => server.close(() => resolve()));
      await new Promise<void>(resolve => receiver.close(() => resolve()));
    }
  });

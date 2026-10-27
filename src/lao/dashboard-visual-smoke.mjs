#!/usr/bin/env node
/** Explicit local visual QA: Chrome DevTools Protocol, no downloads or installs.
 * A strong operator token is read from an external local file, never an argv.
 * Screenshot is saved outside the project; all browser processes are closed.
 */
import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, isAbsolute, join, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

const args = process.argv.slice(2);
if (![8,10].includes(args.length) || args[0] !== "--url" || args[2] !== "--token-file" ||
    args[4] !== "--chrome-exe" || args[6] !== "--out" ||
    (args.length === 10 && args[8] !== "--scale")) {
  throw new Error("Usage: node scripts/lao-dashboard-visual-smoke.mjs --url http://127.0.0.1:7877/dashboard --token-file <external-token.txt> --chrome-exe <chrome.exe> --out <new-external-screenshot.png> [--scale 1|1.25|1.5]");
}
const scale = args.length === 10 ? Number(args[9]) : 1;
if (![1,1.25,1.5].includes(scale)) throw new Error("Unsupported QA DPI scale");
const url = new URL(args[1]);
if (url.protocol !== "http:" || !["localhost", "127.0.0.1"].includes(url.hostname) ||
    url.pathname !== "/dashboard" || url.search || url.hash ||
    url.username || url.password || !["", "80", "7877"].includes(url.port)) {
  throw new Error("Visual smoke accepts only the local LAO dashboard URL");
}
const [tokenFile, chrome, output] = [args[3], args[5], args[7]].map(path => resolve(path));
if (![args[3], args[5], args[7]].every(isAbsolute) ||
    !chrome.toLowerCase().endsWith(".exe") || !existsSync(chrome) ||
    !output.toLowerCase().endsWith(".png") || existsSync(output)) {
  throw new Error("Visual smoke requires absolute input paths and a new PNG output");
}
const project = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
if (output.startsWith(project + sep) || tokenFile.startsWith(project + sep)) {
  throw new Error("Token and visual evidence must stay outside the Git checkout");
}
const secret = (await readFile(tokenFile, "utf8")).trim();
if (!/^[\x21-\x7e]{32,256}$/.test(secret)) throw new Error("Invalid operator token");
const profile = await mkdtemp(join(tmpdir(), "lao-design-cdp-"));
let browser;
let ws;
const sleep = ms => new Promise(done => setTimeout(done, ms));
async function until(fn, timeoutMs = 12_000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const found = await fn().catch(() => null);
    if (found) return found;
    await sleep(180);
  }
  throw new Error("Visual smoke timed out");
}
try {
  browser = spawn(chrome, ["--headless=new", "--disable-gpu", "--no-first-run",
    "--no-default-browser-check", "--disable-background-networking",
    "--remote-debugging-port=0", "--user-data-dir=" + profile,
    "--window-size=1280,900", url.href], {
    windowsHide: true, stdio: "ignore", shell: false,
  });
  const info = await until(async () => {
    const data = await readFile(join(profile, "DevToolsActivePort"), "utf8");
    const port = Number(data.split(/\r?\n/)[0]);
    return port > 1024 && port < 65536 ? port : null;
  });
  const page = await until(async () => {
    const response = await fetch("http://127.0.0.1:" + info + "/json/list", {
      signal: AbortSignal.timeout(1200),
    });
    return (await response.json()).find(p => p.type === "page" &&
      p.url.startsWith("http://127.0.0.1:7877/dashboard"));
  });
  ws = new WebSocket(page.webSocketDebuggerUrl);
  await new Promise((done, reject) => {
    ws.addEventListener("open", done, { once: true });
    ws.addEventListener("error", reject, { once: true });
  });
  let callId = 0;
  const pending = new Map();
  ws.addEventListener("message", event => {
    const message = JSON.parse(event.data);
    if (!message.id || !pending.has(message.id)) return;
    const task = pending.get(message.id);
    pending.delete(message.id);
    if (message.error) task.reject(new Error(message.error.message));
    else task.resolve(message.result);
  });
  function cmd(method, params = {}) {
    const id = ++callId;
    return new Promise((resolve, reject) => {
      pending.set(id, { resolve, reject });
      ws.send(JSON.stringify({ id, method, params }));
    });
  }
  async function evaluate(expression) {
    const answer = await cmd("Runtime.evaluate", {
      expression, returnByValue: true, awaitPromise: true,
    });
    if (answer.exceptionDetails) throw new Error("Browser JavaScript exception");
    return answer.result?.value;
  }
  await cmd("Runtime.enable");
  await cmd("Page.enable");
  await cmd("Emulation.setDeviceMetricsOverride", {
    width: 1280, height: 900, deviceScaleFactor: scale, mobile: false,
  });
  const initialized = await until(async () =>
    await evaluate("Boolean(document.querySelector('#form') && document.querySelector('#token'))"));
  if (!initialized) throw new Error("Dashboard login did not render");
  await evaluate("document.getElementById('token').value=" + JSON.stringify(secret) +
    ";document.getElementById('form').requestSubmit();");
  await until(async () =>
    await evaluate("document.getElementById('content') && !document.getElementById('content').classList.contains('hidden')"));
  const observed = await evaluate("JSON.stringify({title:document.title," +
    "nav:document.querySelectorAll('.nav [data-section]').length," +
    "cards:document.querySelectorAll('.status-grid .panel').length," +
    "background:getComputedStyle(document.querySelector('.panel')).backgroundColor," +
    "logo:document.querySelector('.brand img')?.complete," +
    "tokenDisplayed:Boolean(document.getElementById('token').value)})");
  const layout = JSON.parse(observed);
  if (layout.nav !== 5 || layout.cards !== 4 ||
      layout.background !== "rgb(255, 255, 255)" ||
      layout.logo !== true || layout.tokenDisplayed !== false) {
    throw new Error("Approved dashboard DOM/visual contract failed");
  }
  const capture = await cmd("Page.captureScreenshot", {
    format: "png", fromSurface: true, captureBeyondViewport: true,
  });
  if (!/^[A-Za-z0-9+/=]+$/.test(capture.data) ||
      capture.data.length < 8000) throw new Error("Browser screenshot invalid");
  await writeFile(output, Buffer.from(capture.data, "base64"), { flag: "wx" });
  await cmd("Emulation.setDeviceMetricsOverride", {
    width: 390, height: 844, deviceScaleFactor: 1, mobile: true,
  });
  const mobile = JSON.parse(await evaluate("JSON.stringify({width:innerWidth," +
    "documentWidth:document.documentElement.scrollWidth," +
    "navVisible:getComputedStyle(document.querySelector('.nav')).display !== 'none'})"));
  if (!mobile.navVisible || mobile.documentWidth > mobile.width + 1) {
    throw new Error("Approved dashboard overflows the 390px mobile viewport");
  }
  console.log(JSON.stringify({
    visualSmoke: "passed", dashboardReady: true, nav: layout.nav,
    statusCards: layout.cards, scale, mobileWidth: mobile.width, screenshot: output,
    noTokenInOutput: true, noSoftwareInstalled: true,
  }));
} finally {
  if (ws) ws.close();
  if (browser && !browser.killed) browser.kill();
  await sleep(350);
  await rm(profile, { recursive: true, force: true, maxRetries: 4, retryDelay: 200 }).catch(() => undefined);
}

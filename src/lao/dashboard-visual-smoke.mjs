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
    url.username || url.password || !["", "80", "7877", "7878", "7888", "7890", "7894"].includes(url.port)) {
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
      p.url === url.href);
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
  await until(async () => await evaluate(
    "Array.from(document.images).every(img => img.complete && img.naturalWidth > 0)"));
  const iconContract = JSON.parse(await evaluate("JSON.stringify((() => {" +
    "const nav=Array.from(document.querySelectorAll('.nav [data-section]'));" +
    "return {navImages:nav.filter(button=>button.querySelector('img')).length," +
    "totalIcons:document.querySelectorAll('img[src^=\"/dashboard/assets/icons/\"]').length," +
    "allLoaded:Array.from(document.images).every(img=>img.complete&&img.naturalWidth>0)," +
    "noIconGlyphs:nav.every(button=>!button.querySelector('span'))};" +
    "})())"));
  if (iconContract.navImages !== 5 || iconContract.totalIcons < 15 ||
      !iconContract.allLoaded || !iconContract.noIconGlyphs) {
    throw new Error("Approved vector-origin dashboard icons did not render");
  }
  const saved = JSON.parse(await evaluate("JSON.stringify((() => {" +
    "const item=JSON.parse(sessionStorage.getItem('lao-dashboard-session-v1')||'null');" +
    "return {ticketPresent:typeof item?.sessionToken==='string'&&item.sessionToken.length===43," +
    "operatorTokenStored:item?.sessionToken===" + JSON.stringify(secret) + "," +
    "loginHidden:document.getElementById('login').classList.contains('hidden')};" +
    "})())"));
  if (!saved.ticketPresent || saved.operatorTokenStored || !saved.loginHidden) {
    throw new Error("Browser ticket not created or operator token improperly persisted");
  }
  // Actual CDP reload (equivalent to F5) must preserve the authenticated view.
  await cmd("Page.reload", { ignoreCache: true });
  await sleep(300);
  await until(async () =>
    await evaluate("Boolean(document.getElementById('content') && " +
      "!document.getElementById('content').classList.contains('hidden') && " +
      "document.getElementById('login').classList.contains('hidden'))"));
  const interactions = JSON.parse(await evaluate(`JSON.stringify((() => {
    const result = {};
    for (const name of ['status','tarefas','modelos','logs','configuracoes']) {
      document.querySelector('.nav [data-section="' + name + '"]').click();
      const section = document.getElementById('section-' + name);
      const active = document.querySelector('.nav [aria-current="page"]');
      result[name] = !section.classList.contains('hidden') &&
        active?.dataset.section === name &&
        document.documentElement.scrollWidth <= innerWidth + 1;
    }
    const newTask = document.querySelector('button.action.primary');
    result.disabledControls = newTask?.disabled === true &&
      document.getElementById('restart-lao') instanceof HTMLButtonElement;
    document.querySelector('.nav [data-section="status"]').click();
    return result;
  })())`));
  if (Object.values(interactions).some(value => value !== true)) {
    throw new Error("Dashboard navigation, disabled controls or layout interaction failed: " +
      JSON.stringify(interactions));
  }
  // On a daemon with persisted jobs, exercise the real operator-facing task
  // details instead of accepting a raw JSON dump or opaque UUIDs as a UI.
  await evaluate("document.querySelector('.nav [data-section=\"tarefas\"]').click()");
  const hasTasks = await evaluate("document.querySelectorAll('#tasks .task-title').length>0");
  let taskDetailChecked = false;
  if (hasTasks) {
    const readable = await evaluate("Boolean(document.querySelector('#tasks .task-title').textContent.trim())");
    if (!readable) throw new Error("Task list did not display the user request");
    await evaluate("document.querySelector('#tasks .task-title').click()");
    await until(async () => await evaluate(
      "Boolean(!document.getElementById('detail-panel').classList.contains('hidden') && " +
      "document.querySelectorAll('#detail .task-detail-card').length>=4)"));
    const detailView = JSON.parse(await evaluate("JSON.stringify({" +
      "request:document.querySelector('#detail .task-prose')?.textContent?.length>0," +
      "technical:!!document.querySelector('#detail .task-technical summary')," +
      "noRawJson:!document.querySelector('#detail pre')," +
      "noHtmlInjection:!document.querySelector('#detail script,#detail img,#detail iframe')})"));
    if (Object.values(detailView).some(value => value !== true)) {
      throw new Error("Human-readable task details failed the visual smoke");
    }
    taskDetailChecked = true;
  }
  // Validate real persisted AppliedPatchFile objects, not a fabricated string
  // fixture. A previous UI mistakenly rendered these as '[object Object]'.
  let changeDetailsChecked = false;
  const taskResponse = await fetch(url.origin + "/dashboard/api/tasks", {
    headers: { Authorization: "Bearer " + secret }, cache: "no-store",
  });
  if (!taskResponse.ok) throw new Error("Task API is unavailable for file display QA");
  const taskRows = (await taskResponse.json()).tasks ?? [];
  let multiAgentHandoffChecked = false;
  const awaiting = taskRows.find(task =>
    ["awaiting_review", "needs_revision", "interrupted"].includes(task.status));
  if (awaiting) {
    await evaluate("document.querySelector('.nav [data-section=\"tarefas\"]').click()");
    await evaluate("Array.from(document.querySelectorAll('#tasks .detail-button'))" +
      ".find(b=>b.getAttribute('aria-label')?.endsWith(" +
      JSON.stringify(awaiting.id) + "))?.click()");
    await until(async () => await evaluate(
      "Boolean(document.querySelector('#detail .handoff-bar select') && " +
      "document.querySelector('#detail .handoff-bar button'))"));
    const state = JSON.parse(await evaluate("JSON.stringify({" +
      "requestedBy:document.getElementById('detail').textContent.includes(" +
      JSON.stringify(awaiting.requestedBy ?? "unknown") + ")," +
      "instruction:document.querySelector('script')?.textContent.includes('lao_resume')," +
      "otherClient:Array.from(document.querySelectorAll('#detail .handoff-bar option'))" +
      ".some(x=>x.value==='copy')})"));
    if (Object.values(state).some(value => value !== true)) {
      throw new Error("Provider-neutral Resume Work handoff failed the visual smoke");
    }
    multiAgentHandoffChecked = true;
  }
  for (const task of taskRows) {
    if (task.writeMode !== "isolated_worktree") continue;
    const response = await fetch(url.origin + "/dashboard/api/tasks/" + task.id, {
      headers: { Authorization: "Bearer " + secret }, cache: "no-store",
    });
    if (!response.ok) continue;
    const details = await response.json();
    const file = details.changes?.flatMap(change => change.files ?? [])
      .find(file => file && typeof file.path === "string");
    if (!file) continue;
    await evaluate("document.querySelector('.nav [data-section=\"tarefas\"]').click()");
    await evaluate("Array.from(document.querySelectorAll('#tasks .detail-button'))" +
      ".find(b=>b.getAttribute('aria-label')?.endsWith(" +
      JSON.stringify(task.id) + "))?.click()");
    await until(async () => await evaluate(
      "Boolean(document.querySelector('#detail .task-detail-card') && " +
      "document.getElementById('detail').textContent.includes(" + JSON.stringify(file.path) + "))"));
    const valid = await evaluate("!document.getElementById('detail').textContent.includes('[object Object]')");
    if (!valid) throw new Error("Changed file rendered as [object Object]");
    changeDetailsChecked = true;
    break;
  }
  await evaluate("document.querySelector('.nav [data-section=\"status\"]').click()");
  await evaluate("document.getElementById('model-name').click()");
  await until(async () => await evaluate(
    "Boolean(!document.getElementById('model-select').classList.contains('hidden') && " +
    "!document.getElementById('model-select').disabled && " +
    "document.getElementById('model-select').options.length > 0)"));
  const modelsCount = await evaluate("document.getElementById('model-select').options.length");
  if (!Number.isSafeInteger(modelsCount) || modelsCount < 1) {
    throw new Error("Local Ollama model combo returned no installed options");
  }
  await evaluate("document.getElementById('model-select').classList.add('hidden')");
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
  const loggedOut = JSON.parse(await evaluate("JSON.stringify((() => {" +
    "document.getElementById('logout').click();" +
    "return {loginVisible:!document.getElementById('login').classList.contains('hidden')," +
    "ticketRemoved:sessionStorage.getItem('lao-dashboard-session-v1')===null};" +
    "})())"));
  if (!loggedOut.loginVisible || !loggedOut.ticketRemoved) {
    throw new Error("Dashboard logout did not clear the browser ticket");
  }
  // Simulate the tray's authenticated one-use local arm, without putting any
  // secret in the URL or injecting the operator credential into the page.
  const armed = await fetch(url.origin + "/dashboard/api/session/arm", {
    method: "POST", headers: { Authorization: "Bearer " + secret },
    cache: "no-store",
  });
  if (!armed.ok) throw new Error("Native automatic launch grant failed");
  await cmd("Page.reload", { ignoreCache: true });
  await sleep(300);
  await until(async () =>
    await evaluate("Boolean(document.getElementById('content') && " +
      "!document.getElementById('content').classList.contains('hidden') && " +
      "document.getElementById('login').classList.contains('hidden'))"));
  const autoSession = JSON.parse(await evaluate("JSON.stringify((() => {" +
    "const item=JSON.parse(sessionStorage.getItem('lao-dashboard-session-v1')||'null');" +
    "return {ticketPresent:typeof item?.sessionToken==='string'&&item.sessionToken.length===43," +
    "urlClean:!location.search&&!location.href.includes('token=')};" +
    "})())"));
  if (!autoSession.ticketPresent || !autoSession.urlClean) {
    throw new Error("Automatic tray launch did not authenticate without a URL credential");
  }
  await evaluate("document.getElementById('logout').click()");
  console.log(JSON.stringify({
    visualSmoke: "passed", dashboardReady: true, nav: layout.nav,
    statusCards: layout.cards, scale, mobileWidth: mobile.width, screenshot: output,
    navigationChecked: 5, disabledControlsChecked: true, f5PreservesSession: true,
    logoutClearsSession: true, operatorTokenNotStored: true, nativeLaunchAutoLogin: true,
    iconAssetsLoaded: iconContract.totalIcons,
    modelComboOptionsLoaded: modelsCount,
    taskDetailChecked,
    changeDetailsChecked,
    multiAgentHandoffChecked,
    noTokenInOutput: true, noSoftwareInstalled: true,
  }));
} finally {
  if (ws) ws.close();
  if (browser && !browser.killed) browser.kill();
  await sleep(350);
  await rm(profile, { recursive: true, force: true, maxRetries: 4, retryDelay: 200 }).catch(() => undefined);
}

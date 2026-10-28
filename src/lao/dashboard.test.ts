import assert from "node:assert/strict";
import { request } from "node:http";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { loadLaoConfig } from "./config.js";
import { validateLaoDashboardToken } from "./dashboard.js";
import { startLaoHealthServer } from "./health-server.js";
import { startLaoDaemon } from "./daemon.js";
import { LaoTaskStore } from "./task-store.js";

const token = "lao-test-operator-token-32-characters-long";
const cfg = loadLaoConfig({
  DEVSPACE_LAO_ENABLED: "true", DEVSPACE_LAO_OLLAMA_URL: "http://127.0.0.1:1",
});

test("dashboard remains disabled unless operator supplies a strong local token", async () => {
  assert.equal(validateLaoDashboardToken(undefined), undefined);
  assert.equal(validateLaoDashboardToken(""), undefined);
  for (const value of ["short", "a".repeat(257), "a".repeat(31), "hello world\n" + "x".repeat(40)]) {
    assert.throws(() => validateLaoDashboardToken(value), /LAO_DASHBOARD_TOKEN/);
  }
  const server = await startLaoHealthServer(cfg, { port: 0, devspaceReady: () => false });
  try {
    const url = "http://127.0.0.1:" + server.port;
    assert.equal((await fetch(url + "/dashboard")).status, 404);
    assert.equal((await fetch(url + "/dashboard/api/tasks", {
      headers: { Authorization: "Bearer " + token },
    })).status, 404);
  } finally { await server.close(); }
});
test("dashboard API is local-only, authenticated and displays operator task requests safely", async () => {
  const dir = mkdtempSync(join(tmpdir(), "lao-dashboard-"));
  const store = new LaoTaskStore(dir);
  try {
    const task = store.create({
      workspaceId: "ws", goal: "<script>alert('unsafe')</script>",
      requestedBy: "gemini",
      model: "granite4.2-8b:gpu", acceptanceCriteria: ["safe"],
      permissions: { read: true, write: "none", shell: "none" },
      limits: { maxRevisions: 0, maxToolCalls: 1, maxWallSeconds: 10 },
      requireReview: true,
    });
    const daemon = await startLaoDaemon({
      config: cfg, stateDir: dir, port: 0, dashboardToken: token,
    });
    try {
      const url = "http://127.0.0.1:" + daemon.port;
      const home = await fetch(url + "/dashboard");
      assert.equal(home.status, 200);
      const csp = home.headers.get("content-security-policy") ?? "";
      assert.match(csp, /frame-ancestors 'none'/);
      assert.match(csp, /script-src 'nonce-/);
      assert.match(csp, /connect-src 'self'/);
      assert.equal(home.headers.get("cache-control"), "no-store");
      const html = await home.text();
      assert.match(html, /Painel de status|Status dashboard/);
      assert.match(html, /LAO DevSpace/);
      assert.match(html, /Modelos locais|Local models/);
      assert.match(html, /Eventos recentes|Recent events/);
      assert.match(html, /class="sidebar"/);
      assert.match(html, /textContent/);
      assert.doesNotMatch(html, /alert\('unsafe'\)/);
      assert.doesNotMatch(html, new RegExp(token));
      assert.match(csp, /img-src 'self'/);
      const logo = await fetch(url + "/dashboard/assets/logo.png");
      assert.equal(logo.status, 200);
      assert.match(logo.headers.get("content-type") ?? "", /image\/png/);
      const logoBuffer = Buffer.from(await logo.arrayBuffer());
      assert.equal(logoBuffer.subarray(0, 8).toString("hex"), "89504e470d0a1a0a");
      assert.equal((await fetch(url + "/dashboard/assets/logo.png?token=" + token)).status, 403);
      assert.match(html, /\/dashboard\/assets\/icons\/configuracoes\.png/);
      for (const key of ["configuracoes", "abrir-painel", "logs", "reiniciar",
                         "documento-verde", "modelos", "ollama", "status"]) {
        const icon = await fetch(url + "/dashboard/assets/icons/" + key + ".png");
        assert.equal(icon.status, 200, `missing approved dashboard icon: ${key}`);
        assert.equal(icon.headers.get("content-type"), "image/png");
        const bytes = Buffer.from(await icon.arrayBuffer());
        assert.equal(bytes.subarray(0, 8).toString("hex"), "89504e470d0a1a0a");
      }
      assert.equal((await fetch(url + "/dashboard/assets/icons/unknown.png")).status, 404);
      assert.equal((await fetch(url + "/dashboard/assets/icons/logs.png?token=" + token)).status, 403);
      assert.equal((await fetch(url + "/dashboard/assets/icons/logs.png", {
        method: "POST",
      })).status, 403);
      const api = url + "/dashboard/api/tasks";
      assert.equal((await fetch(api)).status, 401);
      assert.equal((await fetch(url + "/dashboard/api/metrics")).status, 401);
      assert.equal((await fetch(url + "/dashboard/api/handoff-providers")).status, 401);
      assert.equal((await fetch(api, { headers: {
        Authorization: "Bearer wrong",
      } })).status, 401);
      assert.equal((await fetch(api, { method: "POST", headers: {
        Authorization: "Bearer " + token,
      } })).status, 403);
      assert.equal((await fetch(api + "?token=" + token, {
        headers: { Authorization: "Bearer " + token },
      })).status, 403, "no secrets in URL");
      assert.equal((await fetch(api, { headers: {
        Authorization: "Bearer " + token, Origin: "https://evil.example",
      } })).status, 403);
      const forgedHostStatus = await new Promise<number>((resolve, reject) => {
        const r = request(api, { headers: {
          Authorization: "Bearer " + token, Host: "evil.example",
        } }, response => { response.resume(); resolve(response.statusCode ?? 0); });
        r.once("error", reject); r.end();
      });
      assert.equal(forgedHostStatus, 403);
      const tasks = await fetch(api, { headers: { Authorization: "Bearer " + token } });
      assert.equal(tasks.status, 200);
      const payload = await tasks.json() as { tasks: Array<Record<string, unknown>> };
      assert.equal(payload.tasks.length, 1);
      assert.equal(payload.tasks[0]?.id, task.id);
      assert.equal(payload.tasks[0]?.status, "created");
      assert.equal(payload.tasks[0]?.goalPreview, "<script>alert('unsafe')</script>");
      assert.equal(payload.tasks[0]?.requestedBy, "gemini");
      assert.equal(payload.tasks[0]?.acceptanceCriteria, undefined);
      assert.equal(payload.tasks[0]?.permissions, undefined);
      assert.equal(payload.tasks[0]?.traceId, undefined);
      const detailApi = api + "/" + task.id;
      assert.equal((await fetch(detailApi)).status, 401);
      assert.equal((await fetch(detailApi, { headers: {
        Authorization: "Bearer incorrect",
      } })).status, 401);
      assert.equal((await fetch(detailApi + "?token=" + token, { headers: {
        Authorization: "Bearer " + token,
      } })).status, 403);
      const details = await fetch(detailApi, { headers: {
        Authorization: "Bearer " + token,
      } });
      assert.equal(details.status, 200);
      const detailPayload = await details.json() as Record<string, any>;
      assert.equal(detailPayload.task.id, task.id);
      assert.deepEqual(detailPayload.runs, []);
      assert.equal(detailPayload.task.goal, "<script>alert('unsafe')</script>");
      assert.equal(detailPayload.task.requestedBy, "gemini");
      assert.deepEqual(detailPayload.task.acceptanceCriteria, ["safe"]);
      assert.equal(detailPayload.task.workspaceId, "ws");
      assert.equal(detailPayload.task.traceId, undefined);
      assert.equal(detailPayload.task.permissions, undefined);
      assert.equal(details.headers.get("cache-control"), "no-store",
        "private user-authored requests must never be cached");
      assert.equal(detailPayload.review, null);
      assert.equal(detailPayload.promotion, null);
      assert.equal((await fetch(api + "/00000000-0000-4000-8000-000000000001", {
        headers: { Authorization: "Bearer " + token },
      })).status, 404);
      assert.equal((await fetch(api + "/not-a-uuid", {
        headers: { Authorization: "Bearer " + token },
      })).status, 404);
      assert.equal((await fetch(url + "/dashboard/api/status", {
        headers: { Authorization: "Bearer " + token },
      })).status, 200);
      const metricsResponse = await fetch(url + "/dashboard/api/metrics", {
        headers: { Authorization: "Bearer " + token },
      });
      assert.equal(metricsResponse.status, 200);
      assert.equal(metricsResponse.headers.get("cache-control"), "no-store");
      const metrics = await metricsResponse.json() as Record<string, any>;
      assert.ok(metrics.cpu.logicalCores > 0);
      assert.ok(metrics.ram.totalBytes > 0);
      assert.ok(metrics.process.rssBytes > 0);
      assert.equal(metrics.alerts.advisoryOnly, true);
      assert.equal(metrics.alerts.requiredSamples, 3);
      assert.ok(Array.isArray(metrics.alerts.warnings));
      assert.equal(metrics.alerts.warnings.length, 0,
        "the first sample cannot trigger resource alerts");
      assert.equal(metrics.token, undefined);
      assert.equal(metrics.goal, undefined);
      const providerResponse = await fetch(url + "/dashboard/api/handoff-providers", {
        headers: { Authorization: "Bearer " + token },
      });
      assert.equal(providerResponse.status, 200);
      const providers = await providerResponse.json() as { providers: Array<{
        id: string; name: string; url: string }> };
      assert.ok(providers.providers.some(item => item.id === "chatgpt"));
      assert.ok(providers.providers.some(item => item.id === "gemini"));
      assert.ok(providers.providers.every(item => item.url.startsWith("https://")));
      assert.equal(providerResponse.headers.get("cache-control"), "no-store");
      assert.equal((await fetch(url + "/dashboard/api/metrics?token=" + token, {
        headers: { Authorization: "Bearer " + token },
      })).status, 403);
      assert.equal((await fetch(url + "/dashboard/api/metrics", {
        method: "POST", headers: { Authorization: "Bearer " + token },
      })).status, 403);
      assert.equal((await fetch(url + "/dashboard/api/missing", {
        headers: { Authorization: "Bearer " + token },
      })).status, 404);
    } finally { await daemon.close(); }
  } finally { store.close(); rmSync(dir, { recursive: true, force: true }); }
});

test("dashboard restores a browser session after F5, logs out and only allows native one-use launch grants", async () => {
  const server = await startLaoHealthServer(cfg, {
    port: 0, devspaceReady: () => false,
    dashboard: { token, listTasks: () => [], devspaceReady: () => false },
  });
  try {
    const url = "http://127.0.0.1:" + server.port;
    const origin = { Origin: url };
    const operator = { Authorization: "Bearer " + token };
    const sessionUrl = url + "/dashboard/api/session";
    assert.equal((await fetch(sessionUrl, { method: "POST", headers: operator })).status, 403,
      "browser login must be same-origin");
    assert.equal((await fetch(sessionUrl, { method: "POST", headers: {
      ...origin, Authorization: "Bearer invalid",
    } })).status, 403);
    const loggedIn = await fetch(sessionUrl, { method: "POST", headers: { ...origin, ...operator } });
    assert.equal(loggedIn.status, 200);
    const session = await loggedIn.json() as { sessionToken: string; expiresAt: string };
    assert.equal(session.sessionToken.length, 43);
    assert.notEqual(session.sessionToken, token, "no operator credential in session storage");
    assert.ok(Date.parse(session.expiresAt) > Date.now());
    assert.equal((await fetch(url + "/dashboard/api/status", {
      headers: { Authorization: "Bearer " + session.sessionToken },
    })).status, 200, "session ticket survives HTML reloads");
    assert.equal((await fetch(sessionUrl, { method: "DELETE", headers: {
      ...origin, Authorization: "Bearer " + session.sessionToken,
    } })).status, 200);
    assert.equal((await fetch(url + "/dashboard/api/tasks", {
      headers: { Authorization: "Bearer " + session.sessionToken },
    })).status, 401, "logout invalidates server-side session");

    const arm = url + "/dashboard/api/session/arm";
    const claim = url + "/dashboard/api/session/claim";
    assert.equal((await fetch(arm, { method: "POST", headers: origin })).status, 403);
    assert.equal((await fetch(arm, { method: "POST", headers: { ...origin, ...operator } })).status, 403);
    assert.equal((await fetch(claim, { method: "POST", headers: {
      ...origin, "Sec-Fetch-Site": "same-origin",
    } })).status, 403, "no automatic session without an explicit tray launch");
    assert.equal((await fetch(arm, { method: "POST", headers: operator })).status, 200);
    assert.equal((await fetch(claim, { method: "POST", headers: {
      Origin: "http://untrusted.example", "Sec-Fetch-Site": "cross-site",
    } })).status, 403, "other origins cannot consume a tray grant");
    assert.equal((await fetch(claim, { method: "POST", headers: origin })).status, 403,
      "missing browser fetch-metadata cannot consume a grant");
    const launched = await fetch(claim, { method: "POST", headers: {
      ...origin, "Sec-Fetch-Site": "same-origin",
    } });
    assert.equal(launched.status, 200);
    const launchSession = await launched.json() as { sessionToken: string };
    assert.notEqual(launchSession.sessionToken, token);
    assert.equal((await fetch(claim, { method: "POST", headers: {
      ...origin, "Sec-Fetch-Site": "same-origin",
    } })).status, 403, "a launch grant must be single-use");
    assert.equal((await fetch(url + "/dashboard/api/metrics", {
      headers: { Authorization: "Bearer " + launchSession.sessionToken },
    })).status, 200);
    assert.equal((await fetch(arm, { method: "GET", headers: operator })).status, 403);
    assert.equal((await fetch(sessionUrl + "?token=" + token, {
      method: "POST", headers: { ...origin, ...operator },
    })).status, 403, "no query-string credentials");
  } finally { await server.close(); }
});

test("LAO restart requires authenticated same-origin confirmation, rejects active jobs and never controls other services", async () => {
  let restartCalls = 0;
  const jobs: Array<{ status: string }> = [];
  const server = await startLaoHealthServer(cfg, {
    port: 0, devspaceReady: () => false,
    dashboard: {
      token, listTasks: () => jobs as any, devspaceReady: () => false,
      restartLao: async () => { restartCalls++; },
    },
  });
  try {
    const url = "http://127.0.0.1:" + server.port;
    const path = url + "/dashboard/api/restart";
    const headers = {
      Authorization: "Bearer " + token, Origin: url,
      "Sec-Fetch-Site": "same-origin",
    };
    const status = await fetch(url + "/dashboard/api/status", {
      headers: { Authorization: "Bearer " + token },
    });
    const statusPayload = await status.json();
    assert.equal(statusPayload.restartAvailable, true);
    assert.equal(statusPayload.activeTasks, 0);
    jobs.push(...Array.from({ length: 200 }, () => ({ status: "created" })));
    jobs.push({ status: "running" });
    const completeCount = await fetch(url + "/dashboard/api/status", {
      headers: { Authorization: "Bearer " + token },
    });
    assert.equal((await completeCount.json()).activeTasks, 1,
      "recovery safety must count every task, including beyond the dashboard page");
    jobs.length = 0;
    assert.equal((await fetch(path, { method: "GET", headers })).status, 403);
    assert.equal((await fetch(path, { method: "POST" })).status, 403);
    assert.equal((await fetch(path, { method: "POST", headers: {
      ...headers, "Sec-Fetch-Site": "cross-site",
    } })).status, 403);
    assert.equal((await fetch(path, { method: "POST", headers: {
      ...headers, Origin: "http://evil.example",
    } })).status, 403);
    jobs.push({ status: "running" });
    assert.equal((await fetch(path, { method: "POST", headers })).status, 409);
    jobs.length = 0;
    assert.equal((await fetch(path, { method: "POST", headers })).status, 202);
    await new Promise(resolve => setTimeout(resolve, 250));
    assert.equal(restartCalls, 1);
    assert.equal((await fetch(path, {
      method: "POST", headers: { Authorization: "Bearer " + token },
    })).status, 202, "the authenticated local Windows tray can request LAO-only restart");
    await new Promise(resolve => setTimeout(resolve, 250));
    assert.equal(restartCalls, 2);
  } finally { await server.close(); }
});

test("task detail exposes requests and model response only on protected API, not raw evidence", async () => {
  const dir = mkdtempSync(join(tmpdir(), "lao-detail-"));
  const store = new LaoTaskStore(dir);
  try {
    const task = store.create({
      workspaceId: "ws", goal: "private user instruction: 123secret",
      model: "granite4.2-8b:gpu", acceptanceCriteria: ["private check"],
      permissions: { read: true, write: "none", shell: "none" },
      limits: { maxRevisions: 0, maxToolCalls: 1, maxWallSeconds: 10 },
      requireReview: true,
    });
    const { summarizeLaoTaskDetails } = await import("./dashboard.js");
    store.transition(task.id, "queued");
    store.transition(task.id, "preparing");
    store.transition(task.id, "running");
    const run = store.startRun(task.id);
    store.completeRun(run.id, { status: "completed",
      summary: "The user-requested task is complete. <img src=x onerror=alert(1)>", toolCalls: 0 });
    const snapshot = summarizeLaoTaskDetails(store, task.id);
    assert.ok(snapshot);
    const raw = JSON.stringify(snapshot);
    assert.match(raw, /123secret|private check|workspaceId/);
    assert.match(raw, /The user-requested task is complete/);
    assert.doesNotMatch(raw, /traceId|allowedWritePaths|sourceManifest|patchSha256/);
    assert.equal(snapshot?.runs[0]?.summary,
      "The user-requested task is complete. <img src=x onerror=alert(1)>");
    assert.match(raw, /granite4.2-8b/);
    assert.equal(summarizeLaoTaskDetails(store, "00000000-0000-4000-8000-000000000001"), null);
  } finally { store.close(); rmSync(dir, { recursive: true, force: true }); }
});

test("dashboard markup has a parseable offline script and does not expose tokens", async () => {
  const { dashboardHtml } = await import("./dashboard-ui.js");
  const { Script } = await import("node:vm");
  const html = dashboardHtml("nonce-test");
  const script = html.match(/<script nonce="nonce-test">([\s\S]*?)<\/script>/)?.[1];
  assert.ok(script);
  assert.doesNotThrow(() => new Script(script));
  assert.doesNotMatch(html, /https?:\/\/[^/]+/);
  assert.doesNotMatch(html, /innerHTML\s*=/);
  assert.match(html, /id="filter"/);
  assert.match(html, /id="detail-panel"/);
  assert.match(html, /renderTasks/);
  assert.match(html, /showDetails/);
  assert.match(html, /O que foi solicitado/);
  assert.match(html, /Critérios de aceitação/);
  assert.match(html, /Resposta do modelo/);
  assert.match(html, /renderTaskDetail/);
  assert.match(html, /handoffInstruction/);
  assert.match(html, /lao_resume/);
  assert.match(html, /Solicitado por/);
  assert.match(html, /Revisar \/ Continuar/);
  assert.match(html, /task\.goal\|\|UI\.notProvided/);
  assert.match(html, /file\.path/);
  assert.match(html, /file\.previousPath/);
  assert.match(html, /fileAdded/);
  assert.doesNotMatch(html, /String\(name\)/);
  assert.doesNotMatch(html, /innerHTML\s*=|JSON\.stringify\(data,null,2\)/);
  assert.match(html, /id="cpu"/);
  assert.match(html, /id="ram"/);
  assert.match(html, /id="gpu"/);
  assert.match(html, /id="gpu-name"/);
  assert.match(html, /id="vram"/);
  assert.match(html, /id="vram-percent"/);
  assert.match(html, /class="status-head"/);
  assert.match(html, /\/dashboard\/api\/metrics/);
  assert.match(html, /id="resource-alerts"/);
  assert.match(html, /Sem alertas de recursos confirmados/);
  assert.match(html, /recentTransitions/);
  assert.match(html, /Recursos normalizados/);
  for (const tab of ["status", "tarefas", "modelos", "logs", "configuracoes"]) {
    assert.match(html, new RegExp('data-section="' + tab + '"'));
    assert.match(html, new RegExp('id="section-' + tab + '"'));
  }
  assert.match(html, /Modelo configurado · carregamento não verificado/);
  assert.match(html, /O reinício do daemon LAO exige confirmação/);

  const english = dashboardHtml("nonce-test-en", "en-US");
  const englishScript = english.match(/<script nonce="nonce-test-en">([\s\S]*?)<\/script>/)?.[1];
  assert.ok(englishScript);
  assert.doesNotThrow(() => new Script(englishScript));
  assert.match(english, /<html lang="en">/);
  assert.match(english, /Status dashboard/);
  assert.match(english, /System resources/);
  assert.match(english, /Settings and diagnostics/);
  assert.match(english, /What was requested/);
  assert.match(english, /Model response/);
  assert.match(english, /No confirmed resource alerts/);
  assert.match(english, /Configured model · load state not verified/);
  assert.doesNotMatch(english, />Configurações</);
  assert.doesNotMatch(english, />Tarefas</);
});

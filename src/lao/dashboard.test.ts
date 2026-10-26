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
test("dashboard API is local-only, token protected, read-only and sanitizes task records", async () => {
  const dir = mkdtempSync(join(tmpdir(), "lao-dashboard-"));
  const store = new LaoTaskStore(dir);
  try {
    const task = store.create({
      workspaceId: "ws", goal: "<script>alert('unsafe')</script>",
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
      assert.match(html, /Central de operacoes/);
      assert.match(html, /textContent/);
      assert.doesNotMatch(html, /alert\('unsafe'\)/);
      assert.doesNotMatch(html, new RegExp(token));
      const api = url + "/dashboard/api/tasks";
      assert.equal((await fetch(api)).status, 401);
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
      assert.equal(payload.tasks[0]?.goal, undefined);
      assert.equal(payload.tasks[0]?.acceptanceCriteria, undefined);
      assert.equal(payload.tasks[0]?.permissions, undefined);
      assert.equal(payload.tasks[0]?.traceId, undefined);
      assert.equal((await fetch(url + "/dashboard/api/status", {
        headers: { Authorization: "Bearer " + token },
      })).status, 200);
      assert.equal((await fetch(url + "/dashboard/api/missing", {
        headers: { Authorization: "Bearer " + token },
      })).status, 404);
    } finally { await daemon.close(); }
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
});

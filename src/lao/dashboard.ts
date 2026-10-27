import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import type { IncomingMessage, ServerResponse } from "node:http";
import type { LaoTask } from "./contracts.js";
import type { LaoTaskStore } from "./task-store.js";
import type { LaoConfig } from "./config.js";
import { measureLaoReadiness } from "./health.js";
import { dashboardHtml } from "./dashboard-ui.js";
import { createLaoResourceMonitor } from "./resource-metrics.js";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

const readResourceMetrics = createLaoResourceMonitor();

export interface LaoDashboardOptions {
  token: string;
  listTasks: () => LaoTask[];
  taskDetails?: (id: string) => ReturnType<typeof summarizeLaoTaskDetails> | null;
  devspaceReady: () => boolean;
  sessions?: LaoDashboardSessions;
}

/** Short-lived, read-only browser tickets. The long-lived operator token is never stored in web storage. */
export interface LaoDashboardSessions {
  issue: () => { sessionToken: string; expiresAt: string };
  verify: (ticket: string) => boolean;
  revoke: (ticket: string) => void;
  armLocalLaunch: () => void;
  claimLocalLaunch: () => { sessionToken: string; expiresAt: string } | null;
}
export function createLaoDashboardSessions(): LaoDashboardSessions {
  const tickets = new Map<string, number>();
  const ttl = 8 * 60 * 60 * 1000;
  let launchGrantExpiresAt = 0;
  const digest = (value: string) => createHash("sha256").update(value).digest("hex");
  const prune = () => {
    const now = Date.now();
    for (const [key, expires] of tickets) if (expires <= now) tickets.delete(key);
  };
  return {
    issue() {
      prune();
      // A bounded table avoids memory exhaustion if the operator repeatedly signs in.
      if (tickets.size >= 128) tickets.delete(tickets.keys().next().value!);
      const sessionToken = randomBytes(32).toString("base64url");
      const expires = Date.now() + ttl;
      tickets.set(digest(sessionToken), expires);
      return { sessionToken, expiresAt: new Date(expires).toISOString() };
    },
    verify(ticket) {
      if (!/^[A-Za-z0-9_-]{43}$/.test(ticket)) return false;
      const key = digest(ticket);
      const expires = tickets.get(key);
      if (!expires) return false;
      if (expires <= Date.now()) { tickets.delete(key); return false; }
      return true;
    },
    revoke(ticket) { tickets.delete(digest(ticket)); },
    armLocalLaunch() {
      // Only the native tray with the operator credential can create this grant.
      // It is short-lived, single-use and never placed in a browser URL.
      launchGrantExpiresAt = Date.now() + 15_000;
    },
    claimLocalLaunch() {
      if (!launchGrantExpiresAt || Date.now() >= launchGrantExpiresAt) {
        launchGrantExpiresAt = 0;
        return null;
      }
      launchGrantExpiresAt = 0;
      return this.issue();
    },
  };
}

/** Never return goals, prompts, patch bodies, test logs, review notes or secrets. */
export function summarizeLaoTaskDetails(store: LaoTaskStore, id: string) {
  const task = store.get(id);
  if (!task) return null;
  const review = store.getReview(id);
  return {
    task: { id: task.id, status: task.status, model: task.model,
      revisionCount: task.revisionCount, updatedAt: task.updatedAt,
      createdAt: task.createdAt, writeMode: task.permissions.write },
    runs: store.getRuns(id).map(run => ({
      id: run.id, status: run.status, model: run.model,
      startedAt: run.startedAt, finishedAt: run.finishedAt,
      toolCalls: run.toolCalls, errorCode: run.errorCode,
    })),
    events: store.events(id).map(event => ({
      from: event.from, to: event.to, at: event.at,
    })),
    tests: store.getTestEvidence(id).map(test => ({
      runId: test.runId, testFiles: test.testFiles,
      passed: test.passed, executed: test.executed,
      failureCode: test.failureCode, exitCode: test.exitCode,
      integrityMaintained: test.integrityMaintained,
    })),
    changes: store.getWriteEvidence(id).map(item => ({
      runId: item.runId, files: item.applied.files,
      fingerprint: item.evidence.contentFingerprint,
      diffSummary: item.evidence.diffSummary,
    })),
    review: review ? { decision: review.decision,
      criteriaVerified: review.criteriaVerified, decidedAt: review.decidedAt } : null,
    promotion: store.getWritePromotion(id),
  };
}

export function validateLaoDashboardToken(token: string | undefined): string | undefined {
  if (token === undefined || token === "") return undefined;
  if (!/^[\x21-\x7e]{32,256}$/.test(token)) {
    throw new Error("LAO_DASHBOARD_TOKEN must have 32-256 printable ASCII characters");
  }
  return token;
}
function bearerToken(req: IncomingMessage): string | null {
  const header = req.headers.authorization;
  if (!header?.startsWith("Bearer ")) return null;
  const supplied = header.slice(7);
  if (!supplied.length || supplied.length > 256) return null;
  return supplied;
}
function operatorAuthorized(req: IncomingMessage, token: string): boolean {
  const supplied = bearerToken(req);
  if (!supplied) return false;
  const digest = (s: string) => createHash("sha256").update(s).digest();
  return timingSafeEqual(digest(supplied), digest(token));
}
function authorized(req: IncomingMessage, options: LaoDashboardOptions): boolean {
  return operatorAuthorized(req, options.token) ||
    (options.sessions?.verify(bearerToken(req) ?? "") ?? false);
}
function json(res: ServerResponse, status: number, data: object): void {
  res.writeHead(status, {
    "content-type": "application/json; charset=utf-8",
    "cache-control": "no-store", "x-content-type-options": "nosniff",
    "referrer-policy": "no-referrer", "x-frame-options": "DENY",
    "cross-origin-resource-policy": "same-origin",
  });
  res.end(JSON.stringify(data));
}
export async function handleLaoDashboard(
  req: IncomingMessage, res: ServerResponse, config: LaoConfig,
  options?: LaoDashboardOptions,
): Promise<boolean> {
  const path = req.url?.split("?")[0];
  if (!path?.startsWith("/dashboard")) return false;
  if (!options) { json(res, 404, { error: "not_found" }); return true; }
  if (!/^(127\.0\.0\.1|localhost):\d{1,5}$/.test(req.headers.host ?? "") ||
      req.url !== path) {
    json(res, 403, { error: "forbidden" }); return true;
  }
  if (path === "/dashboard/api/session") {
    // Only this authenticated same-origin POST can create a browser session.
    // Avoid cookies and keep the operator secret out of browser storage.
    if (req.method === "POST" &&
        req.headers.origin === "http://" + req.headers.host &&
        operatorAuthorized(req, options.token) && options.sessions) {
      json(res, 200, options.sessions.issue());
    } else if (req.method === "DELETE" &&
        req.headers.origin === "http://" + req.headers.host &&
        options.sessions?.verify(bearerToken(req) ?? "")) {
      options.sessions.revoke(bearerToken(req)!);
      json(res, 200, { revoked: true });
    } else {
      json(res, 403, { error: "forbidden" });
    }
    return true;
  }
  if (path === "/dashboard/api/session/arm") {
    if (req.method === "POST" && !req.headers.origin &&
        operatorAuthorized(req, options.token) && options.sessions) {
      options.sessions.armLocalLaunch();
      json(res, 200, { armed: true });
    } else {
      json(res, 403, { error: "forbidden" });
    }
    return true;
  }
  if (path === "/dashboard/api/session/claim") {
    const sameOrigin = req.headers.origin === "http://" + req.headers.host &&
      req.headers["sec-fetch-site"] === "same-origin";
    if (req.method !== "POST" || !sameOrigin || !options.sessions) {
      json(res, 403, { error: "forbidden" });
    } else {
      const session = options.sessions.claimLocalLaunch();
      json(res, session ? 200 : 403, session ?? { error: "not_armed" });
    }
    return true;
  }
  if (req.method !== "GET" || req.headers.origin) {
    json(res, 403, { error: "forbidden" }); return true;
  }
  if (path === "/dashboard") {
    const nonce = randomBytes(16).toString("base64");
    res.writeHead(200, {
      "content-type": "text/html; charset=utf-8",
      "cache-control": "no-store", "x-content-type-options": "nosniff",
      "referrer-policy": "no-referrer", "x-frame-options": "DENY",
      "content-security-policy": "default-src 'none'; img-src 'self'; script-src 'nonce-" + nonce +
        "'; style-src 'nonce-" + nonce +
        "'; connect-src 'self'; base-uri 'none'; frame-ancestors 'none'; form-action 'self'",
    });
    res.end(dashboardHtml(nonce));
    return true;
  }
  if (path === "/dashboard/assets/logo.png") {
    if (req.method !== "GET" || req.url !== path) {
      json(res, 403, { error: "forbidden" }); return true;
    }
    const logo = await readFile(fileURLToPath(new URL(
      "../../docs/lao-devspace/assets/icons/png/lao-logo-64.png", import.meta.url,
    )));
    res.writeHead(200, {
      "content-type": "image/png", "content-length": logo.length,
      "cache-control": "private, max-age=3600",
      "x-content-type-options": "nosniff", "cross-origin-resource-policy": "same-origin",
    });
    res.end(logo);
    return true;
  }
  const detailMatch = /^\/dashboard\/api\/tasks\/([a-f0-9-]{36})$/.exec(path);
  if (path !== "/dashboard/api/status" && path !== "/dashboard/api/tasks" &&
      path !== "/dashboard/api/metrics" && !detailMatch) {
    json(res, 404, { error: "not_found" }); return true;
  }
  if (!authorized(req, options)) {
    json(res, 401, { error: "unauthorized" }); return true;
  }
  if (path === "/dashboard/api/metrics") {
    json(res, 200, await readResourceMetrics()); return true;
  }
  if (detailMatch) {
    const id = detailMatch[1];
    if (!id || !/^[a-f0-9]{8}-[a-f0-9]{4}-[1-8][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i.test(id)) {
      json(res, 404, { error: "not_found" }); return true;
    }
    const detail = options.taskDetails?.(id);
    json(res, detail ? 200 : 404, detail ?? { error: "not_found" }); return true;
  }
  if (path === "/dashboard/api/tasks") {
    const tasks = options.listTasks().slice(0, 200).map(task => ({
      id: task.id, status: task.status, model: task.model,
      revisionCount: task.revisionCount, updatedAt: task.updatedAt,
    }));
    json(res, 200, { tasks }); return true;
  }
  const status = await measureLaoReadiness(config, {
    devspaceReady: options.devspaceReady(),
  });
  json(res, 200, { ...status, modelConfigured: config.defaultModel });
  return true;
}

import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import type { IncomingMessage, ServerResponse } from "node:http";
import type { LaoTask } from "./contracts.js";
import type { LaoTaskStore } from "./task-store.js";
import type { LaoConfig } from "./config.js";
import { measureLaoReadiness } from "./health.js";
import { dashboardHtml } from "./dashboard-ui.js";

export interface LaoDashboardOptions {
  token: string;
  listTasks: () => LaoTask[];
  taskDetails?: (id: string) => ReturnType<typeof summarizeLaoTaskDetails> | null;
  devspaceReady: () => boolean;
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
  };
}

export function validateLaoDashboardToken(token: string | undefined): string | undefined {
  if (token === undefined || token === "") return undefined;
  if (!/^[\x21-\x7e]{32,256}$/.test(token)) {
    throw new Error("LAO_DASHBOARD_TOKEN must have 32-256 printable ASCII characters");
  }
  return token;
}
function authorized(req: IncomingMessage, token: string): boolean {
  const header = req.headers.authorization;
  if (!header?.startsWith("Bearer ")) return false;
  const supplied = header.slice(7);
  if (!supplied.length || supplied.length > 256) return false;
  const digest = (s: string) => createHash("sha256").update(s).digest();
  return timingSafeEqual(digest(supplied), digest(token));
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
      req.headers.origin || req.method !== "GET" || req.url !== path) {
    json(res, 403, { error: "forbidden" }); return true;
  }
  if (path === "/dashboard") {
    const nonce = randomBytes(16).toString("base64");
    res.writeHead(200, {
      "content-type": "text/html; charset=utf-8",
      "cache-control": "no-store", "x-content-type-options": "nosniff",
      "referrer-policy": "no-referrer", "x-frame-options": "DENY",
      "content-security-policy": "default-src 'none'; script-src 'nonce-" + nonce +
        "'; style-src 'nonce-" + nonce +
        "'; connect-src 'self'; base-uri 'none'; frame-ancestors 'none'; form-action 'self'",
    });
    res.end(dashboardHtml(nonce));
    return true;
  }
  const detailMatch = /^\/dashboard\/api\/tasks\/([a-f0-9-]{36})$/.exec(path);
  if (path !== "/dashboard/api/status" && path !== "/dashboard/api/tasks" && !detailMatch) {
    json(res, 404, { error: "not_found" }); return true;
  }
  if (!authorized(req, options.token)) {
    json(res, 401, { error: "unauthorized" }); return true;
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
  json(res, 200, status);
  return true;
}

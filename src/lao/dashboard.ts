import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import type { IncomingMessage, ServerResponse } from "node:http";
import type { LaoTask } from "./contracts.js";
import type { LaoConfig } from "./config.js";
import { measureLaoReadiness } from "./health.js";
import { dashboardHtml } from "./dashboard-ui.js";

export interface LaoDashboardOptions {
  token: string;
  listTasks: () => LaoTask[];
  devspaceReady: () => boolean;
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
  if (path !== "/dashboard/api/status" && path !== "/dashboard/api/tasks") {
    json(res, 404, { error: "not_found" }); return true;
  }
  if (!authorized(req, options.token)) {
    json(res, 401, { error: "unauthorized" }); return true;
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

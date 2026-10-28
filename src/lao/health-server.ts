import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import type { LaoConfig } from "./config.js";
import { measureLaoReadiness } from "./health.js";
import { createLaoDashboardSessions, handleLaoDashboard, type LaoDashboardOptions } from "./dashboard.js";
import type { LaoDevspaceStatus } from "./devspace-probe.js";
import { LAOgetVersion } from "./version.js";

/** Explicitly started, loopback-only health listener. Not installed as a service. */
export async function startLaoHealthServer(
  config: LaoConfig,
  options: { port: number; devspaceReady?: () => boolean; devspaceStatus?: () => Promise<LaoDevspaceStatus>; dashboard?: LaoDashboardOptions },
): Promise<{ port: number; close: () => Promise<void>; server: Server }> {
  if (!config.enabled) throw new Error("LAO disabled: no health server may start");
  if (!Number.isSafeInteger(options.port) || options.port < 0 || options.port > 65535) {
    throw new RangeError("Invalid health port");
  }
  const dashboard = options.dashboard ? {
    ...options.dashboard, sessions: createLaoDashboardSessions(),
  } : undefined;
  const server = createServer(async (req, res) => {
    try {
      if (await handleLaoDashboard(req, res, config, dashboard)) return;
    } catch {
      res.writeHead(503, { "content-type": "application/json", "cache-control": "no-store" });
      res.end(JSON.stringify({ error: "dashboard_unavailable" }));
      return;
    }
    if (req.method !== "GET" || (req.url !== "/health/live" && req.url !== "/health/ready" &&
        req.url !== "/health/version")) {
      res.writeHead(404, { "content-type": "application/json", "cache-control": "no-store" });
      res.end(JSON.stringify({ error: "not_found" }));
      return;
    }
    const result = req.url === "/health/live"
      ? { live: true }
      : req.url === "/health/version"
        ? LAOgetVersion()
        : await measureLaoReadiness(config, { devspaceStatus: options.devspaceStatus
          ? await options.devspaceStatus()
          : options.devspaceReady?.() ? "connected" : "unverified" });
    res.writeHead(req.url === "/health/ready" && !("ready" in result && result.ready) ? 503 : 200, {
      "content-type": "application/json", "cache-control": "no-store",
    });
    res.end(JSON.stringify(result));
  });
  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(options.port, "127.0.0.1", () => {
      server.removeListener("error", reject);
      resolve();
    });
  });
  const address = server.address() as AddressInfo;
  return { port: address.port, server, close: () => new Promise<void>((resolve, reject) => {
    server.close((err) => err ? reject(err) : resolve());
  }) };
}

import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import type { LaoConfig } from "./config.js";
import { measureLaoReadiness } from "./health.js";

/** Explicitly started, loopback-only health listener. Not installed as a service. */
export async function startLaoHealthServer(
  config: LaoConfig,
  options: { port: number; devspaceReady: () => boolean },
): Promise<{ port: number; close: () => Promise<void>; server: Server }> {
  if (!config.enabled) throw new Error("LAO disabled: no health server may start");
  if (!Number.isSafeInteger(options.port) || options.port < 0 || options.port > 65535) {
    throw new RangeError("Invalid health port");
  }
  const server = createServer(async (req, res) => {
    if (req.method !== "GET" || (req.url !== "/health/live" && req.url !== "/health/ready")) {
      res.writeHead(404, { "content-type": "application/json", "cache-control": "no-store" });
      res.end(JSON.stringify({ error: "not_found" }));
      return;
    }
    const result = req.url === "/health/live"
      ? { live: true }
      : await measureLaoReadiness(config, { devspaceReady: options.devspaceReady() });
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

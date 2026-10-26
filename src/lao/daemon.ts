import { homedir } from "node:os";
import { join } from "node:path";
import { LaoTaskStore } from "./task-store.js";
import type { LaoConfig } from "./config.js";
import { startLaoHealthServer } from "./health-server.js";

export interface LaoDaemonOptions {
  config: LaoConfig;
  stateDir: string;
  port: number;
  devspaceReady?: () => boolean;
}

/**
 * Experimental foreground daemon. Local-only, opt-in; not yet an SCM service.
 * Recovered jobs are marked interrupted, never replayed automatically.
 */
export async function startLaoDaemon(options: LaoDaemonOptions) {
  if (!options.config.enabled) throw new Error("LAO daemon is disabled");
  // Bind first: a second instance using the same port must not mutate tasks.
  const server = await startLaoHealthServer(options.config, {
    port: options.port, devspaceReady: options.devspaceReady ?? (() => false),
  });
  let store: LaoTaskStore;
  let recovered: number;
  try {
    store = new LaoTaskStore(options.stateDir);
    try { recovered = store.recoverInterrupted(); }
    catch (error) { store.close(); throw error; }
  } catch (error) {
    await server.close();
    throw error;
  }
  let closed = false;
  return {
    port: server.port,
    recoveredTasks: recovered,
    close: async () => {
      if (closed) return;
      closed = true;
      try { await server.close(); }
      finally { store.close(); }
    },
  };
}

export function laoDaemonEnvironment(env: NodeJS.ProcessEnv = process.env) {
  const portRaw = env.DEVSPACE_LAO_PORT ?? "7877";
  if (!/^\d{1,5}$/.test(portRaw)) throw new Error("Invalid LAO port");
  const port = Number(portRaw);
  if (!Number.isSafeInteger(port) || port < 1024 || port > 65535) {
    throw new Error("LAO daemon port must be 1024..65535");
  }
  // Unlike the legacy DevSpace state directory, this is a separate,
  // user-local directory. It may be explicitly overridden by the operator.
  return {
    port,
    stateDir: env.DEVSPACE_LAO_STATE_DIR ?? join(homedir(), ".devspace", "lao-data"),
  };
}

import { homedir } from "node:os";
import { join } from "node:path";
import { LaoTaskStore } from "./task-store.js";
import type { LaoConfig } from "./config.js";
import { startLaoHealthServer } from "./health-server.js";
import { summarizeLaoTaskDetails, validateLaoDashboardToken } from "./dashboard.js";
import { createLaoModelSelection } from "./model-selection.js";
import type { LaoDevspaceStatus } from "./devspace-probe.js";

export interface LaoDaemonOptions {
  config: LaoConfig;
  stateDir: string;
  port: number;
  devspaceReady?: () => boolean;
  devspaceStatus?: () => Promise<LaoDevspaceStatus>;
  dashboardToken?: string;
  restartLao?: () => Promise<void>;
}

/**
 * Experimental foreground daemon. Local-only, opt-in; not yet an SCM service.
 * Recovered jobs are marked interrupted, never replayed automatically.
 */
export async function startLaoDaemon(options: LaoDaemonOptions) {
  if (!options.config.enabled) throw new Error("LAO daemon is disabled");
  const token = validateLaoDashboardToken(options.dashboardToken);
  const ready = options.devspaceReady ?? (() => false);
  const devspaceStatus = options.devspaceStatus ?? (async () => ready() ? "connected" as const : "unverified" as const);
  const models = createLaoModelSelection(options.config, options.stateDir);
  // The selected model belongs to the LAO state, not the pinned DevSpace config.
  // The state directory is created by the task store below; restore afterwards.
  let store: LaoTaskStore;
  // Bind first: a second instance using the same port must not mutate tasks.
  const server = await startLaoHealthServer(options.config, {
    port: options.port, devspaceStatus,
    dashboard: token ? {
      token, devspaceStatus, listTasks: () => store?.list() ?? [],
      taskDetails: id => store ? summarizeLaoTaskDetails(store, id) : null,
      restartLao: options.restartLao,
      listModels: models.listModels,
      selectModel: models.selectModel,
    } : undefined,
  });
  let recovered: number;
  let leaseToken = "";
  try {
    store = new LaoTaskStore(options.stateDir);
    try {
      leaseToken = store.acquireDaemonLease();
      await models.restore();
      recovered = store.recoverInterrupted();
    } catch (error) {
      if (leaseToken) store.releaseDaemonLease(leaseToken);
      store.close();
      throw error;
    }
  } catch (error) {
    await server.close();
    throw error;
  }
  let closed = false;
  const close = async () => {
    if (closed) return;
    closed = true;
    clearInterval(heartbeat);
    try { await server.close(); }
    finally {
      try { store.releaseDaemonLease(leaseToken); }
      finally { store.close(); }
    }
  };
  // A stolen or expired lease must stop the old listener, not appear healthy.
  const heartbeat = setInterval(() => {
    if (closed) return;
    try {
      if (!store.renewDaemonLease(leaseToken)) void close().catch(() => undefined);
    } catch {
      void close().catch(() => undefined);
    }
  }, 15_000);
  heartbeat.unref();
  return { port: server.port, recoveredTasks: recovered, close };
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

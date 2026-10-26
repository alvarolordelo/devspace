import { loadLaoConfig } from "./config.js";
import { laoDaemonEnvironment, startLaoDaemon } from "./daemon.js";

/** Foreground-only experimental entrypoint; Windows service integration follows. */
export async function runLaoDaemon(): Promise<void> {
  const config = loadLaoConfig();
  const { stateDir, port } = laoDaemonEnvironment();
  const daemon = await startLaoDaemon({
    config, stateDir, port, dashboardToken: process.env.LAO_DASHBOARD_TOKEN,
  });
  console.log(JSON.stringify({
    component: "lao-daemon", port: daemon.port,
    host: "127.0.0.1", recoveredTasks: daemon.recoveredTasks,
    serviceInstalled: false,
  }));
  let closing: Promise<void> | undefined;
  const shutdown = () => {
    closing ??= daemon.close().catch((error) => {
      console.error("LAO daemon shutdown failed", error instanceof Error ? error.message : String(error));
      process.exitCode = 1;
    });
    return closing;
  };
  process.once("SIGINT", () => { void shutdown(); });
  process.once("SIGTERM", () => { void shutdown(); });
}

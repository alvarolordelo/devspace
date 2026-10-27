import { loadLaoConfig } from "./config.js";
import { laoDaemonEnvironment, startLaoDaemon } from "./daemon.js";
import { spawn } from "node:child_process";

/** Foreground-only experimental entrypoint; Windows service integration follows. */
export async function runLaoDaemon(): Promise<void> {
  const config = loadLaoConfig();
  const { stateDir, port } = laoDaemonEnvironment();
  let daemon: Awaited<ReturnType<typeof startLaoDaemon>>;
  let closing: Promise<void> | undefined;
  let restarting = false;
  const shutdown = () => {
    closing ??= daemon.close().catch((error) => {
      console.error("LAO daemon shutdown failed", error instanceof Error ? error.message : String(error));
      process.exitCode = 1;
      throw error;
    });
    return closing;
  };
  const restartLao = async () => {
    if (restarting) return;
    restarting = true;
    // Gracefully release the LAO SQLite lease before replacing this process.
    await shutdown();
    if (process.env.LAO_RESTART_SUPERVISED === "1") {
      // The local PowerShell foreground supervisor owns the restart. Returning
      // a dedicated exit status prevents a detached child being killed with
      // the original process/job on Windows.
      process.exitCode = 75;
      return;
    }
    const entry = process.argv[1];
    if (!entry) throw new Error("LAO restart entrypoint not available");
    const child = spawn(process.execPath, [entry, ...process.argv.slice(2)], {
      cwd: process.cwd(), env: process.env, detached: true, windowsHide: true, stdio: "ignore",
    });
    child.once("error", () => { process.exitCode = 1; });
    child.unref();
  };
  daemon = await startLaoDaemon({
    config, stateDir, port, dashboardToken: process.env.LAO_DASHBOARD_TOKEN,
    restartLao,
  });
  console.log(JSON.stringify({
    component: "lao-daemon", port: daemon.port,
    host: "127.0.0.1", recoveredTasks: daemon.recoveredTasks,
    serviceInstalled: false,
  }));
  process.once("SIGINT", () => { void shutdown().catch(() => undefined); });
  process.once("SIGTERM", () => { void shutdown().catch(() => undefined); });
}

import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { loadLaoConfig } from "./config.js";
import { laoDaemonEnvironment, startLaoDaemon } from "./daemon.js";
import { LaoTaskStore } from "./task-store.js";

const config = loadLaoConfig({
  DEVSPACE_LAO_ENABLED: "true",
  DEVSPACE_LAO_OLLAMA_URL: "http://127.0.0.1:1",
});
const taskInput = {
  workspaceId: "ws", goal: "Explain", model: "granite4.2-8b:gpu",
  acceptanceCriteria: ["Answer"],
  permissions: { read: true as const, write: "none" as const, shell: "none" as const },
  limits: { maxRevisions: 0, maxToolCalls: 1, maxWallSeconds: 5 },
  requireReview: true as const,
};

test("daemon is opt-in, local-only and recovers running jobs without resuming", async () => {
  const dir = mkdtempSync(join(tmpdir(), "lao-daemon-"));
  const store = new LaoTaskStore(dir);
  const task = store.create(taskInput);
  store.transition(task.id, "queued");
  store.transition(task.id, "preparing");
  store.transition(task.id, "running");
  store.startRun(task.id);
  store.close();
  try {
    await assert.rejects(startLaoDaemon({
      config: loadLaoConfig({}), stateDir: dir, port: 0,
    }), /disabled/);
    const daemon = await startLaoDaemon({ config, stateDir: dir, port: 0 });
    try {
      assert.equal(daemon.recoveredTasks, 1);
      const live = await fetch(`http://127.0.0.1:${daemon.port}/health/live`);
      assert.equal(live.status, 200);
      const ready = await fetch(`http://127.0.0.1:${daemon.port}/health/ready`);
      assert.equal(ready.status, 503); // Not green without authenticated DevSpace.
      assert.equal((await ready.json()).ready, false);
      assert.equal((await fetch(`http://127.0.0.1:${daemon.port}/tasks`)).status, 404);
    } finally { await daemon.close(); await daemon.close(); }
    const again = new LaoTaskStore(dir);
    try {
      assert.equal(again.get(task.id)?.status, "interrupted");
      assert.equal(again.getRuns(task.id)[0]?.status, "interrupted");
    } finally { again.close(); }
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test("daemon refuses a second listener on an occupied port without changing the existing one", async () => {
  const firstDir = mkdtempSync(join(tmpdir(), "lao-daemon-first-"));
  const secondDir = mkdtempSync(join(tmpdir(), "lao-daemon-second-"));
  const first = await startLaoDaemon({ config, stateDir: firstDir, port: 0 });
  try {
    await assert.rejects(startLaoDaemon({ config, stateDir: secondDir, port: first.port }));
    const r = await fetch(`http://127.0.0.1:${first.port}/health/live`);
    assert.equal(r.status, 200);
  } finally {
    await first.close();
    rmSync(firstDir, { recursive: true, force: true });
    rmSync(secondDir, { recursive: true, force: true });
  }
});

test("foreground daemon port is explicit and validated", () => {
  assert.equal(laoDaemonEnvironment({}).port, 7877);
  assert.equal(laoDaemonEnvironment({ DEVSPACE_LAO_PORT: "8675" }).port, 8675);
  for (const value of ["0", "80", "65536", "-1", "12abc", ""]) {
    assert.throws(() => laoDaemonEnvironment({ DEVSPACE_LAO_PORT: value }));
  }
});

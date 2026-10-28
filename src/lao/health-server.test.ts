import assert from "node:assert/strict";
import test from "node:test";
import { loadLaoConfig } from "./config.js";
import { startLaoHealthServer } from "./health-server.js";

test("health server is opt-in only, and never binds a public interface", async () => {
  await assert.rejects(startLaoHealthServer(loadLaoConfig({}), { port: 0, devspaceReady: () => false }), /disabled/);
  const config = loadLaoConfig({ DEVSPACE_LAO_ENABLED: "true", DEVSPACE_LAO_OLLAMA_URL: "http://127.0.0.1:1" });
  const server = await startLaoHealthServer(config, { port: 0, devspaceReady: () => false });
  try {
    assert.equal((server.server.address() as { address: string }).address, "127.0.0.1");
    const live = await fetch(`http://127.0.0.1:${server.port}/health/live`);
    assert.equal(live.status, 200);
    assert.deepEqual(await live.json(), { live: true });
    const version = await fetch(`http://127.0.0.1:${server.port}/health/version`);
    assert.equal(version.status, 200);
    const versionPayload = await version.json() as {
      runningVersion: string; installedVersion: string; updateAvailable: boolean;
    };
    assert.match(versionPayload.runningVersion, /^\d+\.\d+\.\d+/);
    assert.match(versionPayload.installedVersion, /^\d+\.\d+\.\d+/);
    assert.equal(typeof versionPayload.updateAvailable, "boolean");
    const ready = await fetch(`http://127.0.0.1:${server.port}/health/ready`);
    assert.equal(ready.status, 503);
    assert.equal((await ready.json()).ready, false);
    assert.equal((await fetch(`http://127.0.0.1:${server.port}/tasks`)).status, 404);
  } finally { await server.close(); }
});

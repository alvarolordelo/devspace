import assert from "node:assert/strict";
import test from "node:test";
import { loadLaoConfig } from "./config.js";
import { measureLaoReadiness } from "./health.js";
import { LaoOllamaClient } from "./ollama-client.js";

const enabled = loadLaoConfig({ DEVSPACE_LAO_ENABLED: "true" });
function client(capabilities: string[]) {
  const transport = (async (input: RequestInfo | URL) =>
    new Response(JSON.stringify(String(input).endsWith("/api/tags")
      ? { models: [{ name: "granite4.2-8b:gpu" }] }
      : { capabilities }), { status: 200 })) as typeof fetch;
  return new LaoOllamaClient(enabled, transport);
}
test("disabled status is not ready and makes no dependency calls", async () => {
  const health = await measureLaoReadiness(loadLaoConfig({}), { devspaceReady: true });
  assert.equal(health.live, true);
  assert.equal(health.ready, false);
  assert.deepEqual(health.blockingReasons, ["lao_disabled"]);
});
test("unverified DevSpace prevents green status despite Ollama healthy", async () => {
  const health = await measureLaoReadiness(enabled, { client: client(["tools"]), devspaceReady: false });
  assert.equal(health.ready, false);
  assert.deepEqual(health.blockingReasons, ["devspace_unverified"]);
});
test("tool-capable model and verified DevSpace allow ready status", async () => {
  const health = await measureLaoReadiness(enabled, { client: client(["tools"]), devspaceReady: true });
  assert.equal(health.ready, true);
});
test("confirmed MCP listener outage is distinct from missing authentication", async () => {
  const health = await measureLaoReadiness(enabled, {
    client: client(["tools"]), devspaceStatus: "offline",
  });
  assert.deepEqual(health.blockingReasons, ["devspace_unavailable"]);
});
test("model missing tools blocks readiness", async () => {
  const health = await measureLaoReadiness(enabled, { client: client(["completion"]), devspaceReady: true });
  assert.deepEqual(health.blockingReasons, ["model_tools_unsupported"]);
});

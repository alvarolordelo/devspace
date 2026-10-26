#!/usr/bin/env node
/**
 * Optional live read-only LAO/Ollama smoke test. Never part of offline CI.
 * Run from the feature checkout after "pnpm build":
 *   set DEVSPACE_LAO_ENABLED=true&& node scripts/lao-live-smoke.mjs
 * The task has no model tools, no shell, no writes, and no approval.
 */
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { loadLaoConfig } from "../dist/lao/config.js";
import { LaoOllamaClient } from "../dist/lao/ollama-client.js";
import { LaoTaskStore } from "../dist/lao/task-store.js";
import { LaoReadOnlyRunner } from "../dist/lao/task-runner.js";

const config = loadLaoConfig();
if (!config.enabled) {
  throw new Error("Set DEVSPACE_LAO_ENABLED=true explicitly for this live smoke test");
}
const model = process.argv[2] ?? config.defaultModel;
const sourcePath = "docs/lao-devspace/ROADMAP.md";
const sourceText = readFileSync(new URL("../docs/lao-devspace/ROADMAP.md", import.meta.url), "utf8").slice(0, 900);
const sourceHash = createHash("sha256").update(sourceText).digest("hex");
const client = new LaoOllamaClient(config);
const stateDir = mkdtempSync(join(tmpdir(), "lao-live-smoke-"));
let store;
const started = Date.now();
try {
  const available = await client.listModels({ timeoutMs: 8_000 });
  assert.ok(available.some(item => item.name === model), "Requested model not installed locally");
  const capabilities = await client.inspectModel(model, { timeoutMs: 8_000 });
  assert.equal(capabilities.supportsTools, true, "Requested model lacks tools capability");

  store = new LaoTaskStore(stateDir);
  const runner = new LaoReadOnlyRunner(store, client);
  const task = runner.createTask({
    workspaceId: "live-smoke-without-mcp",
    model,
    goal: "Explain in a single sentence the purpose of the LAO, using only the supplied excerpt.",
    acceptanceCriteria: ["One concise sentence", "No claims of executing code or tests"],
    permissions: { read: true, write: "none", shell: "none", allowedWritePaths: [] },
    limits: { maxRevisions: 2, maxToolCalls: 1, maxWallSeconds: 120 },
    requireReview: true,
  });
  const completed = await runner.runTask(task.id, undefined, [{ path: sourcePath, content: sourceText }]);
  assert.equal(completed.task.status, "awaiting_review");
  assert.equal(completed.run.status, "completed");
  store.close();
  store = undefined;

  // Verify actual disk persistence, not merely an in-memory test stub.
  store = new LaoTaskStore(stateDir);
  const persisted = store.getRuns(task.id);
  assert.equal(persisted.length, 1);
  assert.equal(persisted[0].status, "completed");
  assert.equal(persisted[0].sourceManifest[0]?.sha256, sourceHash);
  assert.equal(store.get(task.id)?.status, "awaiting_review");
  const events = store.events(task.id).map(event => event.to);
  assert.deepEqual(events, ["created", "queued", "preparing", "running", "validating", "awaiting_review"]);
  console.log(JSON.stringify({
    mode: "live-ollama-read-only",
    model,
    taskId: task.id,
    taskStatus: store.get(task.id).status,
    runStatus: persisted[0].status,
    persistedAfterReopen: true,
    sourceSha256: sourceHash,
    stateEvents: events,
    elapsedMs: Date.now() - started,
    response: persisted[0].summary,
    acceptanceCriteriaVerified: false,
    mcpTransportVerified: false,
  }, null, 2));
} finally {
  store?.close();
  rmSync(stateDir, { recursive: true, force: true });
}

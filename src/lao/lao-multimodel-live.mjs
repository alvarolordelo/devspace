#!/usr/bin/env node
/**
 * Explicit local multimodel/failover proof. Requires a prior `pnpm build`.
 * It never pulls models, changes Ollama configuration, writes a repository,
 * runs shell from a model, or promotes code. SQLite lives in a temp folder.
 */
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { loadLaoConfig } from "../../dist/lao/config.js";
import { LaoOllamaClient } from "../../dist/lao/ollama-client.js";
import { LaoTaskStore } from "../../dist/lao/task-store.js";
import { LaoReadOnlyRunner } from "../../dist/lao/task-runner.js";

const models = process.argv.slice(2);
if (models.length !== 2 || new Set(models).size !== 2) {
  throw new Error("Usage: node src/lao/lao-multimodel-live.mjs primaryModel fallbackModel");
}
const [primary, fallback] = models;
const config = loadLaoConfig({
  ...process.env,
  DEVSPACE_LAO_ENABLED: "true",
  DEVSPACE_LAO_MODEL: primary,
  DEVSPACE_LAO_FALLBACK_MODEL: fallback,
});
const client = new LaoOllamaClient(config);
const installed = new Set((await client.listModels({ timeoutMs: 15_000 })).map(item => item.name));
for (const model of models) {
  if (!installed.has(model)) throw new Error("Locally unavailable: " + model);
  const info = await client.inspectModel(model, { timeoutMs: 15_000 });
  if (!info.supportsTools) throw new Error("Model lacks tools capability: " + model);
}

const direct = [];
for (const model of models) {
  const started = performance.now();
  const answer = (await client.chatReadOnly(
    "Return exactly the single digit result of 2 + 2. No explanation.",
    { model, timeoutMs: 90_000, maxOutputTokens: 16 },
  )).trim();
  direct.push({ model, answer, correct: answer === "4",
    wallMs: Math.round(performance.now() - started) });
}
if (direct.some(item => !item.correct)) throw new Error("A local model failed the deterministic smoke");

const state = await mkdtemp(join(tmpdir(), "lao-live-failover-"));
const store = new LaoTaskStore(state);
try {
  // A deliberately absent primary proves the actual runner switches to the
  // configured local fallback after Ollama's model-specific HTTP rejection.
  const missing = "lao-intentionally-missing-primary:latest";
  const runner = new LaoReadOnlyRunner(store, client, fallback);
  const task = runner.createTask({
    workspaceId: "live_multimodel_smoke",
    model: missing,
    goal: "Return the result of 2 + 2 without claiming tests or tools were used",
    acceptanceCriteria: ["Answer contains 4"],
    permissions: { read: true, write: "none", shell: "none", allowedWritePaths: [] },
    limits: { maxRevisions: 0, maxToolCalls: 1, maxWallSeconds: 120 },
    requireReview: true,
  });
  const result = await runner.runTask(task.id);
  const runs = store.getRuns(task.id);
  if (result.task.status !== "awaiting_review" || result.run.model !== fallback ||
      runs.at(-1)?.status !== "completed") {
    throw new Error("Live fallback did not finish on the configured fallback model");
  }
  console.log(JSON.stringify({
    mode: "live-local-multimodel-failover",
    timestamp: new Date().toISOString(),
    primary, fallback,
    direct,
    failover: {
      deliberatelyMissingPrimary: true,
      actualModel: result.run.model,
      finalStatus: result.task.status,
      persistedRuns: runs.map(run => ({ model: run.model, status: run.status, errorCode: run.errorCode })),
    },
    noModelPull: true,
    noRepositoryWrite: true,
    noShell: true,
  }, null, 2));
} finally {
  store.close();
  await rm(state, { recursive: true, force: true });
}

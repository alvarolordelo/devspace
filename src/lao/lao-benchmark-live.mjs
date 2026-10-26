#!/usr/bin/env node
/**
 * Optional 5x sequential Ollama model comparison. No pulls, tool calls,
 * file writes, agents or changes to model/provider configuration.
 */
import { loadLaoConfig } from "../../dist/lao/config.js";
import { LaoOllamaClient } from "../../dist/lao/ollama-client.js";

const cfg = loadLaoConfig({ ...process.env, DEVSPACE_LAO_ENABLED: "true" });
const models = process.argv.slice(2);
if (models.length !== 2 || new Set(models).size !== 2) {
  throw new Error("Usage: node src/lao/lao-benchmark-live.mjs modelA modelB");
}
const client = new LaoOllamaClient(cfg);
const installed = new Set((await client.listModels({ timeoutMs: 15000 })).map(x => x.name));
for (const model of models) {
  if (!installed.has(model)) throw new Error("Locally unavailable: " + model);
}
const results = [];
for (const model of models) {
  const { supportsTools } = await client.inspectModel(model, { timeoutMs: 15000 });
  const samples = [];
  for (let i = 0; i < 5; i++) {
    const started = performance.now();
    let outcome = "failed", error = null, durationMs = null, evalCount = null;
    try {
      const response = await fetch(cfg.ollamaUrl + "/api/chat", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          model, stream: false, think: false, keep_alive: 0,
          options: { temperature: 0, num_ctx: 2048, num_predict: 64 },
          messages: [{ role: "user", content: "Only answer the result as a digit: 2 + 2 = ?" }],
        }),
        signal: AbortSignal.timeout(90000),
      });
      if (!response.ok) throw new Error("ollama_http_" + response.status);
      const json = await response.json();
      outcome = String(json.message?.content ?? "").trim() === "4" ? "correct" : "mismatch";
      durationMs = Number(json.eval_duration ?? 0) / 1e6 || null;
      evalCount = json.eval_count ?? null;
    } catch (e) {
      error = e?.name === "TimeoutError" ? "timeout" : "model_request_failed";
    }
    samples.push({
      repetition: i + 1,
      wallMs: Math.round(performance.now() - started),
      generateMs: durationMs,
      outputTokens: evalCount,
      outcome, error,
    });
  }
  const timings = samples.filter(s => s.outcome === "correct").map(s => s.wallMs).sort((a,b)=>a-b);
  results.push({
    model, supportsTools, runs: 5, correct: timings.length,
    medianWallMs: timings.length ? timings[Math.floor(timings.length / 2)] : null,
    minWallMs: timings.length ? timings[0] : null,
    maxWallMs: timings.length ? timings.at(-1) : null,
    samples,
  });
}
console.log(JSON.stringify({
  mode: "live-local-ollama-benchmark", timestamp: new Date().toISOString(),
  noModelChange: true, noAutoFailover: true, sequentialRuns: true,
  evaluations: results,
}, null, 2));

#!/usr/bin/env node
/**
 * Opt-in live programming benchmark. Model output is only written to a
 * disposable fixture and executed inside offline read-only Docker.
 * No model-selected shell, no host execution, no approvals or failover.
 */
import { createHash, randomUUID } from "node:crypto";
import { mkdtempSync, mkdirSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { loadLaoConfig } from "../../dist/lao/config.js";
import { LaoOllamaClient } from "../../dist/lao/ollama-client.js";
import { extractLaoBenchmarkModule } from "../../dist/lao/coding-benchmark-contract.js";
import { invokeLaoDocker } from "../../dist/lao/write-test-sandbox.js";

const models = process.argv.slice(2);
const image = process.env.LAO_SANDBOX_NODE_IMAGE;
if (models.length !== 2 || models[0] === models[1] ||
    !models.every(x => /^[a-zA-Z0-9][a-zA-Z0-9._:/-]{0,109}$/.test(x)) ||
    !image || !/^[a-z0-9][a-z0-9._/:+-]*@sha256:[a-f0-9]{64}$/.test(image)) {
  throw new Error("Usage: LAO_SANDBOX_NODE_IMAGE=<local-image>@sha256:<digest> node src/lao/lao-coding-benchmark-live.mjs modelA modelB");
}
const config = loadLaoConfig({ ...process.env, DEVSPACE_LAO_ENABLED: "true" });
const client = new LaoOllamaClient(config);
const installed = new Set((await client.listModels({ timeoutMs: 15_000 })).map(x => x.name));
if (!models.every(x => installed.has(x))) throw new Error("Both model names must already be installed locally");
const tasks = [
  {
    id: "even-integers", exportName: "sumEvenIntegers",
    prompt: "Write a JavaScript ESM module exporting exactly function sumEvenIntegers(values). It sums only even integer numbers from the array. Ignore strings, booleans, null, NaN and decimal numbers. Negative even integers must count. Return 0 for an empty array. Output ONLY JavaScript code, no markdown and no explanations.",
    tests: [
      'import test from "node:test";',
      'import assert from "node:assert/strict";',
      'import { sumEvenIntegers } from "../src/task.mjs";',
      'test("basic",()=>assert.equal(sumEvenIntegers([1,2,4,3]),6));',
      'test("filter",()=>assert.equal(sumEvenIntegers([2.2,-2,4,"4",null,true,NaN]),2));',
      'test("empty",()=>assert.equal(sumEvenIntegers([]),0));',
    ],
  },
  {
    id: "slug", exportName: "toSlug",
    prompt: "Write a JavaScript ESM module exporting exactly function toSlug(text). It returns a lowercase URL slug: trim surrounding whitespace, strip accents using Unicode NFD normalization, replace every run of characters other than letters a-z or digits 0-9 with a single hyphen, trim leading/trailing hyphens. Return an empty string when no letters or digits remain. Output ONLY JavaScript code, no markdown and no explanations.",
    tests: [
      'import test from "node:test";',
      'import assert from "node:assert/strict";',
      'import { toSlug } from "../src/task.mjs";',
      'test("unicode",()=>assert.equal(toSlug("  Olá, Mundo!!  "),"ola-mundo"));',
      'test("punctuation",()=>assert.equal(toSlug("A---B _ C"),"a-b-c"));',
      'test("empty",()=>assert.equal(toSlug("***"),""));',
    ],
  },
];
const sha = value => createHash("sha256").update(value).digest("hex");
const outcomes = [];
const started = new Date().toISOString();
for (const model of models) {
  const results = [];
  for (const task of tasks) {
    const root = realpathSync(mkdtempSync(join(tmpdir(), "lao-coding-benchmark-")));
    mkdirSync(join(root, "src"));
    mkdirSync(join(root, "tests"));
    writeFileSync(join(root, "tests", "task.test.mjs"), task.tests.join("\n") + "\n");
    const startTime = performance.now();
    let modelResponded = false;
    let modelWallMs = null;
    let candidateSha256 = null;
    let tested = false;
    let passed = false;
    let testExitCode = null;
    let dockerFailure = null;
    let errorCode = null;
    const container = "lao-coding-benchmark-" + randomUUID();
    try {
      const response = await fetch(config.ollamaUrl + "/api/chat", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          model, stream: false, think: false, keep_alive: 0,
          options: { temperature: 0, num_ctx: 4096, num_predict: 800 },
          messages: [{ role: "user", content: task.prompt }],
        }),
        signal: AbortSignal.timeout(120_000),
      });
      if (!response.ok) throw new Error("ollama_response_failed");
      const raw = await response.text();
      if (raw.length > 128_000) throw new Error("ollama_response_oversized");
      modelWallMs = Math.round(performance.now() - startTime);
      modelResponded = true;
      const parsed = JSON.parse(raw);
      const candidate = extractLaoBenchmarkModule(parsed.message?.content, task.exportName);
      if (!candidate) { errorCode = "invalid_code_format"; }
      else {
        candidateSha256 = sha(candidate);
        writeFileSync(join(root, "src", "task.mjs"), candidate, { flag: "wx" });
        const containerArgs = [
          "run", "--rm", "--name", container, "--pull=never", "--network=none",
          "--read-only", "--cap-drop=ALL", "--security-opt=no-new-privileges",
          "--pids-limit=64", "--memory=512m", "--memory-swap=512m",
          "--cpus=1", "--user=65534:65534", "--workdir=/workspace",
          "--tmpfs=/tmp:rw,nosuid,nodev,size=32m", "--env=HOME=/tmp", "--env=NODE_ENV=test",
          "--mount", "type=bind,source=" + root + ",target=/workspace,readonly",
          "--entrypoint=node", image, "--test", "--test-reporter=tap",
          "/workspace/tests/task.test.mjs",
        ];
        const result = await invokeLaoDocker(containerArgs, 60_000);
        testExitCode = result.exitCode;
        dockerFailure = result.failureCode ?? null;
        tested = result.exitCode !== null && !dockerFailure;
        passed = tested && result.exitCode === 0;
        if (!passed) errorCode = tested ? "tests_failed" : "docker_unavailable";
      }
    } catch (error) {
      errorCode = error?.name === "TimeoutError" ? "model_timeout" : "model_or_io_failure";
    } finally {
      // A timed-out Docker CLI can leave its container alive despite --rm.
      // Delete ONLY the individually named, ephemeral benchmark container.
      await invokeLaoDocker(["rm", "--force", container], 5000).catch(() => undefined);
      rmSync(root, { recursive: true, force: true });
    }
    results.push({
      task: task.id, modelResponded, modelWallMs,
      totalWallMs: Math.round(performance.now() - startTime),
      candidateSha256, tested, passed, testExitCode, dockerFailure, errorCode,
    });
  }
  outcomes.push({ model, total: tasks.length, passed: results.filter(x => x.passed).length, results });
}
console.log(JSON.stringify({
  mode: "live-offline-docker-coding-benchmark", started, finished: new Date().toISOString(),
  image, tasks: tasks.map(x => x.id), noModelChange: true, noAutoFailover: true,
  noHostCodeExecution: true, sequential: true, outcomes,
}, null, 2));

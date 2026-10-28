#!/usr/bin/env node
/**
 * Explicit live proof of two supervisor-requested corrections with a real
 * local Ollama model. Uses only a disposable Git repository/worktree in TEMP.
 * No project checkout, commit, push, promotion or shell access is given to the model.
 */
import { execFileSync } from "node:child_process";
import { mkdir, mkdtemp, readFile, realpath, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { loadLaoConfig } from "../../dist/lao/config.js";
import { LaoOllamaClient } from "../../dist/lao/ollama-client.js";
import { LaoTaskStore } from "../../dist/lao/task-store.js";
import { LaoIsolatedWriteRunner } from "../../dist/lao/write-task-runner.js";

const model = process.argv[2];
if (!model || process.argv.length !== 3) {
  throw new Error("Usage: node src/lao/lao-retry-live.mjs model");
}
const config = loadLaoConfig({ ...process.env, DEVSPACE_LAO_ENABLED: "true", DEVSPACE_LAO_MODEL: model });
const client = new LaoOllamaClient(config);
const installed = new Set((await client.listModels({ timeoutMs: 15_000 })).map(item => item.name));
if (!installed.has(model)) throw new Error("Locally unavailable: " + model);
if (!(await client.inspectModel(model, { timeoutMs: 15_000 })).supportsTools) {
  throw new Error("Model lacks required tools capability metadata");
}

const root = await realpath(await mkdtemp(join(tmpdir(), "lao-live-retry-")));
const source = join(root, "source");
const managedRoot = join(root, "worktrees");
const managed = join(managedRoot, "task");
const state = join(root, "state");
await mkdir(source); await mkdir(managedRoot);
const git = (...args) => execFileSync("git", ["-C", source, ...args],
  { encoding: "utf8", windowsHide: true, timeout: 10_000 }).trim();
let store;
try {
  git("init", "-b", "feature/lao-live-retry");
  await mkdir(join(source, "src"));
  await writeFile(join(source, "src", "value.ts"), "export const value = 0;\n");
  git("add", ".");
  git("-c", "user.name=LAO Live QA", "-c", "user.email=qa@example.invalid",
    "commit", "-m", "baseline");
  const baseSha = git("rev-parse", "HEAD");
  git("worktree", "add", "--detach", managed, "HEAD");
  const workspace = {
    id: "ws_live_retry", root: managed, canonicalRoot: await realpath(managed),
    mode: "worktree", sourceRoot: source,
    worktree: { path: managed, baseRef: "HEAD", baseSha, dirtySource: false,
      detached: true, managed: true },
  };
  store = new LaoTaskStore(state);
  const runner = new LaoIsolatedWriteRunner(store, client, managedRoot, null);
  const task = runner.createTask({
    workspaceId: workspace.id, model,
    goal: "Edit src/value.ts so the exported numeric constant value is exactly 1. Change no other file.",
    acceptanceCriteria: ["static: integrity"],
    permissions: { read: true, write: "isolated_worktree", shell: "none",
      allowedWritePaths: ["src/value.ts"] },
    limits: { maxRevisions: 2, maxToolCalls: 1, maxWallSeconds: 120 },
    requireReview: true,
  }, workspace);
  const snapshot = async () => [{ path: "src/value.ts", content: await readFile(join(managed, "src", "value.ts"), "utf8") }];
  const expectValue = async expected => {
    const content = await readFile(join(managed, "src", "value.ts"), "utf8");
    if (!new RegExp("export\\s+const\\s+value\\s*=\\s*" + expected + "\\s*;").test(content)) {
      throw new Error("Model correction did not produce expected value " + expected + ": " + content.trim());
    }
    return content.trim();
  };
  const results = [];
  let result = await runner.runTask(task.id, workspace, undefined, await snapshot());
  results.push({ revision: 0, model: result.run.model, content: await expectValue(1) });
  for (const expected of [2, 3]) {
    store.decideReview({
      schemaVersion: 1, taskId: task.id, decision: "needs_revision", reviewer: "supervisor",
      criteriaVerified: false, evidence: ["expected_value:" + expected],
      note: "Correction required: change ONLY the exported numeric constant value to exactly " + expected + ".",
      decidedAt: new Date().toISOString(),
    });
    result = await runner.runTask(task.id, workspace, undefined, await snapshot());
    results.push({ revision: result.task.revisionCount, model: result.run.model,
      content: await expectValue(expected) });
  }
  const finalTask = store.get(task.id);
  if (finalTask?.revisionCount !== 2 || finalTask.status !== "awaiting_review") {
    throw new Error("Two-correction revision state was not persisted");
  }
  if (git("status", "--porcelain")) throw new Error("Source checkout was modified by live retry proof");
  const sourceValue = git("show", "HEAD:src/value.ts");
  if (sourceValue !== "export const value = 0;") throw new Error("Source HEAD changed");
  console.log(JSON.stringify({
    mode: "live-local-two-corrections", timestamp: new Date().toISOString(), model,
    results, revisionCount: finalTask.revisionCount,
    runs: store.getRuns(task.id).map(run => ({ model: run.model, status: run.status, errorCode: run.errorCode })),
    sourceCheckoutClean: true, sourceHeadUnchanged: true, promotionPerformed: false,
    noModelShell: true, disposableWorktree: true,
  }, null, 2));
} finally {
  try { store?.close(); } catch {}
  await rm(root, { recursive: true, force: true });
}

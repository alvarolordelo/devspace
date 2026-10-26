#!/usr/bin/env node
/**
 * Optional real-Ollama isolated write smoke. Runs only against a disposable
 * temporary Git repo/worktree and cleans up that repo afterward.
 * Run from feature worktree after pnpm build with DEVSPACE_LAO_ENABLED=true.
 */
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { existsSync, mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { realpath } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { loadLaoConfig } from "../dist/lao/config.js";
import { LaoTaskStore } from "../dist/lao/task-store.js";
import { LaoIsolatedWriteRunner } from "../dist/lao/write-task-runner.js";
import { LaoOllamaClient } from "../dist/lao/ollama-client.js";

const config = loadLaoConfig();
if (!config.enabled) throw new Error("Explicitly set DEVSPACE_LAO_ENABLED=true");
const model = process.argv[2] || config.defaultModel;
const base = mkdtempSync(join(tmpdir(), "lao-real-write-"));
const repo = join(base, "repo");
const managedRoot = join(base, "worktrees");
const path = join(managedRoot, "task-1");
const git = (root, ...args) =>
  execFileSync("git", ["-C", root, ...args], { encoding: "utf8", windowsHide: true }).trim();
mkdirSync(repo); mkdirSync(managedRoot);
let created = false;
let store;
const started = Date.now();
try {
  git(repo, "init", "-b", "feature/lao-real-smoke");
  writeFileSync(join(repo, "README.md"), "Disposable test repo only.\n");
  git(repo, "add", "README.md");
  git(repo, "-c", "user.name=LAO Test", "-c", "user.email=lao@example.invalid", "commit", "-m", "test base");
  git(repo, "worktree", "add", "--detach", path, "HEAD");
  created = true;
  const workspace = {
    id: "isolated-smoke", root: path, canonicalRoot: await realpath(path), mode: "worktree",
    sourceRoot: repo, worktree: {
      path, baseRef: "HEAD", baseSha: git(path, "rev-parse", "HEAD"),
      dirtySource: false, detached: true, managed: true,
    },
  };
  const client = new LaoOllamaClient(config);
  store = new LaoTaskStore(join(base, "state"));
  const runner = new LaoIsolatedWriteRunner(store, client, managedRoot);
  const task = runner.createTask({
    workspaceId: workspace.id, model, goal:
      "Create src/lao-smoke.ts with exactly one TypeScript declaration: export const laoSmoke = true;",
    acceptanceCriteria: ["File contains the exported boolean laoSmoke set to true"],
    permissions: { read: true, write: "isolated_worktree", shell: "none",
      allowedWritePaths: ["src/lao-smoke.ts"] },
    limits: { maxRevisions: 2, maxToolCalls: 1, maxWallSeconds: 120 },
    requireReview: true,
  }, workspace);
  const result = await runner.runTask(task.id, workspace);
  assert.equal(result.task.status, "awaiting_review");
  assert.equal(result.outcome.evidence.criteriaVerified, false);
  assert.equal(result.outcome.evidence.testsVerified, false);
  assert.equal(git(repo, "status", "--porcelain"), "");
  assert.equal(existsSync(join(repo, "src", "lao-smoke.ts")), false);
  assert.equal(existsSync(join(path, "src", "lao-smoke.ts")), true);
  const content = readFileSync(join(path, "src", "lao-smoke.ts"), "utf8");
  assert.match(content, /export const laoSmoke\s*=\s*true;/);
  store.close();
  store = new LaoTaskStore(join(base, "state"));
  assert.equal(store.getWriteEvidence(task.id).length, 1);
  console.log(JSON.stringify({
    model, taskId: task.id, state: store.get(task.id).status,
    persisted: true, sourceUnchanged: true,
    normalizationApplied: store.getWriteEvidence(task.id)[0].normalizationApplied,
    changedFiles: result.outcome.applied.files,
    whitespaceClean: result.outcome.evidence.whitespaceClean,
    output: content.trim(), elapsedMs: Date.now() - started,
    testsVerified: false, criteriaVerified: false, mcpTransportVerified: false,
  }, null, 2));
} finally {
  store?.close();
  if (created) {
    try { git(repo, "worktree", "remove", "--force", path); }
    catch { /* disposable test-only fixture */ }
  }
  rmSync(base, { recursive: true, force: true });
}

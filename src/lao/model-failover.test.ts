import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { realpath } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import type { Workspace } from "../workspaces.js";
import { LaoOllamaError } from "./ollama-client.js";
import { LaoTaskStore } from "./task-store.js";
import { LaoReadOnlyRunner } from "./task-runner.js";
import { LaoIsolatedWriteRunner } from "./write-task-runner.js";

const primary = "granite4.2-8b:gpu";
const fallback = "spark-x2.6-q8-100gpu:latest";
const git = (root: string, ...args: string[]) =>
  execFileSync("git", ["-C", root, ...args], { encoding: "utf8", windowsHide: true }).trim();

const readTask = {
  workspaceId: "ws_failover", model: primary, goal: "Explain one fact",
  acceptanceCriteria: ["Return a concise answer"],
  permissions: { read: true as const, write: "none" as const, shell: "none" as const },
  limits: { maxRevisions: 0, maxToolCalls: 1, maxWallSeconds: 10 }, requireReview: true as const,
};

test("read-only model failover records the failed primary and successful fallback runs", async () => {
  const dir = mkdtempSync(join(tmpdir(), "lao-model-failover-read-"));
  const store = new LaoTaskStore(dir);
  const chats: string[] = [];
  try {
    const runner = new LaoReadOnlyRunner(store, {
      inspectModel: async name => ({ name, capabilities: ["tools"], supportsTools: true }),
      chatReadOnly: async (_prompt, options) => {
        chats.push(options?.model ?? "");
        if (options?.model === primary) throw new LaoOllamaError("TIMEOUT", "primary timed out");
        return "Fallback answer";
      },
    }, fallback);
    const task = runner.createTask(readTask);
    const result = await runner.runTask(task.id);
    assert.equal(result.task.status, "awaiting_review");
    assert.equal(result.run.model, fallback);
    assert.deepEqual(chats, [primary, fallback]);
    assert.deepEqual(store.getRuns(task.id).map(run => [run.model, run.status, run.errorCode]), [
      [primary, "failed", "TIMEOUT"], [fallback, "completed", null],
    ]);
  } finally { store.close(); rmSync(dir, { recursive: true, force: true }); }
});

test("failover never hides a shared Ollama outage", async () => {
  const dir = mkdtempSync(join(tmpdir(), "lao-model-failover-offline-"));
  const store = new LaoTaskStore(dir);
  let chats = 0;
  try {
    const runner = new LaoReadOnlyRunner(store, {
      inspectModel: async name => ({ name, capabilities: ["tools"], supportsTools: true }),
      chatReadOnly: async () => { chats++; throw new LaoOllamaError("OFFLINE", "server offline"); },
    }, fallback);
    const task = runner.createTask(readTask);
    await assert.rejects(runner.runTask(task.id), /server offline/);
    assert.equal(chats, 1, "same offline Ollama server must not be retried under another model name");
    assert.equal(store.get(task.id)?.status, "failed");
    assert.deepEqual(store.getRuns(task.id).map(run => run.model), [primary]);
  } finally { store.close(); rmSync(dir, { recursive: true, force: true }); }
});

test("write failover happens before side effects and applies only the fallback patch", async () => {
  const base = await realpath(mkdtempSync(join(tmpdir(), "lao-model-failover-write-")));
  const source = join(base, "source");
  const worktreeRoot = join(base, "worktrees");
  const managed = join(worktreeRoot, "task");
  const state = join(base, "state");
  mkdirSync(source); mkdirSync(worktreeRoot);
  const store = new LaoTaskStore(state);
  try {
    git(source, "init", "-b", "feature/failover-test");
    writeFileSync(join(source, "README.md"), "Stable\n");
    git(source, "add", ".");
    git(source, "-c", "user.name=LAO QA", "-c", "user.email=qa@example.invalid",
      "commit", "-m", "baseline");
    const baseSha = git(source, "rev-parse", "HEAD");
    git(source, "worktree", "add", "--detach", managed, "HEAD");
    const workspace = {
      id: "ws_write_failover", root: managed, canonicalRoot: await realpath(managed),
      mode: "worktree", sourceRoot: source,
      worktree: { path: managed, baseRef: "HEAD", baseSha, dirtySource: false,
        detached: true, managed: true },
    } as Workspace;
    const runner = new LaoIsolatedWriteRunner(store, {
      inspectModel: async name => ({ name, capabilities: ["tools"], supportsTools: true }),
      chatReadOnly: async (_prompt, options) => options?.model === primary
        ? "not a patch"
        : "*** Begin Patch\n*** Add File: src/feature.ts\n+export const failover = true;\n*** End Patch",
    }, worktreeRoot, fallback);
    const task = runner.createTask({
      workspaceId: workspace.id, model: primary, goal: "Add failover marker",
      acceptanceCriteria: ["static: integrity"],
      permissions: { read: true, write: "isolated_worktree", shell: "none",
        allowedWritePaths: ["src/feature.ts"] },
      limits: { maxRevisions: 0, maxToolCalls: 1, maxWallSeconds: 10 }, requireReview: true,
    }, workspace);
    const result = await runner.runTask(task.id, workspace);
    assert.equal(result.run.model, fallback);
    assert.equal(existsSync(join(managed, "src", "feature.ts")), true);
    assert.equal(existsSync(join(source, "src", "feature.ts")), false);
    assert.equal(git(source, "status", "--porcelain"), "");
    assert.deepEqual(store.getRuns(task.id).map(run => [run.model, run.status, run.errorCode]), [
      [primary, "failed", "INVALID_MODEL_OUTPUT"], [fallback, "completed", null],
    ]);
  } finally { store.close(); rmSync(base, { recursive: true, force: true }); }
});

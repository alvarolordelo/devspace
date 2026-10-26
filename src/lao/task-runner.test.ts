import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import type { LaoOllamaClient } from "./ollama-client.js";
import { LaoTaskStore } from "./task-store.js";
import { LaoReadOnlyRunner } from "./task-runner.js";

const taskInput = {
  workspaceId: "ws_001", goal: "Explain a basic sorting algorithm",
  model: "granite4.2-8b:gpu", acceptanceCriteria: ["Describe complexity"],
  permissions: { read: true as const, write: "none" as const, shell: "none" as const },
  limits: { maxRevisions: 2, maxToolCalls: 5, maxWallSeconds: 10 },
  requireReview: true as const,
};
function setup(fake: Pick<LaoOllamaClient, "inspectModel" | "chatReadOnly">) {
  const dir = mkdtempSync(join(tmpdir(), "lao-runner-"));
  const store = new LaoTaskStore(dir);
  return { store, runner: new LaoReadOnlyRunner(store, fake), done: () => {
    store.close(); rmSync(dir, { recursive: true, force: true });
  } };
}
const model = { inspectModel: async () => ({ name: taskInput.model, capabilities: ["tools"], supportsTools: true }),
  chatReadOnly: async () => "Sorting explanation, not verified" } as Pick<LaoOllamaClient, "inspectModel" | "chatReadOnly">;

test("read-only task records a durable result and waits for review", async () => {
  const { store, runner, done } = setup(model);
  try {
    const task = runner.createTask(taskInput);
    const result = await runner.runTask(task.id);
    assert.equal(result.task.status, "awaiting_review");
    assert.equal(result.run.toolCalls, 0);
    assert.match(result.run.summary ?? "", /not verified/);
    assert.deepEqual(store.events(task.id).map(e => e.to), ["created", "queued", "preparing", "running", "validating", "awaiting_review"]);
    assert.equal(store.getRuns(task.id)[0]?.status, "completed");
    await assert.rejects(runner.runTask(task.id), /not queued/);
  } finally { done(); }
});
test("runner rejects write requests before persistence", () => {
  const { store, runner, done } = setup(model);
  try {
    assert.throws(() => runner.createTask({ ...taskInput, permissions: { read: true, write: "isolated_worktree", shell: "none" } }), /Only read-only/);
    assert.equal(store.list().length, 0);
  } finally { done(); }
});
test("unsupported model cannot execute, task enters failed without a run", async () => {
  const { store, runner, done } = setup({
    inspectModel: async () => ({ name: taskInput.model, capabilities: [], supportsTools: false }),
    chatReadOnly: async () => { throw new Error("must never call"); },
  });
  try {
    const task = runner.createTask(taskInput);
    await assert.rejects(runner.runTask(task.id), /lacks tools/);
    assert.equal(store.get(task.id)?.status, "failed");
    assert.deepEqual(store.getRuns(task.id), []);
  } finally { done(); }
});
test("model failure stores a failed run and never approves the task", async () => {
  const { store, runner, done } = setup({
    inspectModel: model.inspectModel.bind(model),
    chatReadOnly: async () => { throw new Error("transport unavailable"); },
  });
  try {
    const task = runner.createTask(taskInput);
    await assert.rejects(runner.runTask(task.id), /transport unavailable/);
    assert.equal(store.get(task.id)?.status, "failed");
    assert.equal(store.getRuns(task.id)[0]?.status, "failed");
    assert.equal(store.getRuns(task.id)[0]?.errorCode, "EXECUTION_ERROR");
  } finally { done(); }
});
test("runner does not pass tool definitions or filesystem paths to model", async () => {
  let received = "";
  const { runner, done } = setup({
    inspectModel: model.inspectModel.bind(model),
    chatReadOnly: async (input) => { received = input; return "Done"; },
  });
  try {
    const t = runner.createTask(taskInput);
    await runner.runTask(t.id);
    assert.ok(received.includes("cannot inspect project files"));
    assert.equal(received.includes("D:\\"), false);
  } finally { done(); }
});

test("caller cancellation prevents model work and leaves task cancelled", async () => {
  let invoked = 0;
  const { store, runner, done } = setup({
    inspectModel: async () => { invoked++; return { name: taskInput.model, capabilities: ["tools"], supportsTools: true }; },
    chatReadOnly: async () => { invoked++; return "should not run"; },
  });
  try {
    const task = runner.createTask(taskInput);
    const controller = new AbortController();
    controller.abort();
    await assert.rejects(runner.runTask(task.id, controller.signal), /cancelled/);
    assert.equal(invoked, 0);
    assert.equal(store.get(task.id)?.status, "cancelled");
    assert.deepEqual(store.getRuns(task.id), []);
  } finally { done(); }
});

test("task wall-clock deadline aborts slow model inspection", async () => {
  const { store, runner, done } = setup({
    inspectModel: async (_, opts) => new Promise((_, reject) => {
      opts?.signal?.addEventListener("abort", () => reject(new Error("deadline reached")), { once: true });
    }),
    chatReadOnly: async () => { throw new Error("should never chat"); },
  });
  try {
    const task = runner.createTask({ ...taskInput, limits: { ...taskInput.limits, maxWallSeconds: 1 } });
    await assert.rejects(runner.runTask(task.id), /deadline reached/);
    assert.equal(store.get(task.id)?.status, "failed");
    assert.deepEqual(store.getRuns(task.id), []);
  } finally { done(); }
});

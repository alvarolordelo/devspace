import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { LaoTaskStore } from "./task-store.js";

function makeInput(maxRevisions = 2) {
  return {
    workspaceId: "ws_test", model: "granite4.2-8b:gpu",
    goal: "Read repository documentation",
    acceptanceCriteria: ["Evidence-backed summary"],
    permissions: { read: true as const, write: "none" as const, shell: "none" as const },
    limits: { maxRevisions, maxToolCalls: 25, maxWallSeconds: 600 },
    requireReview: true as const,
  };
}
function withStore(fn: (s: LaoTaskStore, dir: string) => void): void {
  const dir = mkdtempSync(join(tmpdir(), "lao-store-"));
  const store = new LaoTaskStore(dir);
  try { fn(store, dir); }
  finally { store.close(); rmSync(dir, { recursive: true, force: true }); }
}
function toReview(s: LaoTaskStore, id: string): void {
  for (const state of ["queued", "preparing", "running", "validating", "awaiting_review"] as const) {
    s.transition(id, state);
  }
}

test("new task is persisted with status-only audit trail, safely reloadable", () => {
  withStore((store, dir) => {
    const task = store.create(makeInput());
    assert.equal(store.get(task.id)?.status, "created");
    store.transition(task.id, "queued");
    assert.deepEqual(store.events(task.id).map(e => e.to), ["created", "queued"]);
    assert.equal(store.events(task.id).some(e => JSON.stringify(e).includes(task.goal)), false);
    store.close();
    const again = new LaoTaskStore(dir);
    assert.equal(again.get(task.id)?.status, "queued");
    assert.equal(again.list().length, 1);
    again.close();
  });
});
test("approval requires an explicit human/supervisor review and verified criteria", () => {
  withStore((store) => {
    const task = store.create(makeInput());
    toReview(store, task.id);
    assert.throws(() => store.transition(task.id, "approved"), /Review/);
    const review = {
      schemaVersion: 1 as const, taskId: task.id, decision: "approved" as const,
      reviewer: "supervisor" as const, criteriaVerified: false,
      evidence: ["test-results"], note: "Missing proof", decidedAt: new Date().toISOString(),
    };
    assert.throws(() => store.decideReview(review), /verified/);
    assert.equal(store.get(task.id)?.status, "awaiting_review");
    store.decideReview({ ...review, criteriaVerified: true });
    assert.equal(store.get(task.id)?.status, "approved");
    assert.equal(store.getReview(task.id)?.evidence[0], "test-results");
    assert.throws(() => store.transition(task.id, "queued"), /Invalid/);
  });
});
test("revisions never exceed the per-task limit", () => {
  withStore((store) => {
    const task = store.create(makeInput(0));
    toReview(store, task.id);
    store.decideReview({
      schemaVersion: 1, taskId: task.id, decision: "needs_revision",
      reviewer: "user", criteriaVerified: false, evidence: ["rejected diff"],
      note: "Needs changes", decidedAt: new Date().toISOString(),
    });
    assert.throws(() => store.transition(task.id, "queued"), /budget/);
  });
});
test("startup recovers running tasks to interrupted without automatic resume", () => {
  withStore((store) => {
    const task = store.create(makeInput());
    store.transition(task.id, "queued");
    store.transition(task.id, "preparing");
    store.transition(task.id, "running");
    assert.equal(store.recoverInterrupted(), 1);
    assert.equal(store.get(task.id)?.status, "interrupted");
    assert.equal(store.recoverInterrupted(), 0);
    assert.equal(store.events(task.id).at(-1)?.to, "interrupted");
    store.transition(task.id, "queued");
    assert.equal(store.get(task.id)?.status, "queued");
  });
});
test("unknown tasks and forbidden jumps fail without writing audit events", () => {
  withStore((store) => {
    assert.throws(() => store.transition(randomUUID(), "queued"), /not found/);
    const task = store.create(makeInput());
    assert.throws(() => store.transition(task.id, "running"), /Invalid/);
    assert.equal(store.events(task.id).length, 1);
  });
});

test("multiple review rounds append evidence without overwriting prior reviews", () => {
  withStore((store) => {
    const task = store.create(makeInput(2));
    toReview(store, task.id);
    const review = (decision: "approved" | "needs_revision", i: number) => ({
      schemaVersion: 1 as const, taskId: task.id, decision, reviewer: "supervisor" as const,
      criteriaVerified: decision === "approved", evidence: [`evidence-${i}`],
      note: `round-${i}`, decidedAt: new Date().toISOString(),
    });
    store.decideReview(review("needs_revision", 1));
    store.transition(task.id, "queued");
    for (const state of ["preparing", "running", "validating", "awaiting_review"] as const) store.transition(task.id, state);
    store.decideReview(review("approved", 2));
    assert.equal(store.getReview(task.id)?.note, "round-2");
    assert.equal(store.get(task.id)?.revisionCount, 1);
  });
});

test("run output persists across reopen; recovery interrupts both task and run", () => {
  const dir = mkdtempSync(join(tmpdir(), "lao-run-recover-"));
  let store = new LaoTaskStore(dir);
  try {
    const task = store.create(makeInput());
    for (const state of ["queued", "preparing", "running"] as const) store.transition(task.id, state);
    const run = store.startRun(task.id);
    assert.equal(run.status, "running");
    assert.throws(() => store.startRun(task.id), /already in progress/);
    store.close();
    store = new LaoTaskStore(dir);
    assert.equal(store.getRuns(task.id)[0]?.status, "running");
    assert.equal(store.recoverInterrupted(), 1);
    assert.equal(store.getRuns(task.id)[0]?.status, "interrupted");
    assert.equal(store.get(task.id)?.status, "interrupted");
    assert.ok(store.getRuns(task.id)[0]?.finishedAt);
  } finally { store.close(); rmSync(dir, { recursive: true, force: true }); }
});
test("completed runs are immutable; their bounded results remain durable", () => {
  withStore((store) => {
    const task = store.create(makeInput());
    for (const state of ["queued", "preparing", "running"] as const) store.transition(task.id, state);
    const run = store.startRun(task.id);
    const saved = store.completeRun(run.id, { status: "completed", summary: "Verified only by supervisor later" });
    assert.equal(saved.status, "completed");
    assert.equal(store.getRuns(task.id)[0]?.summary, saved.summary);
    assert.throws(() => store.completeRun(run.id, { status: "failed" }), /already finished/);
  });
});

test("write-capable task cannot be approved before deterministic verification exists", () => {
  withStore((store) => {
    const task = store.create({
      ...makeInput(), permissions: { read: true, write: "isolated_worktree", shell: "none" },
    });
    toReview(store, task.id);
    assert.throws(() => store.decideReview({
      schemaVersion: 1, taskId: task.id, decision: "approved", reviewer: "supervisor",
      criteriaVerified: true, evidence: ["manual claim"], note: "not enough", decidedAt: new Date().toISOString(),
    }), /deterministic evidence pipeline/);
    assert.equal(store.get(task.id)?.status, "awaiting_review");
  });
});

test("SQLite lease serializes sandbox suites across processes and fences stale owners", async () => {
  const dir = mkdtempSync(join(tmpdir(), "lao-sandbox-lease-"));
  const first = new LaoTaskStore(dir);
  const second = new LaoTaskStore(dir);
  try {
    const task = first.create({
      ...makeInput(),
      permissions: {
        read: true, write: "isolated_worktree", shell: "none",
        allowedWritePaths: ["src/test.js"],
      },
    });
    toReview(first, task.id);
    const initial = first.acquireTestLease(task.id, 20);
    assert.throws(() => second.acquireTestLease(task.id), /already running/);
    assert.equal(second.releaseTestLease(task.id, randomUUID()), false);
    await new Promise<void>(resolve => setTimeout(resolve, 50));
    const recovered = second.acquireTestLease(task.id);
    assert.notEqual(recovered, initial);
    assert.equal(first.releaseTestLease(task.id, initial), false,
      "stale owner must not delete replacement lease");
    assert.throws(() => first.acquireTestLease(task.id), /already running/);
    assert.equal(second.releaseTestLease(task.id, recovered), true);
    const third = first.acquireTestLease(task.id);
    assert.equal(first.releaseTestLease(task.id, third), true);
    const readOnly = first.create(makeInput());
    toReview(first, readOnly.id);
    assert.throws(() => first.acquireTestLease(readOnly.id), /isolated-write/);
    assert.throws(() => first.acquireTestLease(task.id, 0), /duration/);
  } finally {
    first.close();
    second.close();
    rmSync(dir, { recursive: true, force: true });
  }
});

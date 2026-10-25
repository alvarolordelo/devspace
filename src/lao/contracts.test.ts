import assert from "node:assert/strict";
import test from "node:test";
import { laoTaskInputSchema, laoTaskSchema } from "./contracts.js";
import { assertLaoTransition } from "./task-state.js";

const input = {
  workspaceId: "ws_test",
  model: "granite4.2-8b:gpu",
  goal: "Analyze README without edits",
  acceptanceCriteria: ["Return a summary"],
  permissions: { read: true, write: "none", shell: "none" },
  limits: { maxRevisions: 2, maxToolCalls: 25, maxWallSeconds: 600 },
  requireReview: true,
} as const;

test("task contract validates strict read-only input", () => {
  const result = laoTaskInputSchema.parse(input);
  assert.equal(result.permissions.write, "none");
  assert.equal(result.limits.maxRevisions, 2);
});

test("task contract refuses invalid budgets, permissions and unknown fields", () => {
  assert.equal(laoTaskInputSchema.safeParse({ ...input, limits: { ...input.limits, maxRevisions: 3 } }).success, false);
  assert.equal(laoTaskInputSchema.safeParse({ ...input, permissions: { read: true, write: "full_access" } }).success, false);
  assert.equal(laoTaskInputSchema.safeParse({ ...input, arbitrary: true }).success, false);
});

test("task record requires a version, trace ID and timestamps", () => {
  const now = new Date().toISOString();
  const row = laoTaskSchema.parse({
    ...input, schemaVersion: 1,
    id: crypto.randomUUID(), traceId: crypto.randomUUID(),
    status: "created", revisionCount: 0, createdAt: now, updatedAt: now,
  });
  assert.equal(row.status, "created");
});

test("state machine rejects approval without review and invalid jumps", () => {
  assert.throws(() => assertLaoTransition("running", "approved"), /Invalid/);
  assert.throws(() => assertLaoTransition("awaiting_review", "approved"), /Review/);
  assert.doesNotThrow(() => assertLaoTransition("awaiting_review", "approved", "review"));
  assert.throws(() => assertLaoTransition("queued", "interrupted", "recovery"), /Invalid/);
  assert.throws(() => assertLaoTransition("running", "interrupted"), /Recovery/);
});

test("interrupted tasks cannot resume implicitly", () => {
  assert.throws(() => assertLaoTransition("interrupted", "queued", "recovery"), /resume/);
  assert.doesNotThrow(() => assertLaoTransition("interrupted", "queued"));
});

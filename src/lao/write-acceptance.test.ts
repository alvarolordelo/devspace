import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test from "node:test";
import type { LaoTask } from "./contracts.js";
import type { LaoStoredWriteEvidence } from "./task-store.js";
import type { LaoStaticValidation } from "./write-validation.js";
import type { LaoSandboxTestEvidence } from "./write-test-sandbox.js";
import { assessLaoWriteAcceptance } from "./write-acceptance.js";

const fingerprint = "a".repeat(64);
const runId = randomUUID();
const taskId = randomUUID();
const workspaceId = "managed-acceptance-test";
const task = {
  id: taskId, workspaceId, status: "awaiting_review",
  permissions: { write: "isolated_worktree" },
  acceptanceCriteria: ["static: integrity", "node:test tests/feature.test.mjs"],
} as LaoTask;
const write = {
  taskId, runId,
  evidence: { workspaceId, taskId, contentFingerprint: fingerprint },
} as LaoStoredWriteEvidence;
const staticOk = {
  taskId, workspaceId, runId,
  staticChecksPassed: true, fingerprintMatches: true,
  headMatches: true, pathsInScope: true, whitespaceClean: true,
} as LaoStaticValidation;
const testEvidence = {
  taskId, runId, suiteId: "node-test", testFiles: ["tests/feature.test.mjs"],
  image: "node@sha256:" + "c".repeat(64),
  at: new Date().toISOString(),
  executed: true, passed: true, exitCode: 0,
  failureCode: "none", stdoutSha256: "b".repeat(64),
  stderrSha256: "d".repeat(64), integrityMaintained: true,
  contentFingerprint: fingerprint, criteriaVerified: false, approvalAllowed: false,
} as LaoSandboxTestEvidence;

test("machine-declared acceptance requires matching static and successful sandbox evidence", () => {
  const outcome = assessLaoWriteAcceptance(task, write, staticOk, [testEvidence]);
  assert.equal(outcome.allCriteriaVerified, true);
  assert.deepEqual(outcome.criteria.map(x => x.status), ["passed", "passed"]);
  assert.equal(outcome.humanReviewRequired, true);
  assert.equal(outcome.approvalAllowed, false);
  assert.equal(outcome.promotionAllowed, false);
  assert.equal(outcome.contentFingerprint, fingerprint);
});

test("unrecognized natural language and invalid declared paths remain unverified", () => {
  const different = { ...task, acceptanceCriteria: [
    "The feature works end-to-end", "node:test ../secrets.test.mjs",
    "node:test tests/missing.test.js",
  ] };
  const report = assessLaoWriteAcceptance(different, write, staticOk, [testEvidence]);
  assert.equal(report.allCriteriaVerified, false);
  assert.deepEqual(report.criteria.map(x => x.status), [
    "unverified", "unverified", "unverified",
  ]);
  assert.equal(report.approvalAllowed, false);
});

test("latest relevant suite controls, including failure, unavailable and fingerprint mismatch", () => {
  const failing: LaoSandboxTestEvidence = { ...testEvidence, passed: false, exitCode: 1,
    failureCode: "suite_failed" };
  const failed = assessLaoWriteAcceptance(task, write, staticOk, [testEvidence, failing]);
  assert.equal(failed.criteria[1]?.status, "failed");
  assert.equal(failed.allCriteriaVerified, false);
  const unavailable = assessLaoWriteAcceptance(task, write, staticOk, [
    { ...testEvidence, executed: false, passed: false,
      exitCode: null, failureCode: "sandbox_unavailable" },
  ]);
  assert.equal(unavailable.criteria[1]?.status, "failed");
  const modified = assessLaoWriteAcceptance(task, write, staticOk, [
    { ...testEvidence, contentFingerprint: "0".repeat(64) },
  ]);
  assert.equal(modified.criteria[1]?.status, "failed");
  const otherRun = assessLaoWriteAcceptance(task, write, staticOk, [
    { ...testEvidence, runId: randomUUID() },
  ]);
  assert.equal(otherRun.criteria[1]?.status, "unverified");
  const badIntegrity = assessLaoWriteAcceptance(task, write,
    { ...staticOk, fingerprintMatches: false }, [testEvidence]);
  assert.deepEqual(badIntegrity.criteria.map(x => x.status), ["failed", "failed"]);
  assert.equal(badIntegrity.allCriteriaVerified, false);
});

test("assessment rejects mismatched task, workspace or run before interpreting evidence", () => {
  assert.throws(() => assessLaoWriteAcceptance(
    { ...task, workspaceId: "another-workspace" }, write, staticOk, [testEvidence],
  ), /matching pending write/);
  assert.throws(() => assessLaoWriteAcceptance(
    task, { ...write, runId: randomUUID() }, staticOk, [testEvidence],
  ), /matching pending write/);
  assert.throws(() => assessLaoWriteAcceptance(
    { ...task, status: "approved" }, write, staticOk, [testEvidence],
  ), /matching pending write/);
});

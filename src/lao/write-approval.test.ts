import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { realpath } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import type { Workspace } from "../workspaces.js";
import type { McpRegistrationTarget } from "../mcp-modern-server.js";
import { loadLaoConfig } from "./config.js";
import { registerLaoMcpTools } from "./mcp-tools.js";
import { LaoTaskStore } from "./task-store.js";
import { applyLaoWorktreePatch } from "./worktree-patch.js";
import { validateLaoStaticWrite } from "./write-validation.js";
import { assessLaoWriteAcceptance } from "./write-acceptance.js";
import type { LaoSandboxTestEvidence } from "./write-test-sandbox.js";

const git = (root: string, ...args: string[]) =>
  execFileSync("git", ["-C", root, ...args], { encoding: "utf8", windowsHide: true }).trim();
const digest = (s: string) => createHash("sha256").update(s).digest("hex");

test("explicitly reviewed verified write is approved in SQLite, never promoted to source", async () => {
  const base = await realpath(mkdtempSync(join(tmpdir(), "lao-approval-")));
  const source = join(base, "source");
  const managedRoot = join(base, "managed");
  const managed = join(managedRoot, "task");
  mkdirSync(source);
  mkdirSync(managedRoot);
  const store = new LaoTaskStore(join(base, "state"));
  try {
    git(source, "init", "-b", "feature/approval-test");
    mkdirSync(join(source, "src"));
    mkdirSync(join(source, "tests"));
    writeFileSync(join(source, "src", "feature.ts"), "export const feature = false;\n");
    writeFileSync(join(source, "tests", "feature.test.mjs"), "import test from 'node:test';test('ok',()=>{});\n");
    git(source, "add", ".");
    git(source, "-c", "user.name=LAO QA", "-c", "user.email=qa@example.invalid", "commit", "-m", "base");
    git(source, "worktree", "add", "--detach", managed, "HEAD");
    const workspace = {
      id: "ws_approval", root: managed, canonicalRoot: await realpath(managed),
      mode: "worktree", sourceRoot: source,
      worktree: { path: managed, baseRef: "HEAD", baseSha: git(managed, "rev-parse", "HEAD"),
        detached: true, managed: true, dirtySource: false },
    } as Workspace;
    const created = store.create({
      workspaceId: workspace.id, model: "granite4.2-8b:gpu",
      goal: "Change one flag", acceptanceCriteria: [
        "static: integrity", "node:test tests/feature.test.mjs",
      ],
      permissions: { read: true, write: "isolated_worktree", shell: "none",
        allowedWritePaths: ["src/feature.ts"] },
      limits: { maxRevisions: 2, maxToolCalls: 1, maxWallSeconds: 30 },
      requireReview: true,
    });
    for (const step of ["queued", "preparing", "running"] as const) store.transition(created.id, step);
    const run = store.startRun(created.id);
    const patch = "*** Begin Patch\n*** Update File: src/feature.ts\n@@\n-export const feature = false;\n+export const feature = true;\n*** End Patch";
    const changed = await applyLaoWorktreePatch(store.get(created.id)!, workspace, managedRoot, patch);
    store.recordWriteEvidence(run.id, {
      patchSha256: digest(patch), modelOutputSha256: digest(patch),
      normalizationApplied: false, applied: changed.applied, evidence: changed.evidence,
    });
    store.completeRun(run.id, { status: "completed" });
    store.transition(created.id, "validating");
    store.transition(created.id, "awaiting_review");
    const evidence: LaoSandboxTestEvidence = {
      taskId: created.id, runId: run.id, suiteId: "node-test",
      testFiles: ["tests/feature.test.mjs"], image: "node@sha256:" + "c".repeat(64),
      at: new Date().toISOString(), executed: true, passed: true, exitCode: 0,
      failureCode: "none", stdoutSha256: "b".repeat(64),
      stderrSha256: "d".repeat(64), integrityMaintained: true,
      contentFingerprint: changed.evidence.contentFingerprint,
      criteriaVerified: false, approvalAllowed: false,
    };
    const testLease = store.acquireTestLease(created.id);
    store.recordTestEvidence(evidence, testLease);
    store.releaseTestLease(created.id, testLease);
    const task = store.get(created.id)!;
    const saved = store.getWriteEvidence(created.id).at(-1)!;
    const staticValidation = await validateLaoStaticWrite(task, workspace, managedRoot, saved);
    const assessment = assessLaoWriteAcceptance(task, saved, staticValidation,
      store.getTestEvidence(created.id));
    assert.equal(assessment.allCriteriaVerified, true);
    const review = {
      schemaVersion: 1 as const, taskId: created.id, reviewer: "supervisor" as const,
      decision: "approved" as const, criteriaVerified: true,
      evidence: ["run:" + run.id, "sha256:" + changed.evidence.contentFingerprint],
      note: "Operator examined the patch and matching test results",
      decidedAt: new Date().toISOString(),
    };
    assert.throws(() => store.decideReview(review), /deterministic evidence pipeline/);
    const lease = store.acquireTestLease(created.id);
    assert.throws(() => store.approveVerifiedWrite(
      { ...review, evidence: ["run:" + run.id] }, assessment, lease,
    ), /fingerprint/);
    assert.throws(() => store.approveVerifiedWrite(
      review, assessment, "stale-token",
    ), /lease/);
    assert.throws(() => store.approveVerifiedWrite(
      review, { ...assessment, allCriteriaVerified: false }, lease,
    ), /prerequisites/);
    assert.equal(store.releaseTestLease(created.id, lease), true);
    const stateDir = join(base, "state");
    const config = loadLaoConfig({ DEVSPACE_LAO_ENABLED: "true" });
    const registry = {
      getWorkspace: async (id: string) => {
        if (id !== workspace.id) throw new Error("Unknown workspace");
        return workspace;
      },
      openWorkspace: async () => { throw new Error("No new worktree expected"); },
    };
    const registrations = new Map<string, (args: any) => Promise<any>>();
    const registerTool = (name: string, _config: unknown, callback: (args: any) => Promise<any>) => {
      registrations.set(name, callback);
    };
    const prev = process.env.LAO_WRITE_APPROVAL_ENABLED;
    try {
      delete process.env.LAO_WRITE_APPROVAL_ENABLED;
      registerLaoMcpTools({ registerTool } as unknown as Pick<McpRegistrationTarget, "registerTool">,
        config, { stateDir, worktreeRoot: managedRoot, workspaces: registry as any });
      assert.equal(registrations.has("lao_write_approve"), false,
        "approval must not be exposed by the normal LAO opt-in");
      process.env.LAO_WRITE_APPROVAL_ENABLED = "true";
      registerLaoMcpTools({ registerTool } as unknown as Pick<McpRegistrationTarget, "registerTool">,
        config, { stateDir, worktreeRoot: managedRoot, workspaces: registry as any });
      const approve = registrations.get("lao_write_approve");
      assert.ok(approve);
      const denied = await approve({
        workspace_id: workspace.id, task_id: created.id,
        confirmation: "approve anything", review_note: review.note,
      });
      assert.equal(denied.isError, true);
      assert.equal(store.get(created.id)?.status, "awaiting_review");
      // Even with the exact explicit confirmation, a changed worktree must
      // fail closed instead of approving stale evidence.
      writeFileSync(join(managed, "src", "feature.ts"), "export const feature = false;\n");
      const tampered = await approve({
        workspace_id: workspace.id, task_id: created.id,
        confirmation: "APPROVE " + created.id + " " + changed.evidence.contentFingerprint,
        review_note: review.note,
      });
      assert.equal(tampered.isError, true);
      assert.equal(store.get(created.id)?.status, "awaiting_review");
      writeFileSync(join(managed, "src", "feature.ts"), "export const feature = true;\n");
      const allowed = await approve({
        workspace_id: workspace.id, task_id: created.id,
        confirmation: "APPROVE " + created.id + " " + changed.evidence.contentFingerprint,
        review_note: review.note,
      });
      assert.equal(allowed.structuredContent.status, "approved");
      assert.equal(allowed.structuredContent.source_checkout_modified, false);
      assert.equal(allowed.structuredContent.promotion_performed, false);
    } finally {
      if (prev === undefined) delete process.env.LAO_WRITE_APPROVAL_ENABLED;
      else process.env.LAO_WRITE_APPROVAL_ENABLED = prev;
    }
    assert.equal(store.get(created.id)?.status, "approved");
    assert.equal(store.getReview(created.id)?.decision, "approved");
    assert.equal(git(source, "status", "--porcelain"), "");
    assert.equal(git(source, "show", "HEAD:src/feature.ts"), "export const feature = false;");
    assert.equal(git(managed, "status", "--porcelain").includes("src/feature.ts"), true);
    assert.throws(() => store.approveVerifiedWrite(review, assessment, lease), /Invalid/);
  } finally {
    store.close();
    rmSync(base, { recursive: true, force: true });
  }
});

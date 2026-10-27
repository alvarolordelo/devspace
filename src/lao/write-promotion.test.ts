import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { realpath } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import type { Workspace } from "../workspaces.js";
import { LaoTaskStore } from "./task-store.js";
import { applyLaoWorktreePatch } from "./worktree-patch.js";
import { validateLaoStaticWrite } from "./write-validation.js";
import { assessLaoWriteAcceptance } from "./write-acceptance.js";
import { promoteLaoApprovedSingleFile } from "./write-promotion.js";

const git = (cwd: string, ...args: string[]) =>
  execFileSync("git", ["-C", cwd, ...args], { encoding: "utf8", windowsHide: true }).trim();
const digest = (s: string) => createHash("sha256").update(s).digest("hex");

test("approved add/delete promotions touch only their authorized file and retain backups", async () => {
  for (const operation of ["add", "delete"] as const) {
    const base = await realpath(mkdtempSync(join(tmpdir(), "lao-promotion-")));
    const source = join(base, "source");
    const managedRoot = join(base, "worktrees");
    const managed = join(managedRoot, "task");
    const stateDir = join(base, "state");
    mkdirSync(source); mkdirSync(managedRoot);
    const store = new LaoTaskStore(stateDir);
    try {
      git(source, "init", "-b", "feature/promotion-test");
      mkdirSync(join(source, "src")); mkdirSync(join(source, "tests"));
      writeFileSync(join(source, "README.md"), "Unchanged\n");
      writeFileSync(join(source, "tests", "check.test.mjs"),
        "import test from 'node:test';test('checked',()=>{});\n");
      if (operation === "delete") {
        writeFileSync(join(source, "src", "feature.ts"), "export const old = true;\n");
      }
      git(source, "add", ".");
      git(source, "-c", "user.name=LAO QA", "-c", "user.email=qa@example.invalid",
        "commit", "-m", "baseline");
      const baseline = git(source, "rev-parse", "HEAD");
      git(source, "worktree", "add", "--detach", managed, "HEAD");
      const workspace = {
        id: "ws_promote", root: managed, canonicalRoot: await realpath(managed),
        sourceRoot: source, mode: "worktree",
        worktree: { managed: true, detached: true, path: managed, baseRef: "HEAD",
          baseSha: baseline, dirtySource: false },
      } as Workspace;
      const task = store.create({
        workspaceId: workspace.id, model: "granite4.2-8b:gpu",
        goal: "Change one file", acceptanceCriteria: [
          "static: integrity", "node:test tests/check.test.mjs",
        ],
        permissions: { read: true, write: "isolated_worktree", shell: "none",
          allowedWritePaths: ["src/feature.ts"] },
        limits: { maxRevisions: 0, maxToolCalls: 1, maxWallSeconds: 30 },
        requireReview: true,
      });
      for (const state of ["queued", "preparing", "running"] as const) store.transition(task.id, state);
      const run = store.startRun(task.id);
      const patch = operation === "add"
        ? "*** Begin Patch\n*** Add File: src/feature.ts\n+export const created = true;\n*** End Patch"
        : "*** Begin Patch\n*** Delete File: src/feature.ts\n*** End Patch";
      const outcome = await applyLaoWorktreePatch(store.get(task.id)!, workspace, managedRoot, patch);
      store.recordWriteEvidence(run.id, { patchSha256: digest(patch), modelOutputSha256: digest(patch),
        normalizationApplied: false, applied: outcome.applied, evidence: outcome.evidence });
      store.completeRun(run.id, { status: "completed" });
      store.transition(task.id, "validating");
      store.transition(task.id, "awaiting_review");
      const lease = store.acquireTestLease(task.id);
      store.recordTestEvidence({
        taskId: task.id, runId: run.id, suiteId: "node-test", testFiles: ["tests/check.test.mjs"],
        image: "node@sha256:" + "a".repeat(64), at: new Date().toISOString(),
        executed: true, passed: true, exitCode: 0, failureCode: "none",
        stdoutSha256: "b".repeat(64), stderrSha256: "c".repeat(64),
        integrityMaintained: true, contentFingerprint: outcome.evidence.contentFingerprint,
        criteriaVerified: false, approvalAllowed: false,
      }, lease);
      store.releaseTestLease(task.id, lease);
      const evidence = store.getWriteEvidence(task.id).at(-1)!;
      const assessed = assessLaoWriteAcceptance(store.get(task.id)!, evidence,
        await validateLaoStaticWrite(store.get(task.id)!, workspace, managedRoot, evidence),
        store.getTestEvidence(task.id));
      assert.equal(assessed.allCriteriaVerified, true);
      const reviewed = {
        schemaVersion: 1 as const, taskId: task.id, decision: "approved" as const,
        reviewer: "supervisor" as const, criteriaVerified: true,
        evidence: ["run:" + run.id, "sha256:" + assessed.contentFingerprint],
        note: "Human checked patch", decidedAt: new Date().toISOString(),
      };
      const approvalLease = store.acquireTestLease(task.id);
      store.approveVerifiedWrite(reviewed, assessed, approvalLease);
      store.releaseTestLease(task.id, approvalLease);
      const request = {
        task: store.get(task.id)!, workspace, worktreeRoot: managedRoot, sourceRoot: source,
        stateDir, store, confirmation: "PROMOTE " + task.id + " " + outcome.evidence.contentFingerprint,
      };
      await assert.rejects(promoteLaoApprovedSingleFile({
        ...request, confirmation: "PROMOTE " + task.id + " " + "0".repeat(64),
      }), /confirmation/);
      assert.equal(store.getWritePromotion(task.id), null);
      const result = await promoteLaoApprovedSingleFile(request);
      assert.equal(result.path, "src/feature.ts");
      assert.equal(result.action, operation === "add" ? "added" : "deleted");
      assert.equal(result.committed, false);
      assert.equal(result.merged, false);
      assert.equal(store.getWritePromotion(task.id)?.state, "applied");
      assert.equal(git(source, "rev-parse", "HEAD"), baseline);
      assert.equal(readFileSync(join(source, "README.md"), "utf8"), "Unchanged\n");
      if (operation === "add") {
        assert.equal(readFileSync(join(source, "src", "feature.ts"), "utf8"),
          "export const created = true;\n");
      } else {
        assert.equal(existsSync(join(source, "src", "feature.ts")), false);
      }
      await assert.rejects(promoteLaoApprovedSingleFile(request), /dirty|already/);
    } finally {
      store.close();
      rmSync(base, { recursive: true, force: true });
    }
  }
});

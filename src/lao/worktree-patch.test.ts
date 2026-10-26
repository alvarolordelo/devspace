import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { existsSync, mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import type { LaoTask } from "./contracts.js";
import { applyLaoWorktreePatch, normalizeLaoPatchPath } from "./worktree-patch.js";

const git = (cwd: string, ...args: string[]) =>
  execFileSync("git", ["-C", cwd, ...args], { encoding: "utf8", windowsHide: true }).trim();

const addFile = (path: string) =>
  "*** Begin Patch\n*** Add File: " + path + "\n+export const safe = true;\n*** End Patch";

test("scope validator rejects traversal, absolute, secrets and dependency installers", () => {
  for (const value of ["../sneak.ts", "/tmp/sneak.ts", "C:\\temp\\sneak.ts",
    ".git/config", ".github/workflows/ci.yml", ".env", "src/secrets.ts",
    "package.json", "pnpm-lock.yaml", "src/image.png", "src/./hello.ts"]) {
    assert.throws(() => normalizeLaoPatchPath(value));
  }
  assert.equal(normalizeLaoPatchPath("src/feature.ts"), "src/feature.ts");
});

test("host-provided allowlisted patch only writes to managed worktree and stays awaiting review", async () => {
  const root = mkdtempSync(join(tmpdir(), "lao-patch-"));
  const repo = join(root, "repo");
  const managed = join(root, "managed");
  const wt = join(managed, "task-one");
  mkdirSync(repo); mkdirSync(managed);
  try {
    git(repo, "init");
    writeFileSync(join(repo, "README.md"), "base\n");
    git(repo, "add", "README.md");
    git(repo, "-c", "user.name=LAO Test", "-c", "user.email=test@example.com", "commit", "-m", "base");
    git(repo, "worktree", "add", "--detach", wt, "HEAD");
    const workspace = {
      id: "ws_test", root: wt, canonicalRoot: wt, mode: "worktree" as const,
      sourceRoot: repo,
      worktree: { path: wt, managed: true, detached: true,
        baseRef: "HEAD", baseSha: git(wt, "rev-parse", "HEAD"), dirtySource: false },
    };
    const task = {
      id: "test-task", workspaceId: workspace.id,
      status: "running", requireReview: true,
      permissions: { read: true, write: "isolated_worktree", shell: "none", allowedWritePaths: ["src/feature.ts"] },
    } as LaoTask;
    await assert.rejects(applyLaoWorktreePatch(task, workspace, managed, addFile("src/forbidden.ts")), /scope/);
    await assert.rejects(applyLaoWorktreePatch(task, workspace, managed, addFile("../escape.ts")), /relative|allowed/);
    await assert.rejects(applyLaoWorktreePatch(task, workspace, managed, addFile("package.json")), /allowed/);
    await assert.rejects(applyLaoWorktreePatch({ ...task, permissions: { ...task.permissions, allowedWritePaths: [] } },
      workspace, managed, addFile("src/feature.ts")), /allowedWritePaths/);
    const sixActions = "*** Begin Patch\n" + Array(6).fill("*** Add File: src/feature.ts\n+export const safe = true;\n").join("") + "*** End Patch";
    await assert.rejects(applyLaoWorktreePatch(task, workspace, managed, sixActions), /action budget/);
    const illegalMove = "*** Begin Patch\n*** Update File: src/feature.ts\n*** Move to: src/not-approved.ts\n@@\n-old\n+new\n*** End Patch";
    await assert.rejects(applyLaoWorktreePatch(task, workspace, managed, illegalMove), /Move destination/);
    const result = await applyLaoWorktreePatch(task, workspace, managed, addFile("src/feature.ts"));
    assert.equal(result.applied.files.length, 1);
    assert.deepEqual(result.evidence.untrackedFiles, ["src/feature.ts"]);
    assert.equal(result.evidence.testsVerified, false);
    assert.equal(result.evidence.criteriaVerified, false);
    assert.equal(existsSync(join(repo, "src", "feature.ts")), false);
    assert.equal(git(repo, "status", "--porcelain"), "");
    assert.equal(existsSync(join(wt, "src", "feature.ts")), true);
    await assert.rejects(applyLaoWorktreePatch({ ...task, status: "awaiting_review" }, workspace,
      managed, addFile("src/new.ts")), /running/);
  } finally {
    try { git(repo, "worktree", "remove", "--force", wt); } catch { /* temporary cleanup */ }
    rmSync(root, { recursive: true, force: true });
  }
});

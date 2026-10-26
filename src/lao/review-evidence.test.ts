import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import type { LaoTask } from "./contracts.js";
import { collectLaoReviewEvidence } from "./review-evidence.js";

const git = (cwd: string, ...args: string[]) =>
  execFileSync("git", ["-C", cwd, ...args], { encoding: "utf8", windowsHide: true }).trim();

test("review evidence inspects detached worktree without executing tests or approving", async () => {
  const root = mkdtempSync(join(tmpdir(), "lao-evidence-"));
  const repo = join(root, "repo");
  const destination = join(root, "worktrees");
  const wt = join(destination, "one");
  mkdirSync(repo);
  mkdirSync(destination);
  try {
    git(repo, "init");
    writeFileSync(join(repo, "source.txt"), "unchanged\n");
    git(repo, "add", ".");
    git(repo, "-c", "user.name=LAO Test", "-c", "user.email=test@example.com", "commit", "-m", "base");
    git(repo, "worktree", "add", "--detach", wt, "HEAD");
    writeFileSync(join(wt, "source.txt"), "changed\n");
    writeFileSync(join(wt, "new.txt"), "new\n");
    const task = {
      id: "lao-t", workspaceId: "ws_worktree",
      permissions: { read: true, write: "isolated_worktree", shell: "none" },
    } as LaoTask;
    const workspace = {
      id: "ws_worktree", root: wt, canonicalRoot: wt, mode: "worktree" as const,
      sourceRoot: repo,
      worktree: { path: wt, managed: true, detached: true, dirtySource: false,
        baseRef: "HEAD", baseSha: git(wt, "rev-parse", "HEAD") },
    };
    const result = await collectLaoReviewEvidence(task, workspace, destination);
    assert.deepEqual(result.changedFiles, ["source.txt"]);
    assert.deepEqual(result.untrackedFiles, ["new.txt"]);
    assert.equal(result.whitespaceClean, true);
    assert.match(result.contentFingerprint, /^[0-9a-f]{64}$/);
    assert.equal(result.testsVerified, false);
    assert.equal(result.criteriaVerified, false);
    assert.equal(result.head, git(repo, "rev-parse", "HEAD"));
    assert.equal(git(repo, "status", "--porcelain"), "");
    writeFileSync(join(wt, "source.txt"), "trailing whitespace  \n");
    const whitespace = await collectLaoReviewEvidence(task, workspace, destination);
    assert.equal(whitespace.whitespaceClean, false);
    assert.notEqual(whitespace.contentFingerprint, result.contentFingerprint);
    writeFileSync(join(wt, "new.txt"), "new untracked  \n");
    const untrackedWhitespace = await collectLaoReviewEvidence(task, workspace, destination);
    assert.equal(untrackedWhitespace.whitespaceClean, false);
    assert.notEqual(untrackedWhitespace.contentFingerprint, whitespace.contentFingerprint);
    await assert.rejects(collectLaoReviewEvidence(task, { ...workspace, mode: "checkout" }, destination), /managed/);
  } finally {
    try { git(repo, "worktree", "remove", "--force", wt); } catch { /* temp cleanup */ }
    rmSync(root, { recursive: true, force: true });
  }
});

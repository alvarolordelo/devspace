import assert from "node:assert/strict";
import { resolve } from "node:path";
import test from "node:test";
import type { LaoTask } from "./contracts.js";
import { authorizeLaoWorkspace } from "./write-boundary.js";

const tmp = resolve("D:/devspace/managed");
const path = resolve(tmp, "worktree-a");
const repo = resolve("D:/projects/original");
const task = {
  workspaceId: "ws_a", permissions: { read: true, write: "isolated_worktree", shell: "none" },
} as LaoTask;
const workspace = {
  id: "ws_a", root: path, canonicalRoot: path, mode: "worktree" as const,
  sourceRoot: repo,
  worktree: { path, managed: true, detached: true, baseRef: "HEAD", baseSha: "abc", dirtySource: false },
};
test("write permission only works inside a detached managed worktree", () => {
  assert.equal(authorizeLaoWorkspace(task, workspace, tmp), "isolated_worktree");
  assert.throws(() => authorizeLaoWorkspace(task, { ...workspace, mode: "checkout" }, tmp), /managed/);
  assert.throws(() => authorizeLaoWorkspace(task, { ...workspace, worktree: { ...workspace.worktree, managed: false } }, tmp), /managed/);
  assert.throws(() => authorizeLaoWorkspace(task, { ...workspace, worktree: { ...workspace.worktree, detached: false } }, tmp), /managed/);
  assert.throws(() => authorizeLaoWorkspace(task, { ...workspace, root: repo, canonicalRoot: repo }, tmp), /boundary/);
  assert.throws(() => authorizeLaoWorkspace(task, { ...workspace, canonicalRoot: repo }, tmp), /boundary/);
  assert.throws(() => authorizeLaoWorkspace(task, { ...workspace, id: "wrong" }, tmp), /mismatch/);
});
test("shell remains denied even with a detached worktree", () => {
  const withShell = { ...task, permissions: { ...task.permissions, shell: "allowlist" as const } };
  assert.throws(() => authorizeLaoWorkspace(withShell, workspace, tmp), /Shell policy/);
});
test("read-only tasks never gain write permission by having a worktree", () => {
  const readOnly = { ...task, permissions: { ...task.permissions, write: "none" as const } };
  assert.equal(authorizeLaoWorkspace(readOnly, workspace, tmp), "read_only");
});

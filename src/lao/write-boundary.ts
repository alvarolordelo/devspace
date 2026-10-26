import { resolve } from "node:path";
import { AccessDeniedError, isPathInsideRoot } from "../roots.js";
import type { Workspace } from "../workspaces.js";
import type { LaoTask } from "./contracts.js";

/**
 * Fail-closed preflight for future write-capable tasks.
 * This is not a sandbox for shell execution; shell remains disallowed.
 */
export function authorizeLaoWorkspace(
  task: LaoTask,
  workspace: Pick<Workspace, "id" | "root" | "canonicalRoot" | "mode" | "sourceRoot" | "worktree">,
  worktreeRoot: string,
): "read_only" | "isolated_worktree" {
  if (task.workspaceId !== workspace.id) throw new AccessDeniedError("Task/workspace mismatch");
  if (task.permissions.shell !== "none") {
    throw new AccessDeniedError("Shell policy is not implemented; no shell access");
  }
  if (task.permissions.write === "none") return "read_only";
  if (task.permissions.write !== "isolated_worktree" ||
      workspace.mode !== "worktree" ||
      !workspace.worktree?.managed ||
      !workspace.worktree.detached ||
      !workspace.sourceRoot) {
    throw new AccessDeniedError("Writing requires a managed, detached worktree");
  }
  const root = resolve(workspace.root);
  const canonical = resolve(workspace.canonicalRoot);
  const safeRoot = resolve(worktreeRoot);
  if (root === safeRoot || canonical === safeRoot ||
      !isPathInsideRoot(root, safeRoot) ||
      !isPathInsideRoot(canonical, safeRoot) ||
      resolve(workspace.worktree.path) !== root ||
      isPathInsideRoot(root, workspace.sourceRoot)) {
    throw new AccessDeniedError("Worktree containment boundary failed");
  }
  return "isolated_worktree";
}

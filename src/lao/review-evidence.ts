import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { authorizeLaoWorkspace } from "./write-boundary.js";
import type { LaoTask } from "./contracts.js";
import type { Workspace } from "../workspaces.js";

const execFileAsync = promisify(execFile);
export interface LaoReviewEvidence {
  taskId: string;
  workspaceId: string;
  head: string;
  changedFiles: string[];
  untrackedFiles: string[];
  diffSummary: string;
  whitespaceClean: boolean;
  testsVerified: false;
  criteriaVerified: false;
}

/**
 * Non-executing, deterministic worktree inspection for host review.
 * Tests and acceptance criteria are not declared verified here.
 */
export async function collectLaoReviewEvidence(
  task: LaoTask,
  workspace: Pick<Workspace, "id" | "root" | "canonicalRoot" | "mode" | "sourceRoot" | "worktree">,
  worktreeRoot: string,
): Promise<LaoReviewEvidence> {
  if (authorizeLaoWorkspace(task, workspace, worktreeRoot) !== "isolated_worktree") {
    throw new Error("Write evidence requires a managed worktree task");
  }
  const git = async (...args: string[]) => {
    const result = await execFileAsync(
      "git", ["-c", "core.fsmonitor=false", "-c", "core.pager=cat", "-C", workspace.root, ...args],
      { timeout: 10_000, maxBuffer: 256 * 1024, windowsHide: true },
    );
    return result.stdout.trim();
  };
  const head = await git("rev-parse", "--verify", "HEAD");
  if (!/^[0-9a-f]{40,64}$/i.test(head)) throw new Error("Invalid worktree HEAD");
  const tracked = await git("diff", "--no-ext-diff", "--name-only", "HEAD", "--");
  const untracked = await git("ls-files", "--others", "--exclude-standard", "--");
  const diffSummary = await git("diff", "--no-ext-diff", "--stat", "HEAD", "--");
  let whitespaceClean = true;
  try {
    await git("diff", "--no-ext-diff", "--check", "HEAD", "--");
  } catch (error) {
    // git diff --check exits 2 on an actual error, 2 can also indicate errors
    // from the diff operation. Fail closed in either case.
    if (typeof error !== "object" || error === null || !("code" in error) ||
        ![1, 2].includes(Number(error.code))) throw error;
    whitespaceClean = false;
  }
  const names = (value: string) => value ? value.split(/\r?\n/).filter(Boolean) : [];
  return {
    taskId: task.id, workspaceId: workspace.id, head,
    changedFiles: names(tracked), untrackedFiles: names(untracked),
    diffSummary: diffSummary.slice(0, 10000),
    whitespaceClean, testsVerified: false, criteriaVerified: false,
  };
}

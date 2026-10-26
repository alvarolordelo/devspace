import { createHash } from "node:crypto";
import { execFile } from "node:child_process";
import { lstat, readFile } from "node:fs/promises";
import { isAbsolute, join, win32 } from "node:path";
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
  /** SHA-256 over Git's full tracked diff and the actual bytes of untracked files. */
  contentFingerprint: string;
  whitespaceClean: boolean;
  testsVerified: false;
  criteriaVerified: false;
}

/**
 * Non-executing, deterministic worktree inspection for host review.
 * The fingerprint lets a later validation detect edits after the model run.
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
  const gitRaw = async (...args: string[]) => {
    const result = await execFileAsync(
      "git", ["-c", "core.fsmonitor=false", "-c", "core.pager=cat", "-C", workspace.root, ...args],
      { timeout: 10_000, maxBuffer: 256 * 1024, windowsHide: true },
    );
    return result.stdout;
  };
  const git = async (...args: string[]) => (await gitRaw(...args)).trim();
  const head = await git("rev-parse", "--verify", "HEAD");
  if (!/^[0-9a-f]{40,64}$/i.test(head)) throw new Error("Invalid worktree HEAD");
  const tracked = await git("diff", "--no-ext-diff", "--name-only", "HEAD", "--");
  const untracked = await git("ls-files", "--others", "--exclude-standard", "--");
  const diffSummary = await git("diff", "--no-ext-diff", "--stat", "HEAD", "--");
  const names = (value: string) => value ? value.split(/\r?\n/).filter(Boolean) : [];
  const changedFiles = names(tracked);
  const untrackedFiles = names(untracked);
  if (changedFiles.length + untrackedFiles.length > 20) {
    throw new Error("Too many changed files to inspect");
  }
  const fingerprint = createHash("sha256").update(JSON.stringify({ head, changedFiles, untrackedFiles }));
  fingerprint.update("\0");
  fingerprint.update(await gitRaw("diff", "--no-ext-diff", "--binary", "HEAD", "--"));
  let untrackedWhitespaceClean = true;
  for (const name of [...untrackedFiles].sort()) {
    if (!name || isAbsolute(name) || win32.isAbsolute(name) ||
        name.includes("\\") || name.split("/").some(part => !part || part === "." || part === "..")) {
      throw new Error("Unsafe untracked file name");
    }
    let path = workspace.root;
    for (const part of name.split("/")) {
      path = join(path, part);
      const entry = await lstat(path);
      if (entry.isSymbolicLink()) throw new Error("Symlinked worktree changes are not reviewable");
    }
    const entry = await lstat(path);
    if (!entry.isFile() || entry.size > 64 * 1024) {
      throw new Error("Untracked file is not a bounded regular file");
    }
    const bytes = await readFile(path);
    fingerprint.update("\0" + name + "\0");
    fingerprint.update(bytes);
    if (bytes.toString("utf8").split(/\r?\n/).some(line => /[ \t]+$/.test(line))) {
      untrackedWhitespaceClean = false;
    }
  }
  let whitespaceClean = untrackedWhitespaceClean;
  try {
    await git("diff", "--no-ext-diff", "--check", "HEAD", "--");
  } catch (error) {
    if (typeof error !== "object" || error === null || !("code" in error) ||
        ![1, 2].includes(Number(error.code))) throw error;
    whitespaceClean = false;
  }
  return {
    taskId: task.id, workspaceId: workspace.id, head,
    changedFiles, untrackedFiles,
    diffSummary: diffSummary.slice(0, 10000),
    contentFingerprint: fingerprint.digest("hex"),
    whitespaceClean, testsVerified: false, criteriaVerified: false,
  };
}

import { isAbsolute, join, posix, win32 } from "node:path";
import { lstat } from "node:fs/promises";
import { applyPatch, parsePatch, type ApplyPatchResult } from "../apply-patch.js";
import type { Workspace } from "../workspaces.js";
import type { LaoTask } from "./contracts.js";
import { authorizeLaoWorkspace } from "./write-boundary.js";
import { collectLaoReviewEvidence, type LaoReviewEvidence } from "./review-evidence.js";

export interface LaoPatchOutcome {
  applied: ApplyPatchResult;
  evidence: LaoReviewEvidence;
}
const blockedSegment = /^(?:\.git|\.github|\.devspace|\.ssh|\.aws|node_modules|dist|build|\.env(?:\..*)?|secrets?(?:\..*)?|credentials(?:\..*)?)$/i;
const blockedFile = /^(?:package\.json|package-lock\.json|pnpm-lock\.yaml|yarn\.lock|\.npmrc|\.netrc)$/i;
const extensions = /\.(?:md|txt|ts|tsx|js|jsx|mjs|cjs|json|css|scss|html|htm|py|php|java|go|rs|sql|yml|yaml|xml)$/i;

/** Fail-closed path allowlist for an experimental, supervisor-supplied patch. */
export function normalizeLaoPatchPath(input: string): string {
  if (!input || input.length > 240 || input.includes("\0") || /[\r\n:]/.test(input) ||
      input.startsWith("~") || isAbsolute(input) || posix.isAbsolute(input) || win32.isAbsolute(input)) {
    throw new Error("LAO patch path must be relative");
  }
  const parts = input.replace(/\\/g, "/").split("/");
  if (parts.some(part => !part || part === "." || part === ".." || blockedSegment.test(part)) ||
      blockedFile.test(parts.at(-1)!) || !extensions.test(parts.at(-1)!)) {
    throw new Error("LAO patch path is not allowed");
  }
  return parts.join("/");
}

/**
 * This is an internal primitive, NOT yet an MCP delegation tool.
 * Task and allowlist must be established by an authorized supervisor.
 * Does not execute commands, commit, push or auto-approve.
 */
export async function applyLaoWorktreePatch(
  task: LaoTask,
  workspace: Pick<Workspace, "id" | "root" | "canonicalRoot" | "mode" | "sourceRoot" | "worktree">,
  worktreeRoot: string,
  patch: string,
): Promise<LaoPatchOutcome> {
  if (task.status !== "running") throw new Error("LAO task must be running");
  if (!task.requireReview) throw new Error("LAO task must require review");
  if (authorizeLaoWorkspace(task, workspace, worktreeRoot) !== "isolated_worktree") {
    throw new Error("LAO write permission missing");
  }
  if (!patch || Buffer.byteLength(patch, "utf8") > 32_000) {
    throw new RangeError("LAO patch byte budget exceeded");
  }
  const approvedPaths = task.permissions.allowedWritePaths ?? [];
  if (!approvedPaths.length || approvedPaths.length > 20) {
    throw new Error("Explicit allowedWritePaths required");
  }
  const key = (value: string) => process.platform === "win32" ? value.toLowerCase() : value;
  const allowed = new Set(approvedPaths.map(value => key(normalizeLaoPatchPath(value))));
  // Existing manual changes must not be laundered into this task's evidence.
  const before = await collectLaoReviewEvidence(task, workspace, worktreeRoot);
  assertEvidenceInScope(before, allowed, key);
  const actions = parsePatch(patch);
  if (!actions.length || actions.length > 5) throw new RangeError("LAO patch action budget exceeded");
  for (const action of actions) {
    await assertNoSymlinks(workspace.root, normalizeLaoPatchPath(action.path));
    if (!allowed.has(key(normalizeLaoPatchPath(action.path)))) {
      throw new Error("Patch path is outside explicit task scope");
    }
    if (action.kind === "update" && action.moveTo) {
      await assertNoSymlinks(workspace.root, normalizeLaoPatchPath(action.moveTo));
    }
    if (action.kind === "update" && action.moveTo &&
        !allowed.has(key(normalizeLaoPatchPath(action.moveTo)))) {
      throw new Error("Move destination is outside explicit task scope");
    }
  }
  const applied = await applyPatch(workspace.root, patch);
  const evidence = await collectLaoReviewEvidence(task, workspace, worktreeRoot);
  assertEvidenceInScope(evidence, allowed, key);
  return { applied, evidence };
}

function assertEvidenceInScope(
  evidence: LaoReviewEvidence, allowed: Set<string>, key: (path: string) => string,
): void {
  for (const changed of [...evidence.changedFiles, ...evidence.untrackedFiles]) {
    let normalized: string;
    try { normalized = normalizeLaoPatchPath(changed); }
    catch { throw new Error("Worktree contains disallowed file changes"); }
    if (!allowed.has(key(normalized))) throw new Error("Worktree contains out-of-scope changes");
  }
}

/** Deny symlinked targets/parents, even if they currently resolve within the worktree. */
async function assertNoSymlinks(root: string, relativePath: string): Promise<void> {
  let part = root;
  for (const segment of relativePath.split("/")) {
    part = join(part, segment);
    try {
      const entry = await lstat(part);
      if (entry.isSymbolicLink()) throw new Error("LAO write through symlink denied");
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") break;
      throw error;
    }
  }
}

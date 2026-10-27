import { createHash, randomUUID } from "node:crypto";
import { execFile } from "node:child_process";
import { chmod, lstat, mkdir, mkdtemp, readFile, realpath, rename, rm, unlink, writeFile } from "node:fs/promises";
import { dirname, join, resolve, sep } from "node:path";
import { promisify } from "node:util";
import type { Workspace } from "../workspaces.js";
import type { LaoTask } from "./contracts.js";
import type { LaoTaskStore } from "./task-store.js";
import { collectLaoReviewEvidence } from "./review-evidence.js";
import { authorizeLaoWorkspace } from "./write-boundary.js";
import { normalizeLaoPatchPath } from "./worktree-patch.js";

const gitExec = promisify(execFile);
const sha = (bytes: Buffer) => createHash("sha256").update(bytes).digest("hex");
const inside = (parent: string, child: string) =>
  child === parent || child.startsWith(parent + sep);
const canonical = (s: string) => process.platform === "win32" ? s.toLowerCase() : s;
const git = async (cwd: string, ...args: string[]) => (await gitExec("git",
  ["-c", "core.fsmonitor=false", "-C", cwd, ...args],
  { timeout: 8_000, windowsHide: true, maxBuffer: 128 * 1024 })).stdout.trim();

async function guardedPath(root: string, relative: string): Promise<{
  path: string; exists: boolean; mode: number | null;
}> {
  let path = root;
  const parts = relative.split("/");
  for (let i = 0; i < parts.length; i++) {
    path = join(path, parts[i]!);
    const entry = await lstat(path).catch((error: NodeJS.ErrnoException) => {
      if (error.code === "ENOENT") return null;
      throw error;
    });
    if (entry?.isSymbolicLink()) throw new Error("Symlink in promotion target path");
    if (i < parts.length - 1 && entry && !entry.isDirectory()) {
      throw new Error("Non-directory promotion parent");
    }
    if (i === parts.length - 1) {
      if (entry && (!entry.isFile() || entry.size > 64 * 1024)) {
        throw new Error("Promotion target must be a bounded regular file");
      }
      return { path, exists: !!entry, mode: entry?.mode ?? null };
    }
  }
  throw new Error("Empty promotion target path");
}

/**
 * F4 first deliberately limited promotion: one explicitly approved file,
 * from a detached managed worktree to its clean, same-HEAD feature checkout.
 * This is never invoked by a model. Durable local backup + SQLite ledger
 * allow manual recovery after power loss; no commit, push or merge.
 */
export async function promoteLaoApprovedSingleFile(input: {
  task: LaoTask;
  workspace: Pick<Workspace, "id" | "root" | "canonicalRoot" | "mode" | "sourceRoot" | "worktree">;
  worktreeRoot: string;
  sourceRoot: string;
  stateDir: string;
  store: LaoTaskStore;
  confirmation: string;
}): Promise<{ taskId: string; path: string; action: "added" | "updated" | "deleted";
  sourceModified: true; committed: false; merged: false; backupRetained: true }> {
  const { task, workspace, worktreeRoot, stateDir, store, confirmation } = input;
  if (task.status !== "approved" || task.permissions.write !== "isolated_worktree" ||
      !task.requireReview || store.get(task.id)?.status !== "approved") {
    throw new Error("Only audited approved isolated writes may be promoted");
  }
  authorizeLaoWorkspace(task, workspace, worktreeRoot);
  const stored = store.getWriteEvidence(task.id).at(-1);
  const review = store.getReview(task.id);
  if (!stored || review?.decision !== "approved" || !review.criteriaVerified ||
      !review.evidence.includes("run:" + stored.runId) ||
      !review.evidence.includes("sha256:" + stored.evidence.contentFingerprint)) {
    throw new Error("Approved patch evidence or review missing");
  }
  const current = await collectLaoReviewEvidence(task, workspace, worktreeRoot);
  if (current.head !== stored.evidence.head ||
      current.contentFingerprint !== stored.evidence.contentFingerprint) {
    throw new Error("Approved worktree has changed since review");
  }
  const allowed = task.permissions.allowedWritePaths ?? [];
  const changed = [...current.changedFiles, ...current.untrackedFiles];
  if (changed.length !== 1 || !allowed.includes(changed[0]!)) {
    throw new Error("Single-file promotion requires exactly one approved path");
  }
  const file = normalizeLaoPatchPath(changed[0]!);
  if (file !== changed[0]) throw new Error("Non-canonical promotion path");
  const sourceRoot = await realpath(input.sourceRoot);
  const expectedSource = await realpath(workspace.sourceRoot!);
  if (canonical(sourceRoot) !== canonical(expectedSource) ||
      inside(canonical(sourceRoot), canonical(await realpath(workspace.root))) ||
      !((await git(sourceRoot, "symbolic-ref", "--short", "HEAD")).startsWith("feature/")) ||
      canonical(await realpath(await git(sourceRoot, "rev-parse", "--show-toplevel"))) !== canonical(sourceRoot)) {
    throw new Error("Only the authorized feature checkout may receive a promotion");
  }
  if (await git(sourceRoot, "rev-parse", "HEAD") !== stored.evidence.head ||
      await git(sourceRoot, "status", "--porcelain=v1", "--untracked-files=all")) {
    throw new Error("Source HEAD changed or checkout is dirty");
  }
  const expected = "PROMOTE " + task.id + " " + stored.evidence.contentFingerprint;
  if (confirmation !== expected) throw new Error("Explicit per-patch promotion confirmation missing");
  const normalizedState = resolve(stateDir);
  if (inside(canonical(sourceRoot), canonical(normalizedState)) ||
      inside(canonical(workspace.root), canonical(normalizedState))) {
    throw new Error("Promotion backup cannot reside inside a source checkout or worktree");
  }
  const src = await guardedPath(workspace.root, file);
  const dst = await guardedPath(sourceRoot, file);
  const bytes = src.exists ? await readFile(src.path) : null;
  const original = dst.exists ? await readFile(dst.path) : null;
  const lastLook = await collectLaoReviewEvidence(task, workspace, worktreeRoot);
  if (lastLook.head !== current.head ||
      lastLook.contentFingerprint !== current.contentFingerprint) {
    throw new Error("Approved worktree was modified during promotion preflight");
  }
  if (bytes && bytes.length > 64 * 1024) throw new Error("Promotion file exceeds budget");
  if (!bytes && !original) throw new Error("Cannot promote an absent file");
  if (bytes && original && sha(bytes) === sha(original)) throw new Error("Source already matches patch");
  const action = !bytes ? "deleted" : original ? "updated" : "added";
  // State and worktree identity are checked again immediately before writes.
  const backupParent = join(normalizedState, "lao", "promotion-backups");
  await mkdir(backupParent, { recursive: true, mode: 0o700 });
  const backupDir = await mkdtemp(join(backupParent, task.id + "-"));
  if (original) await writeFile(join(backupDir, "original.bin"), original, { mode: 0o600, flag: "wx" });
  if (bytes) await writeFile(join(backupDir, "approved.bin"), bytes, { mode: 0o600, flag: "wx" });
  await writeFile(join(backupDir, "receipt.json"), JSON.stringify({
    taskId: task.id, sourceRoot, file, action, sourceHead: current.head,
    fingerprint: current.contentFingerprint, originalSha256: original ? sha(original) : null,
    approvedSha256: bytes ? sha(bytes) : null, operatorReviewAt: review.decidedAt,
    recovery: "Inspect source and original.bin; never automatically replay after crash.",
  }, null, 2) + "\n", { mode: 0o600, flag: "wx" });
  let token = "";
  let didModify = false;
  let staged: string | null = null;
  try {
    token = store.beginWritePromotion(task.id, sourceRoot,
      current.contentFingerprint, backupDir);
    if (!(await git(sourceRoot, "symbolic-ref", "--short", "HEAD")).startsWith("feature/") ||
        await git(sourceRoot, "rev-parse", "HEAD") !== current.head ||
        await git(sourceRoot, "status", "--porcelain=v1", "--untracked-files=all")) {
      throw new Error("Source changed before promotion write");
    }
    const again = await guardedPath(sourceRoot, file);
    const fresh = again.exists ? await readFile(again.path) : null;
    if ((fresh ? sha(fresh) : null) !== (original ? sha(original) : null)) {
      throw new Error("Source file changed during promotion preflight");
    }
    if ((await collectLaoReviewEvidence(task, workspace, worktreeRoot)).contentFingerprint !==
        current.contentFingerprint) {
      throw new Error("Approved worktree changed immediately before promotion");
    }
    if (bytes) {
      await mkdir(dirname(dst.path), { recursive: true });
      staged = join(dirname(dst.path), ".lao-promote-" + randomUUID() + ".tmp");
      await writeFile(staged, bytes, { mode: (dst.mode ?? 0o644) & 0o777, flag: "wx" });
      await chmod(staged, (dst.mode ?? 0o644) & 0o777);
      await rename(staged, dst.path);
      staged = null;
    } else {
      await unlink(dst.path);
    }
    didModify = true;
    const applied = await guardedPath(sourceRoot, file);
    const actual = applied.exists ? await readFile(applied.path) : null;
    if ((actual ? sha(actual) : null) !== (bytes ? sha(bytes) : null)) {
      throw new Error("Promoted content verification failed");
    }
    if (!store.finishWritePromotion(task.id, token, "applied")) {
      throw new Error("Promotion ledger was modified by another process");
    }
    return {
      taskId: task.id, path: file, action,
      sourceModified: true, committed: false, merged: false, backupRetained: true,
    };
  } catch (error) {
    if (token) {
      let state: "rolled_back" | "needs_recovery" = "rolled_back";
      try {
        if (didModify) {
          const now = await guardedPath(sourceRoot, file);
          const nowBytes = now.exists ? await readFile(now.path) : null;
          if ((nowBytes ? sha(nowBytes) : null) !== (bytes ? sha(bytes) : null)) {
            throw new Error("External edits prevent automatic rollback");
          }
          if (original) {
            const recoveryStage = join(dirname(dst.path), ".lao-recover-" + randomUUID() + ".tmp");
            await writeFile(recoveryStage, original, { mode: (dst.mode ?? 0o644) & 0o777, flag: "wx" });
            await rename(recoveryStage, dst.path);
          } else await unlink(dst.path);
        }
      } catch {
        state = "needs_recovery";
      }
      store.finishWritePromotion(task.id, token, state);
    }
    throw error;
  } finally {
    if (staged) await rm(staged, { force: true }).catch(() => undefined);
    // Backups and receipts remain available for audit/manual recovery.
  }
}

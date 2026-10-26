import { lstat, readFile } from "node:fs/promises";
import { join } from "node:path";
import ts from "typescript";
import type { Workspace } from "../workspaces.js";
import type { LaoTask } from "./contracts.js";
import type { LaoStoredWriteEvidence } from "./task-store.js";
import { collectLaoReviewEvidence } from "./review-evidence.js";
import { authorizeLaoWorkspace } from "./write-boundary.js";
import { normalizeLaoPatchPath } from "./worktree-patch.js";

export interface LaoStaticSyntaxCheck {
  path: string;
  outcome: "passed" | "failed" | "skipped";
  errors: number;
}
export interface LaoStaticValidation {
  taskId: string;
  workspaceId: string;
  runId: string;
  fingerprintMatches: boolean;
  headMatches: boolean;
  pathsInScope: boolean;
  whitespaceClean: boolean;
  syntaxChecks: LaoStaticSyntaxCheck[];
  staticChecksPassed: boolean;
  /** Syntax inspection is not a test-suite execution or acceptance verification. */
  testsExecuted: false;
  criteriaVerified: false;
}

/**
 * No shell, no evaluation, no module imports from the worktree.
 * Verify the patch still matches the stored run and parse supported files.
 * NEVER allow this result alone to approve or promote a write task.
 */
export async function validateLaoStaticWrite(
  task: LaoTask,
  workspace: Pick<Workspace, "id" | "root" | "canonicalRoot" | "mode" | "sourceRoot" | "worktree">,
  worktreeRoot: string,
  stored: Pick<LaoStoredWriteEvidence, "taskId" | "runId" | "evidence">,
): Promise<LaoStaticValidation> {
  if (task.status !== "awaiting_review" || task.permissions.write !== "isolated_worktree" ||
      task.id !== stored.taskId || task.workspaceId !== workspace.id ||
      stored.evidence.taskId !== task.id || stored.evidence.workspaceId !== workspace.id) {
    throw new Error("Static verification requires matching awaiting-review write task");
  }
  authorizeLaoWorkspace(task, workspace, worktreeRoot);
  const current = await collectLaoReviewEvidence(task, workspace, worktreeRoot);
  const headMatches = current.head === stored.evidence.head;
  // Old runs without a captured digest are NEVER treated as verified.
  const fingerprintMatches = /^[0-9a-f]{64}$/.test(stored.evidence.contentFingerprint ?? "") &&
    current.contentFingerprint === stored.evidence.contentFingerprint;
  const key = (name: string) => process.platform === "win32" ? name.toLowerCase() : name;
  const approved = new Set((task.permissions.allowedWritePaths ?? []).map(p => key(normalizeLaoPatchPath(p))));
  const changed = [...current.changedFiles, ...current.untrackedFiles];
  let pathsInScope = changed.length > 0 && changed.length <= 5;
  for (const name of changed) {
    try {
      if (!approved.has(key(normalizeLaoPatchPath(name)))) pathsInScope = false;
    } catch { pathsInScope = false; }
  }
  const syntaxChecks: LaoStaticSyntaxCheck[] = [];
  // Parse only if the original result is intact. Do not process untrusted
  // files outside the permitted, bounded worktree scope.
  if (headMatches && fingerprintMatches && pathsInScope) {
    for (const name of changed) {
      let path = workspace.root;
      for (const part of name.split("/")) {
        path = join(path, part);
        const entry = await lstat(path).catch((error: NodeJS.ErrnoException) =>
          error.code === "ENOENT" ? null : Promise.reject(error));
        if (entry?.isSymbolicLink()) throw new Error("Symlink in verified worktree path");
        if (!entry) break;
      }
      const entry = await lstat(path).catch((error: NodeJS.ErrnoException) =>
        error.code === "ENOENT" ? null : Promise.reject(error));
      if (!entry) {
        syntaxChecks.push({ path: name, outcome: "skipped", errors: 0 });
        continue;
      }
      if (!entry.isFile() || entry.size > 64 * 1024) {
        throw new Error("Static verifier file budget exceeded");
      }
      const extension = name.toLowerCase().match(/\.[a-z]+$/)?.[0];
      if (![".ts", ".tsx", ".js", ".jsx", ".mjs", ".cjs", ".json"].includes(extension ?? "")) {
        syntaxChecks.push({ path: name, outcome: "skipped", errors: 0 });
        continue;
      }
      const source = await readFile(path, "utf8");
      let errors = 0;
      if (extension === ".json") {
        try { JSON.parse(source); } catch { errors = 1; }
      } else {
        const result = ts.transpileModule(source, {
          fileName: name,
          reportDiagnostics: true,
          compilerOptions: {
            target: ts.ScriptTarget.ES2022,
            module: ts.ModuleKind.ESNext,
            jsx: ts.JsxEmit.ReactJSX,
          },
        });
        errors = (result.diagnostics ?? []).filter(d => d.category === ts.DiagnosticCategory.Error).length;
      }
      syntaxChecks.push({ path: name, outcome: errors ? "failed" : "passed", errors });
    }
  }
  const whitespaceClean = current.whitespaceClean;
  const staticChecksPassed = headMatches && fingerprintMatches && pathsInScope &&
    whitespaceClean && syntaxChecks.every(check => check.outcome !== "failed");
  return {
    taskId: task.id, workspaceId: workspace.id, runId: stored.runId,
    fingerprintMatches, headMatches, pathsInScope, whitespaceClean,
    syntaxChecks, staticChecksPassed, testsExecuted: false, criteriaVerified: false,
  };
}

import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { existsSync, mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { realpath } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import type { McpRegistrationTarget } from "../mcp-modern-server.js";
import type { Workspace, WorkspaceContext, WorkspaceRegistry } from "../workspaces.js";
import { loadLaoConfig } from "./config.js";
import { registerLaoMcpTools } from "./mcp-tools.js";
import { LaoTaskStore } from "./task-store.js";
import { normalizeLaoModelPatch } from "./write-task-runner.js";

const git = (root: string, ...args: string[]) =>
  execFileSync("git", ["-C", root, ...args], { encoding: "utf8", windowsHide: true }).trim();
const goodPatch = "*** Begin Patch\n*** Add File: src/feature.ts\n+export const feature = true;\n*** End Patch";

test("MCP supervisor prepares isolated worktree, runs model patch, persists diff and denies approval", async () => {
  const base = await realpath(mkdtempSync(join(tmpdir(), "lao-write-mcp-")));
  const repo = join(base, "source");
  const managed = join(base, "managed");
  const stateDir = join(base, "state");
  mkdirSync(repo); mkdirSync(managed);
  const registrations = new Map<string, (args: any, extra?: any) => Promise<any>>();
  const registerTool = (name: string, _def: unknown, callback: (args: any, extra?: any) => Promise<any>) => {
    registrations.set(name, callback);
  };
  const invoke = async (name: string, args: Record<string, unknown>) => {
    const handler = registrations.get(name);
    assert.ok(handler, "Tool not registered: " + name);
    return handler(args);
  };
  let currentPatch = goodPatch;
  let calls = 0;
  let created = 0;
  const worktrees: string[] = [];
  try {
    git(repo, "init", "-b", "feature/test-isolated");
    writeFileSync(join(repo, "README.md"), "Stable source\n");
    git(repo, "add", "README.md");
    git(repo, "-c", "user.name=LAO Test", "-c", "user.email=test@example.com", "commit", "-m", "base");
    const source = { id: "ws_source", root: repo, canonicalRoot: await realpath(repo),
      mode: "checkout" } as Workspace;
    const entries = new Map<string, Workspace>([[source.id, source]]);
    const workspaces = {
      getWorkspace: async (id: string) => {
        const item = entries.get(id);
        if (!item) throw new Error("Unauthorized workspace");
        return item;
      },
      openWorkspace: async (input: { path: string; mode: string }) => {
        assert.equal(input.path, repo);
        assert.equal(input.mode, "worktree");
        const path = join(managed, "task-" + ++created);
        git(repo, "worktree", "add", "--detach", path, "HEAD");
        worktrees.push(path);
        const workspace = {
          id: "ws_managed_" + created, root: path, canonicalRoot: await realpath(path),
          mode: "worktree", sourceRoot: repo,
          worktree: { path, baseRef: "HEAD", baseSha: git(path, "rev-parse", "HEAD"),
            dirtySource: false, detached: true, managed: true },
        } as Workspace;
        entries.set(workspace.id, workspace);
        return { workspace } as WorkspaceContext;
      },
    } as Pick<WorkspaceRegistry, "getWorkspace" | "openWorkspace">;
    registerLaoMcpTools({ registerTool } as unknown as Pick<McpRegistrationTarget, "registerTool">,
      loadLaoConfig({ DEVSPACE_LAO_ENABLED: "true" }), {
        stateDir, worktreeRoot: managed, workspaces,
        ollama: {
          inspectModel: async name => ({ name, supportsTools: true, capabilities: ["tools"] }),
          chatReadOnly: async (prompt, options) => {
            calls++;
            assert.match(prompt, /UNTRUSTED_SNAPSHOTS_JSON/);
            assert.match(prompt, /src\/feature\.ts/);
            assert.equal(options?.maxOutputTokens, 1024);
            return currentPatch;
          },
        },
      });
    const prepare = (allowed_write_paths = ["src/feature.ts"]) => invoke("lao_write_prepare", {
      source_workspace_id: source.id, goal: "Add one safe feature flag",
      acceptance_criteria: ["Feature flag is true"], allowed_write_paths,
    });

    const invalid = await prepare(["../escape.ts"]);
    assert.equal(invalid.isError, true);
    assert.equal(created, 0, "invalid path must not create worktree");

    const prepared = await prepare();
    assert.equal(prepared.structuredContent.status, "created");
    assert.equal(prepared.structuredContent.shell_allowed, false);
    const workspaceId = prepared.structuredContent.workspace_id as string;
    const taskId = prepared.structuredContent.task_id as string;
    assert.equal((await invoke("lao_write_run", {
      workspace_id: "ws_source", task_id: taskId,
    })).isError, true, "source workspace cannot run the write task");
    assert.equal((await invoke("lao_write_run", {
      workspace_id: workspaceId, task_id: taskId,
    })).structuredContent.status, "awaiting_review");
    assert.equal(calls, 1);
    assert.equal(existsSync(join(repo, "src", "feature.ts")), false);
    assert.equal(git(repo, "status", "--porcelain"), "");
    assert.equal(existsSync(join(worktrees[0], "src", "feature.ts")), true);

    assert.ok(registrations.has("lao_write_test"),
      "isolated suite tool must be present in authorized opt-in tool surface");
    const deniedSuite = await invoke("lao_write_test", {
      workspace_id: "ws_source", task_id: taskId,
      test_files: ["tests/smoke.test.mjs"],
    });
    assert.equal(deniedSuite.isError, true, "source checkout may not execute isolated suites");
    const validated = await invoke("lao_write_validate", {
      workspace_id: workspaceId, task_id: taskId,
    });
    assert.equal(validated.structuredContent.staticChecksPassed, true);
    assert.equal(validated.structuredContent.fingerprintMatches, true);
    assert.equal(validated.structuredContent.testsExecuted, false);
    assert.equal(validated.structuredContent.criteriaVerified, false);
    assert.deepEqual(validated.structuredContent.syntaxChecks, [
      { path: "src/feature.ts", outcome: "passed", errors: 0 },
    ]);
    writeFileSync(join(worktrees[0], "src", "feature.ts"), "export const feature = false;\n");
    const tampered = await invoke("lao_write_validate", {
      workspace_id: workspaceId, task_id: taskId,
    });
    assert.equal(tampered.structuredContent.staticChecksPassed, false);
    assert.equal(tampered.structuredContent.fingerprintMatches, false);
    writeFileSync(join(worktrees[0], "src", "feature.ts"), "export const feature = true;\n");
    const assessed = await invoke("lao_write_assess", {
      workspace_id: workspaceId, task_id: taskId,
    });
    assert.equal(assessed.structuredContent.allCriteriaVerified, false);
    assert.equal(assessed.structuredContent.criteria[0].status, "unverified",
      "natural language must not be treated as passed");
    assert.equal(assessed.structuredContent.approvalAllowed, false);
    const reviewed = await invoke("lao_result", { workspace_id: workspaceId, task_id: taskId });
    assert.equal(reviewed.structuredContent.runs.length, 1);
    assert.equal(reviewed.structuredContent.runs[0].toolCalls, 1);
    assert.equal(reviewed.structuredContent.write_evidence.length, 1);
    assert.match(reviewed.structuredContent.write_evidence[0].applied.patch, /feature = true/);
    assert.equal(reviewed.structuredContent.write_evidence[0].evidence.testsVerified, false);
    assert.equal(reviewed.structuredContent.write_evidence[0].evidence.criteriaVerified, false);
    const deniedApproval = await invoke("lao_review", {
      workspace_id: workspaceId, task_id: taskId, decision: "approved",
      criteria_verified: true, evidence: ["Manual code review"], note: "Looks good",
    });
    assert.equal(deniedApproval.isError, true, "write approval remains disabled pending verified tests");
    const db = new LaoTaskStore(stateDir);
    try {
      assert.equal(db.getWriteEvidence(taskId).length, 1);
      assert.equal(db.get(taskId)?.status, "awaiting_review");
      const runEvidence = db.getWriteEvidence(taskId)[0]!;
      const lease = db.acquireTestLease(taskId);
      db.recordTestEvidence({
        taskId, runId: runEvidence.runId,
        suiteId: "node-test", testFiles: ["tests/smoke.test.mjs"],
        image: "node@sha256:" + "a".repeat(64),
        at: new Date().toISOString(), executed: false, passed: false,
        exitCode: null, failureCode: "sandbox_unavailable",
        stdoutSha256: null, stderrSha256: null, integrityMaintained: true,
        contentFingerprint: runEvidence.evidence.contentFingerprint,
        criteriaVerified: false, approvalAllowed: false,
      }, lease);
      assert.equal(db.releaseTestLease(taskId, lease), true);
      assert.throws(() =>
        db.recordTestEvidence(db.getTestEvidence(taskId)[0]!, lease), /Invalid/,
        "a released lease cannot record additional unverified evidence");
      assert.equal(db.getTestEvidence(taskId).length, 1);
      assert.equal(db.getTestEvidence(taskId)[0]?.criteriaVerified, false);
      assert.equal(db.get(taskId)?.status, "awaiting_review");
    } finally { db.close(); }
    const reopened = new LaoTaskStore(stateDir);
    try {
      assert.equal(reopened.getTestEvidence(taskId).length, 1);
      assert.equal(reopened.getTestEvidence(taskId)[0]?.failureCode, "sandbox_unavailable");
    } finally { reopened.close(); }

    const corrections = await invoke("lao_review", {
      workspace_id: workspaceId, task_id: taskId, decision: "needs_revision",
      criteria_verified: false, evidence: ["Flag must be false"], note: "Change flag value",
    });
    assert.equal(corrections.structuredContent.task.status, "needs_revision");
    currentPatch = "*** Begin Patch\n*** Update File: src/feature.ts\n@@\n-export const feature = true;\n+export const feature = false;\n*** End Patch";
    writeFileSync(join(worktrees[0], "src", "feature.ts"), "export const feature = 42;\n");
    const unreviewedChange = await invoke("lao_write_retry", {
      workspace_id: workspaceId, task_id: taskId,
    });
    assert.equal(unreviewedChange.isError, true,
      "manual changes inside the allowlist must not be adopted into the retry");
    const interrupted = new LaoTaskStore(stateDir);
    try { assert.equal(interrupted.get(taskId)?.status, "needs_revision"); }
    finally { interrupted.close(); }
    writeFileSync(join(worktrees[0], "src", "feature.ts"), "export const feature = true;\n");
    const firstCorrection = await invoke("lao_write_retry", {
      workspace_id: workspaceId, task_id: taskId,
    });
    assert.equal(firstCorrection.structuredContent.status, "awaiting_review");
    assert.equal(firstCorrection.structuredContent.revision_count, 1);
    assert.match(firstCorrection.structuredContent.patch, /feature = false/);
    assert.equal((await invoke("lao_write_validate", {
      workspace_id: workspaceId, task_id: taskId,
    })).structuredContent.staticChecksPassed, true);
    assert.equal(existsSync(join(repo, "src", "feature.ts")), false);
    assert.equal(git(repo, "status", "--porcelain"), "");

    await invoke("lao_review", {
      workspace_id: workspaceId, task_id: taskId, decision: "needs_revision",
      criteria_verified: false, evidence: ["Flag must be restored"], note: "Return flag to true",
    });
    currentPatch = "*** Begin Patch\n*** Update File: src/feature.ts\n@@\n-export const feature = false;\n+export const feature = true;\n*** End Patch";
    const secondCorrection = await invoke("lao_write_retry", {
      workspace_id: workspaceId, task_id: taskId,
    });
    assert.equal(secondCorrection.structuredContent.status, "awaiting_review");
    assert.equal(secondCorrection.structuredContent.revision_count, 2);
    await invoke("lao_review", {
      workspace_id: workspaceId, task_id: taskId, decision: "needs_revision",
      criteria_verified: false, evidence: ["Third attempt denied"], note: "No budget",
    });
    assert.equal((await invoke("lao_write_retry", {
      workspace_id: workspaceId, task_id: taskId,
    })).isError, true, "writes must not exceed two supervisor-authorized retries");
    const afterCorrections = new LaoTaskStore(stateDir);
    try {
      assert.equal(afterCorrections.getWriteEvidence(taskId).length, 3);
      assert.equal(afterCorrections.getRuns(taskId).length, 3);
      assert.equal(afterCorrections.get(taskId)?.revisionCount, 2);
    } finally { afterCorrections.close(); }
    assert.equal(git(repo, "status", "--porcelain"), "");

    currentPatch = "*** Begin Patch\n*** Add File: src/forbidden.ts\n+unsafe\n*** End Patch";
    const second = await prepare();
    const unsafe = await invoke("lao_write_run", {
      workspace_id: second.structuredContent.workspace_id,
      task_id: second.structuredContent.task_id,
    });
    assert.equal(unsafe.structuredContent.status, "failed");
    assert.equal(existsSync(join(worktrees[1], "src", "forbidden.ts")), false);
    assert.equal(git(repo, "status", "--porcelain"), "");
    const third = await prepare();
    writeFileSync(join(worktrees[2], "README.md"), "User-edited unrelated file\n");
    currentPatch = goodPatch;
    const dirty = await invoke("lao_write_run", {
      workspace_id: third.structuredContent.workspace_id,
      task_id: third.structuredContent.task_id,
    });
    assert.equal(dirty.structuredContent.status, "failed");
    assert.equal(existsSync(join(worktrees[2], "src", "feature.ts")), false);
    assert.equal(git(repo, "status", "--porcelain"), "");

    const fourth = await prepare();
    currentPatch = "*** Begin Patch\n*** Add File: src/feature.ts\n+export const feature = ;\n*** End Patch";
    const malformed = await invoke("lao_write_run", {
      workspace_id: fourth.structuredContent.workspace_id,
      task_id: fourth.structuredContent.task_id,
    });
    assert.equal(malformed.structuredContent.status, "awaiting_review");
    const badSyntax = await invoke("lao_write_validate", {
      workspace_id: fourth.structuredContent.workspace_id,
      task_id: fourth.structuredContent.task_id,
    });
    assert.equal(badSyntax.structuredContent.fingerprintMatches, true);
    assert.equal(badSyntax.structuredContent.staticChecksPassed, false);
    assert.equal(badSyntax.structuredContent.syntaxChecks[0].outcome, "failed");
    git(repo, "branch", "-m", "main");
    const stableBlocked = await prepare();
    assert.equal(stableBlocked.isError, true, "main checkout must not be accepted as a source");
    assert.equal(created, 4);
  } finally {
    for (const path of worktrees) {
      try { git(repo, "worktree", "remove", "--force", path); } catch { /* local test cleanup */ }
    }
    rmSync(base, { recursive: true, force: true });
  }
});

test("only a single bare Add File body is normalized; malformed multi-action/code fences remain rejected", () => {
  const bare = "*** Begin Patch\n*** Add File: src/a.ts\nexport const value = true;\n*** End Patch";
  const fixed = normalizeLaoModelPatch(bare);
  assert.equal(fixed.normalized, true);
  assert.equal(fixed.patch, "*** Begin Patch\n*** Add File: src/a.ts\n+export const value = true;\n*** End Patch");
  assert.deepEqual(normalizeLaoModelPatch(goodPatch), { patch: goodPatch, normalized: false });
  const fenced = "*** Begin Patch\n```\nsrc/a.ts\nvalue\n```\n*** End Patch";
  assert.equal(normalizeLaoModelPatch(fenced).normalized, false);
  const extra = "*** Begin Patch\n*** Add File: src/a.ts\nhello\n*** Add File: src/b.ts\nworld\n*** End Patch";
  assert.equal(normalizeLaoModelPatch(extra).normalized, false);
});

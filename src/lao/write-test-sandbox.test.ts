import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { realpath } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import type { LaoTask } from "./contracts.js";
import { collectLaoReviewEvidence } from "./review-evidence.js";
import { runLaoSandboxTests, type LaoSandboxInvoke } from "./write-test-sandbox.js";

const git = (dir: string, ...args: string[]) =>
  execFileSync("git", ["-C", dir, ...args], { encoding: "utf8", windowsHide: true }).trim();
const image = "node@sha256:" + "a".repeat(64);
test("sandbox runner enforces digest, clean tracked tests and Docker isolation without host execution", async () => {
  const base = await realpath(mkdtempSync(join(tmpdir(), "lao-test-sandbox-")));
  const repo = join(base, "repo");
  const managed = join(base, "managed");
  const wt = join(managed, "task");
  mkdirSync(repo); mkdirSync(managed);
  try {
    git(repo, "init", "-b", "feature/test");
    mkdirSync(join(repo, "tests"));
    writeFileSync(join(repo, "tests", "feature.test.mjs"),
      "import test from 'node:test'; test('smoke', () => {});\n");
    writeFileSync(join(repo, "README.md"), "source unchanged\n");
    git(repo, "add", ".");
    git(repo, "-c", "user.name=LAO Test", "-c", "user.email=test@example.com",
      "commit", "-m", "base");
    git(repo, "worktree", "add", "--detach", wt, "HEAD");
    mkdirSync(join(wt, "src"));
    writeFileSync(join(wt, "src", "feature.js"), "export const feature = true;\n");
    const workspace = {
      id: "ws_managed", root: wt, canonicalRoot: await realpath(wt),
      mode: "worktree" as const, sourceRoot: repo,
      worktree: { path: wt, managed: true, detached: true, dirtySource: false,
        baseRef: "HEAD", baseSha: git(wt, "rev-parse", "HEAD") },
    };
    const task = {
      id: "test-write", workspaceId: workspace.id, status: "awaiting_review",
      permissions: { read: true, write: "isolated_worktree", shell: "none",
        allowedWritePaths: ["src/feature.js"] },
    } as LaoTask;
    const evidence = await collectLaoReviewEvidence(task, workspace, managed);
    const stored = { taskId: task.id, runId: "run-test", evidence };
    let calls = 0;
    const success: LaoSandboxInvoke = async (args, timeout) => {
      calls++;
      assert.equal(timeout, 60_000);
      assert.ok(args.includes("--network=none"));
      assert.ok(args.includes("--read-only"));
      assert.ok(args.includes("--cap-drop=ALL"));
      assert.ok(args.includes("--pull=never"));
      assert.ok(args.includes("--security-opt=no-new-privileges"));
      assert.ok(args.includes("--user=65534:65534"));
      assert.ok(args.includes("--entrypoint=node"));
      assert.ok(args.includes(image));
      assert.ok(args.includes("/workspace/tests/feature.test.mjs"));
      assert.ok(args.some(a => a.includes("target=/workspace,readonly")));
      assert.equal(args.includes("sh"), false);
      return { exitCode: 0, stdout: "ok\n", stderr: "" };
    };
    const result = await runLaoSandboxTests(
      task, workspace, managed, stored, ["tests/feature.test.mjs"], image, success);
    assert.equal(result.passed, true);
    assert.equal(result.executed, true);
    assert.equal(result.criteriaVerified, false);
    assert.equal(result.approvalAllowed, false);
    assert.equal(result.integrityMaintained, true);
    assert.match(result.stdoutSha256!, /^[a-f0-9]{64}$/);
    assert.equal(calls, 1);
    assert.equal(git(repo, "status", "--porcelain"), "");

    const suiteFailure = await runLaoSandboxTests(
      task, workspace, managed, stored, ["tests/feature.test.mjs"], image,
      async () => ({ exitCode: 1, stdout: "failure\n", stderr: "" }));
    assert.equal(suiteFailure.passed, false);
    assert.equal(suiteFailure.failureCode, "suite_failed");
    const unavailable = await runLaoSandboxTests(
      task, workspace, managed, stored, ["tests/feature.test.mjs"], image,
      async () => ({ exitCode: 125, stdout: "", stderr: "daemon down",
        failureCode: "sandbox_unavailable" }));
    assert.equal(unavailable.executed, false);
    assert.equal(unavailable.failureCode, "sandbox_unavailable");

    const tamper = await runLaoSandboxTests(
      task, workspace, managed, stored, ["tests/feature.test.mjs"], image,
      async () => {
        writeFileSync(join(wt, "src", "feature.js"), "export const feature = false;\n");
        return { exitCode: 0, stdout: "ok", stderr: "" };
      });
    assert.equal(tamper.passed, false);
    assert.equal(tamper.failureCode, "integrity_changed");
    writeFileSync(join(wt, "src", "feature.js"), "export const feature = true;\n");

    await assert.rejects(runLaoSandboxTests(
      task, workspace, managed, stored, ["tests/feature.test.mjs"], "node:22", success),
      /pinned image/);
    await assert.rejects(runLaoSandboxTests(
      task, workspace, managed, stored, ["../outside.test.mjs"], image, success),
      /not allowed/);
    writeFileSync(join(wt, "tests", "feature.test.mjs"), "throw new Error('changed');\n");
    await assert.rejects(runLaoSandboxTests(
      task, workspace, managed, stored, ["tests/feature.test.mjs"], image, success),
      /baseline|Static integrity/);
    assert.equal(calls, 1, "untrusted inputs must never launch a container");
  } finally {
    try { git(repo, "worktree", "remove", "--force", wt); } catch { /* disposable */ }
    rmSync(base, { recursive: true, force: true });
  }
});

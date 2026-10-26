#!/usr/bin/env node
// Opt-in Docker smoke against a disposable Git worktree; not part of offline CI.
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { execFileSync } from "node:child_process";
import { mkdtempSync, mkdirSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { collectLaoReviewEvidence } from "../../dist/lao/review-evidence.js";
import { runLaoSandboxTests } from "../../dist/lao/write-test-sandbox.js";

const image = process.env.LAO_SANDBOX_NODE_IMAGE;
if (!image) throw new Error("Set LAO_SANDBOX_NODE_IMAGE to a local digest before running");
const git = (root, ...args) => execFileSync("git", ["-C", root, ...args], {
  windowsHide: true, encoding: "utf8", timeout: 10_000,
}).trim();
const base = realpathSync(mkdtempSync(join(tmpdir(), "lao-live-sandbox-")));
const repo = join(base, "source");
const managed = join(base, "managed");
const wt = join(managed, "one");
mkdirSync(repo);
mkdirSync(managed);
try {
  git(repo, "init", "-b", "feature/isolated-smoke");
  mkdirSync(join(repo, "src"));
  mkdirSync(join(repo, "tests"));
  writeFileSync(join(repo, "src", "value.mjs"), "export const value = 0;\n");
  writeFileSync(join(repo, "tests", "value.test.mjs"), [
    'import test from "node:test";',
    'import assert from "node:assert/strict";',
    'import { value } from "../src/value.mjs";',
    'test("patched value", () => assert.equal(value, 1));',
    "",
  ].join("\n"));
  writeFileSync(join(repo, "tests", "readonly.test.mjs"), [
    'import test from "node:test";',
    'import assert from "node:assert/strict";',
    'import { writeFileSync } from "node:fs";',
    'test("worktree is readonly", () => assert.throws(() =>',
    '  writeFileSync("/workspace/src/value.mjs", "unauthorized"),',
    '  (err) => err.code === "EROFS" || err.code === "EACCES"));',
    "",
  ].join("\n"));
  writeFileSync(join(repo, "tests", "network.test.mjs"), [
    'import test from "node:test";',
    'import assert from "node:assert/strict";',
    'import { networkInterfaces } from "node:os";',
    'test("no external network interfaces", () =>',
    '  assert.ok(Object.values(networkInterfaces()).flat().every(i => i.internal)));',
    "",
  ].join("\n"));
  writeFileSync(join(repo, "tests", "failure.test.mjs"), [
    'import test from "node:test";',
    'import assert from "node:assert/strict";',
    'test("intentional failure", () => assert.equal(1, 2));',
    "",
  ].join("\n"));
  git(repo, "add", ".");
  git(repo, "-c", "user.name=LAO Smoke", "-c", "user.email=lao-smoke@example.invalid",
    "commit", "-m", "baseline");
  git(repo, "worktree", "add", "--detach", wt, "HEAD");
  writeFileSync(join(wt, "src", "value.mjs"), "export const value = 1;\n");
  const workspace = {
    id: "ws_sandbox_smoke", root: wt, canonicalRoot: realpathSync(wt),
    mode: "worktree", sourceRoot: repo,
    worktree: { path: wt, managed: true, detached: true, dirtySource: false,
      baseRef: "HEAD", baseSha: git(wt, "rev-parse", "HEAD") },
  };
  const task = {
    id: randomUUID(), workspaceId: workspace.id, status: "awaiting_review",
    permissions: { read: true, write: "isolated_worktree", shell: "none",
      allowedWritePaths: ["src/value.mjs"] },
  };
  const evidence = await collectLaoReviewEvidence(task, workspace, managed);
  const stored = { taskId: task.id, runId: randomUUID(), evidence };
  const good = await runLaoSandboxTests(task, workspace, managed, stored, [
    "tests/value.test.mjs", "tests/readonly.test.mjs", "tests/network.test.mjs",
  ], image);
  assert.equal(good.passed, true, "Docker success, no-write and network test must pass");
  assert.equal(good.criteriaVerified, false);
  assert.equal(good.approvalAllowed, false);
  const bad = await runLaoSandboxTests(task, workspace, managed, stored, [
    "tests/failure.test.mjs",
  ], image);
  assert.equal(bad.passed, false);
  assert.equal(bad.failureCode, "suite_failed");
  const unavailable = await runLaoSandboxTests(task, workspace, managed, stored, [
    "tests/value.test.mjs",
  ], "node@sha256:" + "0".repeat(64));
  assert.equal(unavailable.passed, false);
  assert.equal(unavailable.failureCode, "sandbox_unavailable", "missing image must not be pulled");
  assert.equal(unavailable.executed, false);
  const interrupted = new AbortController();
  interrupted.abort();
  const cancelled = await runLaoSandboxTests(task, workspace, managed, stored, [
    "tests/value.test.mjs",
  ], image, undefined, interrupted.signal);
  assert.equal(cancelled.passed, false);
  assert.equal(cancelled.failureCode, "timeout");
  assert.equal(git(repo, "status", "--porcelain"), "");
  console.log(JSON.stringify({
    mode: "docker-live-isolated", image, success: good.passed,
    negativeFailureCode: bad.failureCode,
    missingImageCode: unavailable.failureCode,
    cancellationCode: cancelled.failureCode,
    readonlyMountVerified: true, networkDisabledVerified: true,
    noSourceCheckoutChanges: true, criteriaVerified: false, approvalAllowed: false,
  }, null, 2));
} finally {
  try { git(repo, "worktree", "remove", "--force", wt); } catch {}
  rmSync(base, { recursive: true, force: true });
}

import { createHash, randomUUID } from "node:crypto";
import { execFile } from "node:child_process";
import { lstat, realpath } from "node:fs/promises";
import { join, resolve, sep } from "node:path";
import { promisify } from "node:util";
import type { Workspace } from "../workspaces.js";
import type { LaoTask } from "./contracts.js";
import type { LaoStoredWriteEvidence } from "./task-store.js";
import { validateLaoStaticWrite } from "./write-validation.js";
import { normalizeLaoPatchPath } from "./worktree-patch.js";

const execFileAsync = promisify(execFile);
export interface LaoSandboxTestEvidence {
  taskId: string; runId: string; suiteId: "node-test"; testFiles: string[]; image: string;
  at: string; executed: boolean; passed: boolean; exitCode: number | null;
  failureCode: "none" | "sandbox_unavailable" | "suite_failed" | "timeout" | "integrity_changed";
  stdoutSha256: string | null; stderrSha256: string | null;
  integrityMaintained: boolean; contentFingerprint: string;
  criteriaVerified: false; approvalAllowed: false;
}
export interface LaoSandboxProcessResult {
  exitCode: number | null; stdout: string; stderr: string;
  failureCode?: "sandbox_unavailable" | "timeout";
}
export type LaoSandboxInvoke = (args: readonly string[], timeoutMs: number, signal?: AbortSignal) =>
  Promise<LaoSandboxProcessResult>;

/** Never fall back to running node, npm, pnpm or shell on the host. */
export async function invokeLaoDocker(
  args: readonly string[], timeoutMs: number, signal?: AbortSignal,
): Promise<LaoSandboxProcessResult> {
  try {
    const localHost = process.platform === "win32" ? "npipe:////./pipe/dockerDesktopLinuxEngine" : "unix:///var/run/docker.sock";
    const { stdout, stderr } = await execFileAsync("docker", ["--host", localHost, ...args], {
      timeout: timeoutMs, signal, maxBuffer: 64 * 1024, windowsHide: true, encoding: "utf8",
      env: { PATH: process.env.PATH, SystemRoot: process.env.SystemRoot,
        HOME: process.env.HOME, USERPROFILE: process.env.USERPROFILE },
    });
    return { stdout, stderr, exitCode: 0 };
  } catch (error) {
    const e = error as Error & { code?: number | string; killed?: boolean; stdout?: string; stderr?: string };
    return {
      exitCode: typeof e.code === "number" ? e.code : null,
      stdout: e.stdout ?? "", stderr: e.stderr ?? "",
      failureCode: e.killed || signal?.aborted ? "timeout" :
        typeof e.code === "number" && ![125, 126, 127].includes(e.code) ? undefined : "sandbox_unavailable",
    };
  }
}
async function inspectTrustedTest(root: string, name: string): Promise<string> {
  if (normalizeLaoPatchPath(name) !== name ||
      !/(?:^|\/)[a-z0-9_.-]+\.test\.(?:mjs|js)$/i.test(name) ||
      name.split("/").some(p => p.startsWith("."))) throw new Error("Invalid baseline test path");
  let p = root;
  for (const part of name.split("/")) {
    p = join(p, part);
    if ((await lstat(p)).isSymbolicLink()) throw new Error("Symlink test path");
  }
  if (!(await lstat(p)).isFile() || (await lstat(p)).size > 64 * 1024 ||
      !(await realpath(p)).startsWith(resolve(root) + sep)) throw new Error("Unsafe test file");
  await execFileAsync("git", ["-C", root, "ls-files", "--error-unmatch", "--", name], {
    timeout: 5000, windowsHide: true, maxBuffer: 4096,
  });
  try {
    await execFileAsync("git", ["-C", root, "diff", "--quiet", "HEAD", "--", name], {
      timeout: 5000, windowsHide: true, maxBuffer: 4096,
    });
  } catch { throw new Error("Test file was changed from baseline"); }
  return "/workspace/" + name;
}
/**
 * Only host-authorized baseline node:test scripts run in a bounded offline
 * Docker container, never with model-selected commands. No test result can
 * approve a task or declare acceptance criteria verified.
 */
export async function runLaoSandboxTests(
  task: LaoTask,
  workspace: Pick<Workspace, "id" | "root" | "canonicalRoot" | "mode" | "sourceRoot" | "worktree">,
  worktreeRoot: string,
  stored: Pick<LaoStoredWriteEvidence, "taskId" | "runId" | "evidence">,
  testFiles: string[], image: string | undefined,
  invoke: LaoSandboxInvoke = invokeLaoDocker, signal?: AbortSignal,
): Promise<LaoSandboxTestEvidence> {
  if (!image || !/^[a-z0-9][a-z0-9._/:+-]*@sha256:[a-f0-9]{64}$/.test(image)) {
    throw new Error("Trusted SHA-256 pinned image required; no image pulls");
  }
  if (!testFiles.length || testFiles.length > 5 || new Set(testFiles).size !== testFiles.length)
    throw new Error("Choose 1-5 unique baseline tests");
  const before = await validateLaoStaticWrite(task, workspace, worktreeRoot, stored);
  if (!before.staticChecksPassed) throw new Error("Static integrity verification failed");
  const root = await realpath(workspace.root);
  if (root !== await realpath(workspace.canonicalRoot) || /[,\n]/.test(root))
    throw new Error("Invalid canonical worktree bind mount");
  const tests: string[] = [];
  for (const name of testFiles) tests.push(await inspectTrustedTest(root, name));
  const container = "lao-test-" + randomUUID();
  const args = [
    "run", "--rm", "--name", container, "--pull=never", "--network=none",
    "--read-only", "--cap-drop=ALL", "--security-opt=no-new-privileges",
    "--pids-limit=64", "--memory=512m", "--memory-swap=512m", "--cpus=1",
    "--user=65534:65534", "--workdir=/workspace",
    "--tmpfs=/tmp:rw,nosuid,nodev,size=32m", "--env=HOME=/tmp", "--env=NODE_ENV=test",
    "--mount", "type=bind,source=" + root + ",target=/workspace,readonly",
    "--entrypoint=node", image, "--test", "--test-reporter=tap", ...tests,
  ];
  let result: LaoSandboxProcessResult = {
    exitCode: null, stdout: "", stderr: "", failureCode: "sandbox_unavailable",
  };
  try { result = await invoke(args, 60_000, signal); }
  catch { /* Fail closed: no host-side retry. */ }
  finally {
    if (invoke === invokeLaoDocker) {
      await invokeLaoDocker(["rm", "--force", container], 5000).catch(() => undefined);
    }
  }
  const after = await validateLaoStaticWrite(task, workspace, worktreeRoot, stored);
  const integrityMaintained = after.staticChecksPassed &&
    before.fingerprintMatches && after.fingerprintMatches;
  const failureCode = !integrityMaintained ? "integrity_changed" :
    result.failureCode ?? (result.exitCode === 0 ? "none" :
      result.exitCode === null ? "sandbox_unavailable" : "suite_failed");
  const executed = result.exitCode !== null && !result.failureCode;
  return {
    taskId: task.id, runId: stored.runId, suiteId: "node-test", testFiles: [...testFiles],
    image, at: new Date().toISOString(), executed,
    passed: executed && result.exitCode === 0 && failureCode === "none",
    exitCode: result.exitCode, failureCode,
    stdoutSha256: executed ? createHash("sha256").update(result.stdout).digest("hex") : null,
    stderrSha256: executed ? createHash("sha256").update(result.stderr).digest("hex") : null,
    integrityMaintained, contentFingerprint: stored.evidence.contentFingerprint,
    criteriaVerified: false, approvalAllowed: false,
  };
}

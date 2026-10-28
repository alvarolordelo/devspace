import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { verifyDevspacePin } from "./lao-verify-devspace-pin.mjs";

const git = (root, ...args) => execFileSync("git", ["-C", root, ...args],
  { encoding: "utf8", windowsHide: true }).trim();
const originalServer = [
  'import { getToolSurface } from "./tool-surfaces/index.js";',
  "function registerMcpSurface() {",
  "  registerAppTool(",
  "    registrationTarget,",
  '    "show_changes",',
  "  );",
  "}",
  "",
].join("\n");
const pinnedPackage = {
  name: "@waishnav/devspace", version: "1.0.8", packageManager: "pnpm@11.25.0",
  bin: { devspace: "bin/devspace.js" },
  dependencies: { "@example/sdk": "^1.0.0" },
};

test("pinned DevSpace core cannot be upgraded by LAO changes", async () => {
  const base = mkdtempSync(join(tmpdir(), "lao-pin-test-"));
  const project = join(base, "repo");
  mkdirSync(project);
  const write = (path, content) => {
    const full = join(project, path);
    mkdirSync(join(full, ".."), { recursive: true });
    writeFileSync(full, content);
  };
  try {
    git(project, "init");
    write("package.json", JSON.stringify(pinnedPackage, null, 2) + "\n");
    write("pnpm-lock.yaml", "lockfileVersion: '9.0'\n");
    write("pnpm-workspace.yaml", "allowBuilds: {}\n");
    write("src/server.ts", originalServer);
    write("src/unrelated-core.ts", "export const core = 1;\n");
    git(project, "add", ".");
    git(project, "-c", "user.name=LAO Test", "-c", "user.email=test@example.invalid",
      "commit", "-m", "DevSpace pinned base");
    const commit = git(project, "rev-parse", "HEAD");
    const pin = {
      schemaVersion: 1, version: "1.0.8", commit, packageManager: "pnpm@11.25.0",
      lockBlob: git(project, "rev-parse", commit + ":pnpm-lock.yaml"),
      workspaceBlob: git(project, "rev-parse", commit + ":pnpm-workspace.yaml"),
    };
    git(project, "checkout", "-b", "feature/lao");
    write("package.json", JSON.stringify({
      ...pinnedPackage, bin: { ...pinnedPackage.bin, "devspace-laod": "bin/devspace-laod.js" },
    }, null, 2) + "\n");
    write("src/server.ts", originalServer.replace(
      'import { getToolSurface } from "./tool-surfaces/index.js";',
      'import { getToolSurface } from "./tool-surfaces/index.js";\n' +
        'import { loadLaoConfig } from "./lao/config.js";\n' +
        'import { registerLaoMcpTools } from "./lao/mcp-tools.js";',
    ).replace('  registerAppTool(\n    registrationTarget,\n    "show_changes",',
      '  registerLaoMcpTools(registrationTarget, loadLaoConfig(), { stateDir: config.stateDir, workspaces, worktreeRoot: config.worktreeRoot });\n\n' +
      '  registerAppTool(\n    registrationTarget,\n    "show_changes",'));
    // Test the exact-overlay protection with a synthetic reviewed fixture.
    // A core change without a deliberate digest change must always fail.
    const reviewedServer = readFileSync(join(project, "src/server.ts"), "utf8")
      .replace('import { getToolSurface } from "./tool-surfaces/index.js";',
        'import { getToolSurface } from "./tool-surfaces/index.js";\n' +
        'const timeout = mcpHandlerTimeoutForRequest(parsedBody);')
      .replace('registerLaoMcpTools(registrationTarget, loadLaoConfig(), { stateDir: config.stateDir, workspaces, worktreeRoot: config.worktreeRoot });',
        'registerLaoMcpTools(registrationTarget, loadLaoConfig(), { stateDir: laoMcpStateDir(config), workspaces, worktreeRoot: config.worktreeRoot });');
    write("src/server.ts", reviewedServer);
    pin.approvedServerDigest = createHash("sha256")
      .update(reviewedServer.replace(/\r\n/g, "\n").trimEnd()).digest("hex");
    write("src/lao/feature.ts", "export const safe = true;\n");
    // Feature-side helpers used by the shipped LAO UI must not be confused
    // with upgrades of the fixed DevSpace engine.
    for (const name of ["build-lao-action-icons.ps1",
                        "authorize-lao-devspace.mjs",
                        "install-lao-shortcuts.ps1",
                        "launch-lao-daemon.ps1",
                        "launch-lao-monitor.cmd",
                        "launch-lao-monitor.ps1"]) {
      write("scripts/" + name, "# LAO-only launcher test fixture\n");
    }
    write("test/lao-recovery-safety.ps1", "# LAO-only recovery test fixture\n");
    git(project, "add", ".");
    git(project, "-c", "user.name=LAO Test", "-c", "user.email=test@example.invalid",
      "commit", "-m", "LAO feature only");
    assert.equal(verifyDevspacePin({ root: project, pin }).approved, true);
    assert.throws(() => verifyDevspacePin({ root: project, pin: { ...pin, commit: "0".repeat(40) } }),
      /Pinned DevSpace commit/);

    const corruptAndRestore = (file, corrupt, expression) => {
      const full = join(project, file);
      const original = readFileSync(full, "utf8");
      writeFileSync(full, corrupt);
      try { assert.throws(() => verifyDevspacePin({ root: project, pin }), expression); }
      finally { writeFileSync(full, original); }
      assert.equal(verifyDevspacePin({ root: project, pin }).approved, true);
    };
    corruptAndRestore("package.json", JSON.stringify({
      ...pinnedPackage, version: "1.0.9",
      bin: { ...pinnedPackage.bin, "devspace-laod": "bin/devspace-laod.js" },
    }), /package.json|dependency versions/);
    corruptAndRestore("package.json", JSON.stringify({
      ...pinnedPackage,
      bin: { ...pinnedPackage.bin, "devspace-laod": "bin/devspace-laod.js" },
      dependencies: { "@example/sdk": "^2.0.0" },
    }), /package.json|dependency versions/);
    corruptAndRestore("pnpm-lock.yaml", "lockfileVersion: '10.0'\n", /pnpm-lock.yaml/);
    corruptAndRestore("pnpm-workspace.yaml", "allowBuilds:\n  new-package: true\n", /pnpm-workspace.yaml/);
    corruptAndRestore("src/unrelated-core.ts", "export const core = 2;\n", /core change forbidden/);
    corruptAndRestore("src/server.ts", readFileSync(join(project, "src/server.ts"), "utf8") +
      "\nconsole.log('unreviewed core edit');\n", /server core differs/);
  } finally {
    rmSync(base, { recursive: true, force: true });
  }
});

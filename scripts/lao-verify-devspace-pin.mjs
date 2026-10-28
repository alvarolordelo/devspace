#!/usr/bin/env node
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join, resolve } from "node:path";

// Explicitly approved 2026-10-25 DevSpace integration baseline.
// Changing this constant is a deliberate base-upgrade event, never a side effect
// of an LAO update, pnpm install, or fetching from upstream/main.
export const APPROVED_DEVSPACE_COMMIT = "13c99eec5ed43eb9aba3fdc457bd912d3ce82211";
export const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");

function git(root, ...args) {
  return execFileSync("git", args, {
    cwd: root, encoding: "utf8", windowsHide: true, timeout: 10_000,
    maxBuffer: 3_000_000,
  }).trimEnd();
}
function equalData(a, b) { return JSON.stringify(a) === JSON.stringify(b); }

function expectedLaoServer(source) {
  const oldImport = 'import { getToolSurface } from "./tool-surfaces/index.js";';
  const addedImport = oldImport +
    '\nimport { loadLaoConfig } from "./lao/config.js";' +
    '\nimport { registerLaoMcpTools } from "./lao/mcp-tools.js";';
  const oldHook = '  registerAppTool(\n    registrationTarget,\n    "show_changes",';
  const addedHook = '  registerLaoMcpTools(registrationTarget, loadLaoConfig(), { stateDir: config.stateDir, workspaces, worktreeRoot: config.worktreeRoot });\n\n' + oldHook;
  if (!source.includes(oldImport) || !source.includes(oldHook)) {
    throw new Error("Pinned DevSpace core has unexpected server integration anchors");
  }
  return source.replace(oldImport, addedImport).replace(oldHook, addedHook);
}

/**
 * No automatic upstream update is permitted in a feature release.
 * A future explicit DevSpace upgrade must change both this pinned base and
 * the reviewed manifest, then re-run compatibility/regression checks.
 */
export function verifyDevspacePin({ root = repoRoot, pin } = {}) {
  const manifest = pin ?? JSON.parse(readFileSync(join(root,
    "docs/lao-devspace/DEVSPACE_VERSION_PIN.json"), "utf8"));
  if (manifest.schemaVersion !== 1) throw new Error("Unknown version pin manifest");
  if (!/^[a-f0-9]{40}$/.test(manifest.commit)) throw new Error("Invalid pinned Git SHA");
  if (!pin && manifest.commit !== APPROVED_DEVSPACE_COMMIT) {
    throw new Error("DevSpace version pin was changed without updating the explicit approval gate");
  }
  const base = manifest.commit;
  try {
    if (git(root, "merge-base", base, "HEAD") !== base) {
      throw new Error("Branch is not based on the fixed DevSpace revision");
    }
  } catch (err) {
    throw new Error("Pinned DevSpace commit missing or not an ancestor of HEAD: " +
      (err instanceof Error ? err.message : String(err)));
  }
  const show = file => git(root, "show", base + ":" + file);
  const current = file => readFileSync(join(root, file), "utf8").replace(/\r\n/g, "\n").trimEnd();
  const basePackage = JSON.parse(show("package.json"));
  const currentPackage = JSON.parse(current("package.json"));
  assert.equal(basePackage.version, manifest.version, "Pinned DevSpace version mismatch");
  assert.equal(basePackage.packageManager, manifest.packageManager, "Pinned package manager mismatch");
  assert.equal(manifest.packageManager, "pnpm@11.25.0", "Unexpected pnpm toolchain pin");
  assert.equal(manifest.lockBlob, git(root, "rev-parse", base + ":pnpm-lock.yaml"),
    "Manifest lock SHA mismatch");
  assert.equal(manifest.workspaceBlob, git(root, "rev-parse", base + ":pnpm-workspace.yaml"),
    "Manifest workspace SHA mismatch");

  // The only supported package.json delta adds LAO's optional daemon entry.
  // No dependency, npm script, package version, manager, engine or override
  // can change without an explicit DevSpace base-upgrade review.
  if (currentPackage.bin?.["devspace-laod"] !== "bin/devspace-laod.js") {
    throw new Error("LAO daemon binary entry is missing or changed");
  }
  delete currentPackage.bin["devspace-laod"];
  if (!equalData(currentPackage, basePackage)) {
    throw new Error("DevSpace package.json or dependency versions changed from the pinned baseline");
  }
  for (const file of ["pnpm-lock.yaml", "pnpm-workspace.yaml"]) {
    // Git hashes normalized content consistently on Windows (CRLF worktrees).
    if (git(root, "hash-object", file) !== git(root, "rev-parse", base + ":" + file)) {
      throw new Error(file + " differs from pinned DevSpace; dependency upgrades are forbidden");
    }
  }
  if (expectedLaoServer(show("src/server.ts")) !== current("src/server.ts")) {
    throw new Error("DevSpace server core differs from the approved LAO integration patch");
  }
  const changed = git(root, "diff", "--name-only", "--no-renames", base, "--")
    .split(/\r?\n/).filter(Boolean).map(x => x.replace(/\\/g, "/"));
  const exact = new Set([
    "package.json", "src/server.ts", "bin/devspace-laod.js",
    ".github/workflows/lao-feature-ci.yml",
    "scripts/lao-live-smoke.mjs", "scripts/lao-write-live-smoke.mjs",
    "scripts/lao-verify-devspace-pin.mjs",
    "scripts/lao-verify-devspace-pin.test.mjs",
    // Explicit LAO-only Windows launchers/assets tooling. Do not grant an
    // unrestricted scripts/ or scripts/lao-* exception to the pinned core.
    "scripts/build-lao-action-icons.ps1",
    "scripts/authorize-lao-devspace.mjs",
    "scripts/install-lao-shortcuts.ps1",
    "scripts/launch-lao-daemon.ps1",
    "scripts/launch-lao-monitor.cmd",
    "scripts/launch-lao-monitor.ps1",
    "test/lao-recovery-safety.ps1",
  ]);
  const forbidden = changed.filter(path => !exact.has(path) &&
    !path.startsWith("src/lao/") && !path.startsWith("docs/lao-devspace/"));
  if (forbidden.length) {
    throw new Error("DevSpace core change forbidden by version pin: " + forbidden.slice(0, 8).join(", "));
  }
  return { approved: true, commit: base, version: manifest.version,
    packageManager: manifest.packageManager, protectedPathsVerified: true,
    changedLaoPaths: changed.length };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const result = verifyDevspacePin();
    process.stdout.write("LAO DevSpace dependency pin verified: " +
      JSON.stringify(result) + "\n");
  } catch (err) {
    console.error("LAO DevSpace version pin FAILED: " +
      (err instanceof Error ? err.message : String(err)));
    process.exitCode = 1;
  }
}

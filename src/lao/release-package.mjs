#!/usr/bin/env node
/**
 * Produce a non-installing release candidate directory.
 * No SCM, registry, autostart, networking, or package installation.
 */
import { createHash } from "node:crypto";
import { cp, lstat, mkdir, readFile, realpath, readdir, stat, writeFile } from "node:fs/promises";
import { basename, dirname, isAbsolute, join, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

const project = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const input = process.argv.slice(2);
if (input.length !== 2 || input[0] !== "--out" || !isAbsolute(input[1])) {
  throw new Error("Usage: node src/lao/release-package.mjs --out <absolute-new-directory>");
}
const output = resolve(input[1]);
const canonicalProject = await realpath(project);
const within = (parent, child) => child === parent || child.startsWith(parent + sep);
if (within(canonicalProject, output) || within(output, canonicalProject) ||
    output === resolve(dirname(canonicalProject)) ||
    output === resolve(dirname(canonicalProject), "..")) {
  throw new Error("Release output must not contain or reside inside source checkout");
}
try {
  await lstat(output);
  throw new Error("Release output already exists; refusing overwrite");
} catch (error) {
  if (error.code !== "ENOENT") throw error;
}
const approved = [
  "bin/devspace-laod.js",
  "dist/lao",
  "package.json",
  "pnpm-lock.yaml",
  "pnpm-workspace.yaml",
  "docs/lao-devspace/DEVSPACE_VERSION_PIN.json",
  "docs/lao-devspace/DASHBOARD_MVP.md",
  "docs/lao-devspace/TRAY_MVP.md",
  "docs/lao-devspace/USO_EXPERIMENTAL.md",
  "docs/lao-devspace/PORTABLE_RELEASE.md",
  "src/lao/windows/lao-tray.ps1",
  "src/lao/windows/lao-popup.ps1",
  "src/lao/windows/lao-autostart.ps1",
  "src/lao/windows/lao-settings.ps1",
  "src/lao/windows/lao-service-plan.ps1",
  "scripts/launch-lao-monitor.ps1",
  "scripts/launch-lao-monitor.cmd",
  "scripts/launch-lao-daemon.ps1",
  "src/lao/release-verify.mjs",
  "src/lao/release-portable.mjs",
  "src/lao/release-standalone.mjs",
  "docs/lao-devspace/assets/icons/ico",
  "docs/lao-devspace/assets/icons/png",
  "docs/lao-devspace/assets/icons/actions",
];
const releaseFiles = [];
for (const entry of approved) {
  const source = resolve(project, entry);
  const actual = await realpath(source);
  if (!within(canonicalProject, actual)) throw new Error("Release source escapes checkout");
  if ((await lstat(source)).isSymbolicLink()) throw new Error("Symlink release source");
  const state = await stat(source);
  if (state.isDirectory()) {
    async function walk(dir) {
      for (const name of await readdir(dir)) {
        const path = join(dir, name);
        const meta = await lstat(path);
        if (meta.isSymbolicLink()) throw new Error("Symlink inside release tree");
        if (meta.isDirectory()) await walk(path);
        else if (meta.isFile()) releaseFiles.push(relative(project, path).replaceAll("\\", "/"));
        else throw new Error("Unsupported release entry");
      }
    }
    await walk(source);
  } else if (state.isFile()) releaseFiles.push(entry);
  else throw new Error("Unsupported source entry");
}
if (releaseFiles.length > 2500) throw new Error("Release file count exceeded");
const checked = [];
let total = 0;
for (const rel of releaseFiles) {
  const bytes = await readFile(join(project, rel));
  total += bytes.length;
  if (total > 120 * 1024 * 1024) throw new Error("Release exceeds 120 MB");
  checked.push({ path: rel, bytes: bytes.length,
    sha256: createHash("sha256").update(bytes).digest("hex") });
}
await mkdir(output, { recursive: false });
for (const record of checked) {
  const dest = join(output, record.path);
  await mkdir(dirname(dest), { recursive: true });
  await cp(join(project, record.path), dest, { errorOnExist: true, force: false });
}
const manifest = {
  schemaVersion: 1, kind: "lao-devspace-release-candidate",
  stableDevspaceVersion: "1.0.8",
  installed: false, serviceInstalled: false, autostartEnabled: false,
  nodeModulesIncluded: false, requiresOfflineFrozenDependencies: true,
  generatedAt: new Date().toISOString(),
  files: checked,
};
await writeFile(join(output, "RELEASE_MANIFEST.json"), JSON.stringify(manifest, null, 2) + "\n", { flag: "wx" });
console.log(JSON.stringify({
  kind: manifest.kind, output, files: checked.length, bytes: total,
  serviceInstalled: false, autostartEnabled: false,
}));

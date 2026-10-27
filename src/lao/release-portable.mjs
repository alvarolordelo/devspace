#!/usr/bin/env node
/**
 * Offline Windows/Linux/macOS-specific portable daemon candidate. Copies only
 * vetted runtime package versions already installed in this pinned checkout.
 * Never invokes npm/pnpm install, downloads, services, registry or autostart.
 */
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { cp, lstat, readFile, realpath, readdir, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { dirname, isAbsolute, join, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

const project = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const args = process.argv.slice(2);
if (args.length !== 2 || args[0] !== "--out" || !isAbsolute(args[1])) {
  throw new Error("Usage: node release-portable.mjs --out <absolute-new-directory>");
}
const output = resolve(args[1]);
const projectReal = await realpath(project);
const pnpmStore = await realpath(join(project, "node_modules", ".pnpm"));
const requireProject = createRequire(join(project, "package.json"));
const betterPackage = await realpath(requireProject.resolve("better-sqlite3/package.json"));
const zodPackage = await realpath(requireProject.resolve("zod/package.json"));
const bindingsPackage = await realpath(createRequire(betterPackage).resolve("bindings/package.json"));
const uriPackage = await realpath(createRequire(bindingsPackage).resolve("file-uri-to-path/package.json"));
const selected = [
  ["better-sqlite3", betterPackage, "12.10.0"],
  ["zod", zodPackage, "4.4.3"],
  ["bindings", bindingsPackage, "1.5.0"],
  ["file-uri-to-path", uriPackage, "1.0.0"],
];
const inside = (parent, child) => child.startsWith(parent + (process.platform === "win32" ? "\\" : "/"));
let countedFiles = 0;
let countedBytes = 0;
async function inspect(directory, packageRoot) {
  for (const name of await readdir(directory)) {
    const file = join(directory, name);
    // pnpm may leave workspace-only dev tool shims nested inside a package.
    // Runtime modules are copied as an explicit flat allowlist, never with
    // transitive node_modules, binaries or install-time executables.
    if (relative(packageRoot, file).split(sep).includes("node_modules")) continue;
    const entry = await lstat(file);
    if (entry.isSymbolicLink()) throw new Error("Runtime dependency contains a symlink");
    if (entry.isDirectory()) await inspect(file, packageRoot);
    else if (entry.isFile()) {
      countedFiles++;
      countedBytes += entry.size;
      if (countedFiles > 2400 || countedBytes > 100 * 1024 * 1024) {
        throw new Error("Runtime dependency package budget exceeded");
      }
    } else throw new Error("Unsupported runtime dependency entry");
  }
}
for (const [name, packageFile, expectedVersion] of selected) {
  const root = dirname(packageFile);
  if (!inside(pnpmStore, root) || !inside(projectReal, root)) {
    throw new Error("Runtime dependency escapes pinned pnpm store: " + name);
  }
  const actual = JSON.parse(await readFile(packageFile, "utf8"));
  if (actual.name !== name || actual.version !== expectedVersion) {
    throw new Error("Runtime dependency version drift: " + name);
  }
  await inspect(root, root);
}
// This also rejects outputs inside/containing the checkout and never overwrites.
execFileSync(process.execPath, [join(project, "src/lao/release-package.mjs"), "--out", output], {
  timeout: 30_000, windowsHide: true, stdio: "pipe",
});
const originalManifest = JSON.parse(await readFile(join(output, "RELEASE_MANIFEST.json"), "utf8"));
const records = originalManifest.files;
for (const [name, packageFile] of selected) {
  const source = dirname(packageFile);
  const dest = join(output, "node_modules", name);
  await cp(source, dest, {
    recursive: true, errorOnExist: true, force: false,
    filter: path => !relative(source, path).split(sep).includes("node_modules"),
  });
  async function inspectCopied(directory) {
    for (const entry of await readdir(directory)) {
      const path = join(directory, entry);
      const meta = await lstat(path);
      if (meta.isSymbolicLink()) throw new Error("Copied runtime dependency is a symlink");
      if (meta.isDirectory()) await inspectCopied(path);
      else if (meta.isFile()) {
        const bytes = await readFile(path);
        records.push({
          path: relative(output, path).replaceAll("\\", "/"),
          bytes: bytes.length,
          sha256: createHash("sha256").update(bytes).digest("hex"),
        });
      } else throw new Error("Unsupported copied runtime entry");
    }
  }
  await inspectCopied(dest);
}
const bytes = records.reduce((total, record) => total + record.bytes, 0);
if (records.length > 2500 || bytes > 120 * 1024 * 1024) {
  throw new Error("Portable package exceeds release verification budget");
}
const manifest = {
  ...originalManifest,
  kind: "lao-devspace-portable-candidate",
  nodeModulesIncluded: true,
  requiresOfflineFrozenDependencies: false,
  runtime: {
    nodeVersion: process.version, nodeAbi: process.versions.modules,
    platform: process.platform, arch: process.arch,
    packages: selected.map(([name, _file, version]) => ({ name, version })),
  },
  files: records.sort((a, b) => a.path.localeCompare(b.path)),
};
await writeFile(join(output, "RELEASE_MANIFEST.json"), JSON.stringify(manifest, null, 2) + "\n");
execFileSync(process.execPath, [join(project, "src/lao/release-verify.mjs"), "--dir", output], {
  timeout: 30_000, windowsHide: true, stdio: "pipe",
});
console.log(JSON.stringify({
  kind: manifest.kind, output, files: records.length, bytes,
  platform: manifest.runtime.platform, arch: manifest.runtime.arch,
  nodeAbi: manifest.runtime.nodeAbi, installed: false, serviceInstalled: false,
}));

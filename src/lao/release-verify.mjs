#!/usr/bin/env node
/** Strict read-only validation of a non-installing LAO release candidate. */
import { createHash } from "node:crypto";
import { lstat, readFile, readdir } from "node:fs/promises";
import { isAbsolute, join, relative, resolve, sep, win32 } from "node:path";

const args = process.argv.slice(2);
if (args.length !== 2 || args[0] !== "--dir" || !isAbsolute(args[1])) {
  throw new Error("Usage: node release-verify.mjs --dir <absolute-release-directory>");
}
const base = resolve(args[1]);
if (!(await lstat(base)).isDirectory()) throw new Error("Release directory must be a real directory");
const raw = await readFile(join(base, "RELEASE_MANIFEST.json"));
if (raw.length > 300_000) throw new Error("Manifest exceeds verification budget");
const manifest = JSON.parse(raw.toString("utf8"));
const standalone = manifest.kind === "lao-devspace-standalone-candidate";
const portable = standalone || manifest.kind === "lao-devspace-portable-candidate";
if (manifest.schemaVersion !== 1 ||
    !["lao-devspace-release-candidate", "lao-devspace-portable-candidate",
      "lao-devspace-standalone-candidate"].includes(manifest.kind) ||
    manifest.stableDevspaceVersion !== "1.0.8" ||
    manifest.installed !== false || manifest.serviceInstalled !== false ||
    manifest.autostartEnabled !== false || manifest.nodeModulesIncluded !== portable ||
    manifest.requiresOfflineFrozenDependencies !== !portable ||
    !Array.isArray(manifest.files) || manifest.files.length < 10 || manifest.files.length > 2501) {
  throw new Error("Unrecognized or unsafe release manifest");
}
const allowedRuntimePackages = new Map([
  ["zod", "4.4.3"],
  ["better-sqlite3", "12.10.0"],
  ["bindings", "1.5.0"],
  ["file-uri-to-path", "1.0.0"],
]);
if (portable && (!manifest.runtime ||
    !["win32", "linux", "darwin"].includes(manifest.runtime.platform) ||
    !["x64", "arm64"].includes(manifest.runtime.arch) ||
    !/^\d{2,3}$/.test(manifest.runtime.nodeAbi) ||
    !Array.isArray(manifest.runtime.packages) ||
    manifest.runtime.packages.length !== allowedRuntimePackages.size ||
    new Set(manifest.runtime.packages.map(item => item.name)).size !== allowedRuntimePackages.size ||
    manifest.runtime.packages.some(({ name, version }) =>
      allowedRuntimePackages.get(name) !== version))) {
  throw new Error("Portable candidate runtime metadata invalid");
}
if (standalone) {
  const embedded = manifest.runtime.embeddedNode;
  if (manifest.runtime.platform !== "win32" ||
      !embedded || Object.keys(embedded).sort().join(",") !==
      "arch,nodeAbi,nodeVersion,path,sha256" ||
      embedded.path !== "runtime/node.exe" ||
      !/^v(?:22|24|26)\.\d+\.\d+$/.test(embedded.nodeVersion) ||
      embedded.arch !== manifest.runtime.arch ||
      embedded.nodeAbi !== manifest.runtime.nodeAbi ||
      !/^[a-f0-9]{64}$/.test(embedded.sha256) ||
      !manifest.files.some(item => item.path === embedded.path &&
        item.sha256 === embedded.sha256 &&
        item.bytes >= 10 * 1024 * 1024 && item.bytes <= 160 * 1024 * 1024)) {
    throw new Error("Standalone candidate Node runtime metadata invalid");
  }
} else if (manifest.runtime?.embeddedNode !== undefined) {
  throw new Error("Embedded Node runtime not allowed in this release kind");
}
const validName = name => typeof name === "string" &&
  name.length > 0 && name.length <= 260 &&
  !name.includes("\\") && !name.includes(":") && !name.startsWith("/") &&
  !win32.isAbsolute(name) && !name.split("/").some(part =>
    part === "" || part === "." || part === ".." || part === ".git") &&
  (portable
    ? (standalone && name === "runtime/node.exe" ||
      (!name.includes("/node_modules/") &&
      !name.startsWith("runtime/") &&
      (!name.startsWith("node_modules/") ||
        allowedRuntimePackages.has(name.split("/")[1]) && name.split("/").length > 2)))
    : !name.split("/").includes("node_modules"));
const manifestPaths = new Set();
let budget = 0;
for (const item of manifest.files) {
  if (!item || !validName(item.path) || !Number.isSafeInteger(item.bytes) ||
      item.bytes < 0 || item.bytes > 120 * 1024 * 1024 ||
      typeof item.sha256 !== "string" || !/^[0-9a-f]{64}$/.test(item.sha256)) {
    throw new Error("Invalid release manifest entry: " + String(item?.path).slice(0, 160));
  }
  const key = item.path.toLowerCase();
  if (manifestPaths.has(key)) throw new Error("Duplicate release path");
  manifestPaths.add(key);
  budget += item.bytes;
  if (budget > (standalone ? 240 : 120) * 1024 * 1024)
    throw new Error("Release verification budget exceeded");
}
const seen = new Set();
async function walk(directory) {
  for (const name of await readdir(directory)) {
    const file = join(directory, name);
    const stat = await lstat(file);
    if (stat.isSymbolicLink()) throw new Error("Release contains symlink");
    if (stat.isDirectory()) await walk(file);
    else if (stat.isFile()) {
      const rel = relative(base, file).split(sep).join("/");
      if (rel === "RELEASE_MANIFEST.json") continue;
      const key = rel.toLowerCase();
      if (!manifestPaths.has(key) || seen.has(key)) {
        throw new Error("Unexpected or duplicate release file");
      }
      seen.add(key);
    } else throw new Error("Unsupported release filesystem entry");
  }
}
await walk(base);
if (seen.size !== manifest.files.length) throw new Error("Missing release files");
let verifiedBytes = 0;
for (const item of manifest.files) {
  const path = join(base, item.path);
  const stat = await lstat(path);
  if (!stat.isFile() || stat.size !== item.bytes) throw new Error("Release file size mismatch");
  const content = await readFile(path);
  if (content.length !== item.bytes ||
      createHash("sha256").update(content).digest("hex") !== item.sha256) {
    throw new Error("Release SHA-256 mismatch");
  }
  verifiedBytes += content.length;
}
console.log(JSON.stringify({
  verified: true, kind: manifest.kind, stableDevspaceVersion: "1.0.8",
  files: seen.size, bytes: verifiedBytes, installed: false,
  ...(portable ? { runtime: manifest.runtime } : {}),
}));

#!/usr/bin/env node
/**
 * Offline, Windows-only, self-contained daemon candidate with a hash-pinned
 * Node runtime copied from an explicitly approved local executable.
 *
 * This is NOT an installer: no SCM, PATH, registry, boot, downloads or writes
 * to any checkout. A detached signature by an independent operator remains
 * necessary to authenticate the final candidate.
 */
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { createReadStream } from "node:fs";
import { cp, lstat, mkdir, readFile, realpath, rm, stat, writeFile } from "node:fs/promises";
import { dirname, isAbsolute, join, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

const project = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const args = process.argv.slice(2);
if (args.length !== 6 || args[0] !== "--out" ||
    args[2] !== "--node-exe" || args[4] !== "--node-sha256" ||
    !isAbsolute(args[1]) || !isAbsolute(args[3]) ||
    !/^[0-9a-fA-F]{64}$/.test(args[5])) {
  throw new Error("Usage: node src/lao/release-standalone.mjs --out <absolute-new-dir> --node-exe <trusted-local-node.exe> --node-sha256 <exact-hash>");
}
if (process.platform !== "win32") throw new Error("Standalone Windows runtime packaging requires win32");
const output = resolve(args[1]);
const nodeExe = resolve(args[3]);
const expectedHash = args[5].toLowerCase();
const source = await realpath(nodeExe);
if (source !== nodeExe || !(await lstat(nodeExe)).isFile() ||
    !(await stat(nodeExe)).isFile() || !nodeExe.toLowerCase().endsWith(".exe")) {
  throw new Error("Node runtime must be a regular canonical local .exe");
}
const nodeSize = (await stat(nodeExe)).size;
if (nodeSize < 10 * 1024 * 1024 || nodeSize > 160 * 1024 * 1024) {
  throw new Error("Node executable size is outside the approved budget");
}
async function hashFile(path) {
  const hash = createHash("sha256");
  for await (const bytes of createReadStream(path)) hash.update(bytes);
  return hash.digest("hex");
}
if (await hashFile(nodeExe) !== expectedHash) throw new Error("Node executable SHA-256 mismatch");
const runEnv = {
  PATH: process.env.PATH, SystemRoot: process.env.SystemRoot,
  TEMP: process.env.TEMP, TMP: process.env.TMP, USERPROFILE: process.env.USERPROFILE,
  APPDATA: process.env.APPDATA, LOCALAPPDATA: process.env.LOCALAPPDATA,
};
const inspect = exe => JSON.parse(execFileSync(exe, [
  "-p", "JSON.stringify({version:process.version,platform:process.platform,arch:process.arch,abi:process.versions.modules})",
], { encoding: "utf8", timeout: 8000, windowsHide: true, maxBuffer: 2048, env: runEnv }));
const node = inspect(nodeExe);
if (node.platform !== "win32" || !["x64", "arm64"].includes(node.arch) ||
    !/^v(?:22|24|26)\.\d+\.\d+$/.test(node.version) ||
    !/^\d{2,3}$/.test(node.abi) ||
    node.arch !== process.arch || node.abi !== process.versions.modules) {
  throw new Error("Node executable does not match the supported Windows runtime and ABI");
}
// Refuse overwrite before starting the existing offline portable builder.
try {
  await lstat(output);
  throw new Error("Standalone output already exists; refusing overwrite");
} catch (error) { if (error.code !== "ENOENT") throw error; }
// Protect against source output nesting; release-portable verifies further.
const checkout = await realpath(project);
const within = (parent, path) => path === parent || path.startsWith(parent + sep);
if (within(checkout, output) || within(output, checkout))
  throw new Error("Standalone output must be outside the LAO checkout");

let created = false;
try {
  execFileSync(process.execPath, [join(project, "src/lao/release-portable.mjs"), "--out", output], {
    timeout: 90_000, windowsHide: true, stdio: "pipe", env: runEnv,
  });
  created = true;
  const manifestPath = join(output, "RELEASE_MANIFEST.json");
  const manifest = JSON.parse(await readFile(manifestPath, "utf8"));
  if (manifest.kind !== "lao-devspace-portable-candidate" ||
      manifest.runtime.platform !== node.platform ||
      manifest.runtime.arch !== node.arch || manifest.runtime.nodeAbi !== node.abi) {
    throw new Error("Portable candidate ABI does not match the supplied Node runtime");
  }
  const runtimeDir = join(output, "runtime");
  await mkdir(runtimeDir);
  const bundledNode = join(runtimeDir, "node.exe");
  await cp(nodeExe, bundledNode, { errorOnExist: true, force: false });
  if (await hashFile(bundledNode) !== expectedHash || (await stat(bundledNode)).size !== nodeSize) {
    throw new Error("Copied Node runtime SHA-256 or size mismatch");
  }
  manifest.kind = "lao-devspace-standalone-candidate";
  manifest.runtime.embeddedNode = {
    path: "runtime/node.exe", sha256: expectedHash,
    nodeVersion: node.version, nodeAbi: node.abi, arch: node.arch,
  };
  manifest.files.push({ path: "runtime/node.exe", bytes: nodeSize, sha256: expectedHash });
  manifest.files.sort((a, b) => a.path.localeCompare(b.path));
  await writeFile(manifestPath, JSON.stringify(manifest, null, 2) + "\n");
  // The verification code is from trusted sources, NOT from the candidate.
  execFileSync(process.execPath, [join(project, "src/lao/release-verify.mjs"), "--dir", output], {
    timeout: 30_000, windowsHide: true, stdio: "pipe", env: runEnv,
  });
  // Validate compiled SQLite and zod using the COPIED Node executable
  // and its own native node_modules, never the checkout's dependencies.
  // LaoTaskStore requires a directory. Use the candidate's ephemeral
  // smoke data only outside its verified release tree (no extra files).
  const smokeScript = [
    "import { mkdtempSync, rmSync } from 'node:fs';",
    "import { tmpdir } from 'node:os';",
    "import { join } from 'node:path';",
    "import { LaoTaskStore } from './dist/lao/task-store.js';",
    "const dir=mkdtempSync(join(tmpdir(),'lao-standalone-smoke-'));",
    "try{const db=new LaoTaskStore(dir);",
    "if(db.list().length!==0)throw Error('Unexpected SQLite rows');",
    "db.close();console.log('standalone_node_ok');",
    "}finally{rmSync(dir,{recursive:true,force:true})}",
  ].join("\n");
  const stdout = execFileSync(bundledNode, ["--input-type=module", "-e", smokeScript], {
    cwd: output, timeout: 15_000, windowsHide: true, maxBuffer: 2048,
    encoding: "utf8", env: runEnv,
  });
  if (!stdout.includes("standalone_node_ok")) throw new Error("Standalone SQLite smoke missing");
  console.log(JSON.stringify({
    kind: manifest.kind, output, runtimeVersion: node.version, runtimeAbi: node.abi,
    nodeSha256: expectedHash, files: manifest.files.length,
    installed: false, serviceInstalled: false, autostartEnabled: false,
    sqliteSmoke: "passed", independentSignatureRequired: true,
  }));
} catch (error) {
  // Never remove a preexisting directory. The output was verified absent
  // before the build; remove only our freshly-created failed candidate.
  if (created) await rm(output, { recursive: true, force: true }).catch(() => undefined);
  throw error;
}

#!/usr/bin/env node
/** Offline, explicitly initiated signing of an already verified LAO candidate.
 * Private keys remain outside the release, are never logged or bundled.
 */
import { createHash, createPrivateKey, createPublicKey, sign } from "node:crypto";
import { execFileSync } from "node:child_process";
import { lstat, readFile, realpath, writeFile } from "node:fs/promises";
import { dirname, isAbsolute, join, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

const args = process.argv.slice(2);
if (args.length !== 6 || args[0] !== "--dir" || args[2] !== "--key" ||
    args[4] !== "--out" || ![args[1], args[3], args[5]].every(isAbsolute)) {
  throw new Error("Usage: node release-auth-sign.mjs --dir <release> --key <external-ed25519-private-pem> --out <new-external-signature.json>");
}
const [release, keyPath, output] = [args[1], args[3], args[5]].map(path => resolve(path));
const root = await realpath(release);
const within = path => path === root || path.startsWith(root + sep);
if (within(keyPath) || within(output)) throw new Error("Signing key and signature must be outside the candidate");
const keyReal = await realpath(keyPath);
if (within(keyReal) || !(await lstat(keyPath)).isFile()) throw new Error("Unsafe signing key");
const keyBytes = await readFile(keyPath);
if (keyBytes.length > 16384) throw new Error("Signing key exceeds budget");
const key = createPrivateKey(keyBytes);
if (key.asymmetricKeyType !== "ed25519") throw new Error("Only Ed25519 signing keys are accepted");

// A trusted checker from this source tree runs BEFORE the private key is used.
const verifier = fileURLToPath(new URL("./release-verify.mjs", import.meta.url));
execFileSync(process.execPath, [verifier, "--dir", root], {
  timeout: 30_000, windowsHide: true, stdio: "pipe",
});
const manifest = await readFile(join(root, "RELEASE_MANIFEST.json"));
const manifestSha256 = createHash("sha256").update(manifest).digest("hex");
const publicKeySha256 = createHash("sha256").update(
  createPublicKey(key).export({ type: "spki", format: "der" })).digest("hex");
const receipt = {
  schemaVersion: 1, algorithm: "Ed25519", manifestSha256, publicKeySha256,
  signatureBase64: sign(null, manifest, key).toString("base64"),
};
if (within(await realpath(dirname(output)))) throw new Error("Signature parent must be outside release");
await writeFile(output, JSON.stringify(receipt, null, 2) + "\n", { flag: "wx", mode: 0o600 });
console.log(JSON.stringify({ signed: true, manifestSha256, publicKeySha256 }));

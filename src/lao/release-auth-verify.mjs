#!/usr/bin/env node
/** Verify detached Ed25519 authenticity using an independently trusted key.
 * Invoke from a trusted source checkout, NEVER from the candidate itself.
 */
import { createHash, createPublicKey, verify } from "node:crypto";
import { execFileSync } from "node:child_process";
import { lstat, readFile, realpath } from "node:fs/promises";
import { dirname, isAbsolute, join, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

const args = process.argv.slice(2);
if (args.length !== 6 || args[0] !== "--dir" || args[2] !== "--signature" ||
    args[4] !== "--public-key" || ![args[1], args[3], args[5]].every(isAbsolute)) {
  throw new Error("Usage: node release-auth-verify.mjs --dir <release> --signature <external-signature.json> --public-key <trusted-external-pem>");
}
const [release, sigPath, keyPath] = [args[1], args[3], args[5]].map(path => resolve(path));
const root = await realpath(release);
const within = path => path === root || path.startsWith(root + sep);
for (const path of [sigPath, keyPath]) {
  if (within(path) || within(await realpath(path)) || !(await lstat(path)).isFile()) {
    throw new Error("Signature and trusted key must be regular files outside candidate");
  }
}
const sigBytes = await readFile(sigPath);
const keyBytes = await readFile(keyPath);
if (sigBytes.length > 8192 || keyBytes.length > 16384) throw new Error("Authentication input too large");
const receipt = JSON.parse(sigBytes.toString("utf8"));
if (!receipt || Object.keys(receipt).sort().join(",") !==
    "algorithm,manifestSha256,publicKeySha256,schemaVersion,signatureBase64" ||
    receipt.schemaVersion !== 1 || receipt.algorithm !== "Ed25519" ||
    !/^[a-f0-9]{64}$/.test(receipt.manifestSha256) ||
    !/^[a-f0-9]{64}$/.test(receipt.publicKeySha256) ||
    !/^[A-Za-z0-9+/]{86}==$/.test(receipt.signatureBase64)) {
  throw new Error("Unrecognized detached release signature");
}
const key = createPublicKey(keyBytes);
if (key.asymmetricKeyType !== "ed25519") throw new Error("Trusted key must be Ed25519");
const fingerprint = createHash("sha256").update(
  key.export({ type: "spki", format: "der" })).digest("hex");
const manifest = await readFile(join(root, "RELEASE_MANIFEST.json"));
if (fingerprint !== receipt.publicKeySha256 ||
    createHash("sha256").update(manifest).digest("hex") !== receipt.manifestSha256 ||
    !verify(null, manifest, key, Buffer.from(receipt.signatureBase64, "base64"))) {
  throw new Error("Release authenticity signature mismatch");
}
// Only trust the local verifier belonging to the externally trusted checkout.
const verifier = fileURLToPath(new URL("./release-verify.mjs", import.meta.url));
execFileSync(process.execPath, [verifier, "--dir", root], {
  timeout: 30_000, windowsHide: true, stdio: "pipe",
});
console.log(JSON.stringify({ authenticated: true, verified: true,
  manifestSha256: receipt.manifestSha256, publicKeySha256: fingerprint }));

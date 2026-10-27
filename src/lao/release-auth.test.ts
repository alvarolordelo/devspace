import assert from "node:assert/strict";
import { generateKeyPairSync } from "node:crypto";
import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

const packageScript = fileURLToPath(new URL("./release-package.mjs", import.meta.url));
const signer = fileURLToPath(new URL("./release-auth-sign.mjs", import.meta.url));
const verifier = fileURLToPath(new URL("./release-auth-verify.mjs", import.meta.url));
const run = (script: string, ...args: string[]) => execFileSync(process.execPath,
  [script, ...args], { windowsHide: true, encoding: "utf8", timeout: 30_000,
    stdio: "pipe" });

test("detached Ed25519 verifies a staged release with an independent public key", () => {
  const root = mkdtempSync(join(tmpdir(), "lao-signed-release-"));
  const candidate = join(root, "candidate");
  const signature = join(root, "release.sig.json");
  const privatePath = join(root, "private.pem");
  const publicPath = join(root, "public.pem");
  const wrongPublicPath = join(root, "wrong-public.pem");
  try {
    run(packageScript, "--out", candidate);
    const keys = generateKeyPairSync("ed25519", {
      privateKeyEncoding: { format: "pem", type: "pkcs8" },
      publicKeyEncoding: { format: "pem", type: "spki" },
    });
    const wrongKeys = generateKeyPairSync("ed25519", {
      privateKeyEncoding: { format: "pem", type: "pkcs8" },
      publicKeyEncoding: { format: "pem", type: "spki" },
    });
    writeFileSync(privatePath, keys.privateKey, { mode: 0o600 });
    writeFileSync(publicPath, keys.publicKey);
    writeFileSync(wrongPublicPath, wrongKeys.publicKey);
    const signed = JSON.parse(run(signer, "--dir", candidate,
      "--key", privatePath, "--out", signature));
    assert.equal(signed.signed, true);
    assert.match(signed.publicKeySha256, /^[0-9a-f]{64}$/);
    const confirmed = JSON.parse(run(verifier, "--dir", candidate,
      "--signature", signature, "--public-key", publicPath));
    assert.equal(confirmed.authenticated, true);
    assert.equal(confirmed.verified, true);
    assert.equal(confirmed.publicKeySha256, signed.publicKeySha256);

    assert.throws(() => run(signer, "--dir", candidate,
      "--key", privatePath, "--out", signature), /Command failed/);
    assert.throws(() => run(signer, "--dir", candidate,
      "--key", privatePath, "--out", join(candidate, "signature.json")),
    /Command failed/);
    assert.throws(() => run(verifier, "--dir", candidate,
      "--signature", signature, "--public-key", wrongPublicPath), /Command failed/);
    const originalSignature = readFileSync(signature);
    const forged = JSON.parse(originalSignature.toString("utf8"));
    forged.signatureBase64 = (forged.signatureBase64.startsWith("A") ? "B" : "A") +
      forged.signatureBase64.slice(1);
    writeFileSync(signature, JSON.stringify(forged));
    assert.throws(() => run(verifier, "--dir", candidate,
      "--signature", signature, "--public-key", publicPath), /Command failed/);
    writeFileSync(signature, originalSignature);

    const manifestPath = join(candidate, "RELEASE_MANIFEST.json");
    const originalManifest = readFileSync(manifestPath);
    writeFileSync(manifestPath, Buffer.concat([originalManifest, Buffer.from(" ")]));
    assert.throws(() => run(verifier, "--dir", candidate,
      "--signature", signature, "--public-key", publicPath), /Command failed/);
    writeFileSync(manifestPath, originalManifest);

    const manifest = JSON.parse(originalManifest.toString("utf8"));
    const file = join(candidate, manifest.files[0].path);
    const originalFile = readFileSync(file);
    writeFileSync(file, Buffer.concat([originalFile, Buffer.from("CORRUPTED")]));
    assert.throws(() => run(verifier, "--dir", candidate,
      "--signature", signature, "--public-key", publicPath), /Command failed/);
    writeFileSync(file, originalFile);
    assert.equal(JSON.parse(run(verifier, "--dir", candidate,
      "--signature", signature, "--public-key", publicPath)).authenticated, true);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

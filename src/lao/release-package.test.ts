import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync, unlinkSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

const executable = fileURLToPath(new URL("./release-package.mjs", import.meta.url));
const verifier = fileURLToPath(new URL("./release-verify.mjs", import.meta.url));
test("release candidate is noninstalling, hash manifest agrees and no overwrite is possible", () => {
  const root = mkdtempSync(join(tmpdir(), "lao-rc-"));
  const output = join(root, "candidate");
  try {
    execFileSync(process.execPath, [executable, "--out", output], {
      encoding: "utf8", timeout: 20_000, windowsHide: true,
    });
    const manifest = JSON.parse(readFileSync(join(output, "RELEASE_MANIFEST.json"), "utf8"));
    assert.equal(manifest.stableDevspaceVersion, "1.0.8");
    assert.equal(manifest.installed, false);
    assert.equal(manifest.serviceInstalled, false);
    assert.equal(manifest.autostartEnabled, false);
    assert.equal(manifest.nodeModulesIncluded, false);
    assert.equal(manifest.requiresOfflineFrozenDependencies, true);
    assert.ok(manifest.files.length > 10);
    assert.ok(manifest.files.some((file: {path: string}) => file.path === "src/lao/release-verify.mjs"));
    for (const file of manifest.files) {
      const bytes = readFileSync(join(output, file.path));
      assert.equal(createHash("sha256").update(bytes).digest("hex"), file.sha256);
      assert.equal(bytes.length, file.bytes);
      assert.ok(!file.path.includes("node_modules"));
    }
    assert.throws(() => execFileSync(process.execPath, [executable, "--out", output], {
      timeout: 20_000, windowsHide: true, stdio: "pipe",
    }), /Release output already exists/);
    const verified = JSON.parse(execFileSync(process.execPath, [verifier, "--dir", output], {
      encoding: "utf8", timeout: 20_000, windowsHide: true,
    }));
    assert.equal(verified.verified, true);
    assert.equal(verified.files, manifest.files.length);
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test("release verifier rejects tampering, missing files, extras and traversal", () => {
  const root = mkdtempSync(join(tmpdir(), "lao-rc-bad-"));
  const output = join(root, "candidate");
  const verify = () => execFileSync(process.execPath, [verifier, "--dir", output], {
    encoding: "utf8", timeout: 20_000, windowsHide: true, stdio: "pipe",
  });
  try {
    execFileSync(process.execPath, [executable, "--out", output], {
      timeout: 20_000, windowsHide: true,
    });
    const manifestFile = join(output, "RELEASE_MANIFEST.json");
    const originalManifest = readFileSync(manifestFile);
    const manifest = JSON.parse(originalManifest.toString("utf8"));
    const file = join(output, manifest.files[0].path);
    const originalFile = readFileSync(file);
    writeFileSync(file, Buffer.concat([originalFile, Buffer.from("CORRUPTED")]));
    assert.throws(verify, /size mismatch/);
    writeFileSync(file, originalFile);
    writeFileSync(join(output, "unexpected.txt"), "extra");
    assert.throws(verify, /Unexpected or duplicate/);
    unlinkSync(join(output, "unexpected.txt"));
    unlinkSync(file);
    assert.throws(verify, /Missing release files/);
    writeFileSync(file, originalFile);
    manifest.files[0].path = "../escape";
    writeFileSync(manifestFile, JSON.stringify(manifest));
    assert.throws(verify, /Invalid release manifest entry/);
    writeFileSync(manifestFile, originalManifest);
    assert.doesNotThrow(verify);
  } finally { rmSync(root, { recursive: true, force: true }); }
});

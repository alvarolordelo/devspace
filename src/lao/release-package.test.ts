import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

const executable = fileURLToPath(new URL("./release-package.mjs", import.meta.url));
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
    assert.ok(manifest.files.length > 10);
    for (const file of manifest.files) {
      const bytes = readFileSync(join(output, file.path));
      assert.equal(createHash("sha256").update(bytes).digest("hex"), file.sha256);
      assert.equal(bytes.length, file.bytes);
      assert.ok(!file.path.includes("node_modules"));
    }
    assert.throws(() => execFileSync(process.execPath, [executable, "--out", output], {
      timeout: 20_000, windowsHide: true, stdio: "pipe",
    }), /Release output already exists/);
  } finally { rmSync(root, { recursive: true, force: true }); }
});

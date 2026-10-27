import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync, unlinkSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

const executable = fileURLToPath(new URL("./release-package.mjs", import.meta.url));
const verifier = fileURLToPath(new URL("./release-verify.mjs", import.meta.url));
const portable = fileURLToPath(new URL("./release-portable.mjs", import.meta.url));
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

test("offline portable daemon candidate has fixed native runtime and isolated SQLite smoke", () => {
  const root = mkdtempSync(join(tmpdir(), "lao-portable-"));
  const output = join(root, "portable");
  try {
    execFileSync(process.execPath, [portable, "--out", output], {
      timeout: 90_000, windowsHide: true, stdio: "pipe",
    });
    const manifest = JSON.parse(readFileSync(join(output, "RELEASE_MANIFEST.json"), "utf8"));
    assert.equal(manifest.kind, "lao-devspace-portable-candidate");
    assert.equal(manifest.nodeModulesIncluded, true);
    assert.equal(manifest.requiresOfflineFrozenDependencies, false);
    assert.equal(manifest.runtime.nodeAbi, process.versions.modules);
    assert.equal(manifest.runtime.platform, process.platform);
    assert.equal(manifest.runtime.arch, process.arch);
    assert.ok(manifest.files.some((file: {path: string}) =>
      file.path.includes("node_modules/better-sqlite3/") && file.path.endsWith(".node")));
    const checked = JSON.parse(execFileSync(process.execPath, [verifier, "--dir", output], {
      timeout: 30_000, windowsHide: true, encoding: "utf8",
    }));
    assert.equal(checked.verified, true);
    assert.equal(checked.files, manifest.files.length);
    // Run the published JS + bundled better-sqlite3 and zod from that
    // candidate, not from source node_modules or the test process.
    const smoke = [
      "import { LaoTaskStore } from './dist/lao/task-store.js';",
      "import { mkdtempSync, rmSync } from 'node:fs';",
      "import { tmpdir } from 'node:os';",
      "import { join } from 'node:path';",
      "const dir=mkdtempSync(join(tmpdir(),'lao-portable-smoke-'));",
      "try { const store=new LaoTaskStore(dir);",
      "if(store.list().length!==0)throw Error('Expected new empty SQLite');",
      "store.close(); console.log('portable_sqlite_ok');",
      "} finally {rmSync(dir,{recursive:true,force:true})}",
    ].join("\n");
    const tested = execFileSync(process.execPath, ["--input-type=module", "-e", smoke], {
      cwd: output, timeout: 30_000, windowsHide: true, encoding: "utf8",
      env: {
        ...process.env,
        NODE_PATH: "", NODE_OPTIONS: "",
      },
    });
    assert.match(tested, /portable_sqlite_ok/);
    if (process.platform === "win32") {
      const serviceScript = join(output, "src", "lao", "windows", "lao-service-plan.ps1");
      const wrapper = join(root, "winsw-fixture.exe");
      const wrapperBytes = Buffer.from("TEST ONLY - NOT A REAL SERVICE WRAPPER");
      writeFileSync(wrapper, wrapperBytes);
      const hash = createHash("sha256").update(wrapperBytes).digest("hex");
      const serviceDir = join(root, "service-plan");
      const params = [
        "-NoProfile", "-NonInteractive", "-ExecutionPolicy", "Bypass", "-File",
        serviceScript, "-ReleaseDir", output, "-OutputDir", serviceDir,
        "-WinSWExe", wrapper, "-WinSWSha256", hash, "-NodeExe", process.execPath,
      ];
      const planResult = execFileSync("powershell.exe", params, {
        encoding: "utf8", timeout: 60_000, windowsHide: true,
      });
      const plan = JSON.parse(planResult) as Record<string, unknown>;
      assert.equal(plan.kind, "lao-windows-service-plan");
      assert.equal(plan.installed, false);
      assert.equal(plan.serviceStarted, false);
      assert.equal(plan.autostartEnabled, false);
      const xml = readFileSync(join(serviceDir, "LAODevSpaceService.xml"), "utf8");
      assert.match(xml, /<startmode>Manual<\/startmode>/);
      assert.match(xml, /LAODevSpace/);
      assert.doesNotMatch(xml, /LAO_WRITE_APPROVAL_ENABLED|LAO_WRITE_PROMOTION_ENABLED/);
      assert.ok(readFileSync(join(serviceDir, "LAODevSpaceService.exe")).equals(wrapperBytes));
      const rejectedParams = [...params];
      const badPlan = join(root, "rejected-plan");
      rejectedParams[rejectedParams.indexOf("-OutputDir") + 1] = badPlan;
      rejectedParams[rejectedParams.indexOf("-WinSWSha256") + 1] = "0".repeat(64);
      assert.throws(() => execFileSync("powershell.exe", rejectedParams, {
        timeout: 30_000, windowsHide: true, stdio: "pipe",
      }), /WinSW SHA-256 mismatch/);
      assert.equal(existsSync(badPlan), false, "Invalid wrapper cannot create service plan");
    }
    assert.throws(() => execFileSync(process.execPath, [portable, "--out", output], {
      timeout: 30_000, windowsHide: true, stdio: "pipe",
    }), /EEXIST|already exists|inside/);
  } finally { rmSync(root, { recursive: true, force: true }); }
});

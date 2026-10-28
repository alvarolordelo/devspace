import assert from "node:assert/strict";
import { createHash, generateKeyPairSync } from "node:crypto";
import { execFileSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync, unlinkSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

const executable = fileURLToPath(new URL("./release-package.mjs", import.meta.url));
const verifier = fileURLToPath(new URL("./release-verify.mjs", import.meta.url));
const portable = fileURLToPath(new URL("./release-portable.mjs", import.meta.url));
const standalone = fileURLToPath(new URL("./release-standalone.mjs", import.meta.url));
const signer = fileURLToPath(new URL("./release-auth-sign.mjs", import.meta.url));
const authVerifier = fileURLToPath(new URL("./release-auth-verify.mjs", import.meta.url));
test("release candidate is noninstalling, hash manifest agrees and no overwrite is possible", () => {
  const root = mkdtempSync(join(tmpdir(), "lao-rc-"));
  const output = join(root, "candidate");
  try {
    execFileSync(process.execPath, [executable, "--out", output], {
      encoding: "utf8", timeout: 20_000, windowsHide: true,
    });
    const manifest = JSON.parse(readFileSync(join(output, "RELEASE_MANIFEST.json"), "utf8"));
    assert.equal(manifest.laoVersion, "1.1.0-beta.11");
    assert.equal(manifest.stableDevspaceVersion, "1.0.8");
    assert.ok(manifest.files.some((file: {path: string}) =>
      file.path === "docs/lao-devspace/LAO_VERSION.json"));
    assert.ok(manifest.files.some((file: {path: string}) =>
      file.path === "scripts/activate-lao-mcp-devspace.ps1"));
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
      assert.equal(plan.startMode, "Manual");
      assert.equal(plan.delayedAutoStart, false);
      assert.equal(plan.serviceAccount, "NT AUTHORITY\\LocalService");
      assert.equal(plan.stopTimeout, "30sec");
      assert.match(String(plan.configSHA256), /^[a-f0-9]{64}$/);
      assert.match(String(plan.lifecycleSHA256), /^[a-f0-9]{64}$/);
      const xml = readFileSync(join(serviceDir, "LAODevSpaceService.xml"), "utf8");
      assert.match(xml, /<startmode>Manual<\/startmode>/);
      assert.match(xml, /LAODevSpace/);
      assert.match(xml, /<username>NT AUTHORITY\\LocalService<\/username>/);
      assert.match(xml, /<stoptimeout>30sec<\/stoptimeout>/);
      assert.doesNotMatch(xml, /<username>LocalSystem<\/username>/);
      assert.doesNotMatch(xml, /<password>/);
      assert.doesNotMatch(xml, /LAO_WRITE_APPROVAL_ENABLED|LAO_WRITE_PROMOTION_ENABLED/);
      assert.match(xml, /LAO_DASHBOARD_TOKEN_FILE/);
      assert.match(xml, /LAO_DEVSPACE_MCP_TOKEN_FILE/);
      assert.match(xml, /LAO_RESTART_SUPERVISED/);
      assert.ok(readFileSync(join(serviceDir, "LAODevSpaceService.exe")).equals(wrapperBytes));
      assert.equal(existsSync(join(serviceDir, "lao-service-lifecycle.ps1")), true);
      const dashboardSecret = join(root, "dashboard-secret.txt");
      const devspaceSecret = join(root, "devspace-secret.txt");
      writeFileSync(dashboardSecret, "dashboard-test-secret-12345678901234567890\n");
      writeFileSync(devspaceSecret, "devspace-test-secret-12345678901234567890\n");
      const validate = JSON.parse(execFileSync("powershell.exe", [
        "-NoProfile", "-NonInteractive", "-ExecutionPolicy", "Bypass", "-File",
        join(serviceDir, "lao-service-lifecycle.ps1"),
        "-ServicePlanDir", serviceDir, "-Action", "Validate",
        "-DashboardTokenFile", dashboardSecret, "-DevSpaceTokenFile", devspaceSecret,
      ], { encoding: "utf8", timeout: 60_000, windowsHide: true }));
      assert.equal(validate.valid, true);
      assert.equal(validate.mutated, false);
      assert.equal(validate.credentialsValidated, true);
      assert.equal(validate.startMode, "Manual");

      const automaticDir = join(root, "automatic-service-plan");
      const automaticParams = [...params];
      automaticParams[automaticParams.indexOf("-OutputDir") + 1] = automaticDir;
      automaticParams.push("-StartMode", "Automatic", "-DelayedAutoStart");
      const automatic = JSON.parse(execFileSync("powershell.exe", automaticParams, {
        encoding: "utf8", timeout: 60_000, windowsHide: true,
      }));
      assert.equal(automatic.autostartEnabled, true);
      assert.equal(automatic.delayedAutoStart, true);
      const automaticXml = readFileSync(join(automaticDir, "LAODevSpaceService.xml"), "utf8");
      assert.match(automaticXml, /<startmode>Automatic<\/startmode>/);
      assert.match(automaticXml, /<delayedAutoStart>true<\/delayedAutoStart>/);
      const automaticValidate = JSON.parse(execFileSync("powershell.exe", [
        "-NoProfile", "-NonInteractive", "-ExecutionPolicy", "Bypass", "-File",
        join(automaticDir, "lao-service-lifecycle.ps1"),
        "-ServicePlanDir", automaticDir, "-Action", "Validate",
      ], { encoding: "utf8", timeout: 60_000, windowsHide: true }));
      assert.equal(automaticValidate.valid, true);
      assert.equal(automaticValidate.startMode, "Automatic");
      assert.equal(automaticValidate.delayedAutoStart, true);

      const invalidDelayed = [...params];
      const invalidDelayedDir = join(root, "invalid-delayed-plan");
      invalidDelayed[invalidDelayed.indexOf("-OutputDir") + 1] = invalidDelayedDir;
      invalidDelayed.push("-DelayedAutoStart");
      assert.throws(() => execFileSync("powershell.exe", invalidDelayed, {
        timeout: 30_000, windowsHide: true, stdio: "pipe",
      }), /DelayedAutoStart requires StartMode Automatic/);
      assert.equal(existsSync(invalidDelayedDir), false);
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

test("offline standalone Windows candidate includes verified Node and runs bundled SQLite",
  { skip: process.platform !== "win32" }, () => {
  const root = mkdtempSync(join(tmpdir(), "lao-standalone-"));
  const output = join(root, "standalone");
  const hash = createHash("sha256").update(readFileSync(process.execPath)).digest("hex");
  const cmd = ["--out", output, "--node-exe", process.execPath, "--node-sha256", hash];
  const verify = () => execFileSync(process.execPath, [verifier, "--dir", output], {
    encoding: "utf8", timeout: 30_000, windowsHide: true, stdio: "pipe",
  });
  try {
    const invalid = [...cmd]; invalid[5] = "0".repeat(64);
    assert.throws(() => execFileSync(process.execPath, [standalone, ...invalid], {
      timeout: 20_000, windowsHide: true, stdio: "pipe",
    }), /Node executable SHA-256 mismatch/);
    assert.equal(existsSync(output), false, "Unverified Node cannot create output");

    const result = JSON.parse(execFileSync(process.execPath, [standalone, ...cmd], {
      encoding: "utf8", timeout: 100_000, windowsHide: true, stdio: "pipe",
    }));
    assert.equal(result.kind, "lao-devspace-standalone-candidate");
    assert.equal(result.sqliteSmoke, "passed");
    assert.equal(result.serviceInstalled, false);
    assert.equal(result.autostartEnabled, false);
    assert.equal(result.independentSignatureRequired, true);
    const manifestPath = join(output, "RELEASE_MANIFEST.json");
    const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
    assert.equal(manifest.runtime.embeddedNode.path, "runtime/node.exe");
    assert.equal(manifest.runtime.embeddedNode.sha256, hash);
    assert.equal(manifest.runtime.embeddedNode.nodeAbi, process.versions.modules);
    assert.equal(manifest.runtime.embeddedNode.nodeVersion, process.version);
    assert.equal(verify() && true, true);
    assert.equal(readFileSync(join(output, "runtime", "node.exe")).equals(readFileSync(process.execPath)), true);
    assert.throws(() => execFileSync(process.execPath, [standalone, ...cmd], {
      timeout: 20_000, windowsHide: true, stdio: "pipe",
    }), /Standalone output already exists/);

    const saved = readFileSync(manifestPath);
    manifest.runtime.embeddedNode.sha256 = "f".repeat(64);
    writeFileSync(manifestPath, JSON.stringify(manifest));
    assert.throws(verify, /Node runtime metadata invalid/);
    writeFileSync(manifestPath, saved);

    // The standalone build has no built-in signing identity. A separately
    // trusted operator can authenticate the ENTIRE manifest and Node hash.
    const { privateKey, publicKey } = generateKeyPairSync("ed25519", {
      privateKeyEncoding: { format: "pem", type: "pkcs8" },
      publicKeyEncoding: { format: "pem", type: "spki" },
    });
    const privateFile = join(root, "private.pem");
    const publicFile = join(root, "trusted-public.pem");
    const signatureFile = join(root, "standalone.sig.json");
    writeFileSync(privateFile, privateKey, { mode: 0o600 });
    writeFileSync(publicFile, publicKey);
    execFileSync(process.execPath, [
      signer, "--dir", output, "--key", privateFile, "--out", signatureFile,
    ], { timeout: 30_000, windowsHide: true, stdio: "pipe" });
    const verifySigned = () => execFileSync(process.execPath, [
      authVerifier, "--dir", output, "--signature", signatureFile,
      "--public-key", publicFile,
    ], { timeout: 30_000, windowsHide: true, encoding: "utf8", stdio: "pipe" });
    assert.equal(JSON.parse(verifySigned()).authenticated, true);

    const nodeFile = join(output, "runtime", "node.exe");
    const nodeBytes = readFileSync(nodeFile);
    writeFileSync(nodeFile, Buffer.concat([nodeBytes, Buffer.from("modified")]));
    assert.throws(verify, /size mismatch/);
    assert.throws(verifySigned, /Command failed/);
    writeFileSync(nodeFile, nodeBytes);
    assert.doesNotThrow(verify);
    assert.equal(JSON.parse(verifySigned()).authenticated, true);

    const wrapper = join(root, "winsw-fixture.exe");
    const wrapperBytes = Buffer.from("TEST ONLY - NOT A REAL SERVICE WRAPPER");
    writeFileSync(wrapper, wrapperBytes);
    const wrapperHash = createHash("sha256").update(wrapperBytes).digest("hex");
    const serviceDir = join(root, "standalone-service-plan");
    const planned = JSON.parse(execFileSync("powershell.exe", [
      "-NoProfile", "-NonInteractive", "-ExecutionPolicy", "Bypass", "-File",
      join(output, "src", "lao", "windows", "lao-service-plan.ps1"),
      "-ReleaseDir", output, "-OutputDir", serviceDir,
      "-WinSWExe", wrapper, "-WinSWSha256", wrapperHash,
      "-NodeExe", nodeFile,
    ], { encoding: "utf8", timeout: 60_000, windowsHide: true }));
    assert.equal(planned.installed, false);
    assert.equal(planned.serviceStarted, false);
    assert.equal(planned.startMode, "Manual");
    const xml = readFileSync(join(serviceDir, "LAODevSpaceService.xml"), "utf8");
    assert.match(xml, /runtime\\node\.exe/);
    assert.match(xml, /<startmode>Manual<\/startmode>/);
    const rejectedDir = join(root, "standalone-bad-service-plan");
    assert.throws(() => execFileSync("powershell.exe", [
      "-NoProfile", "-NonInteractive", "-ExecutionPolicy", "Bypass", "-File",
      join(output, "src", "lao", "windows", "lao-service-plan.ps1"),
      "-ReleaseDir", output, "-OutputDir", rejectedDir,
      "-WinSWExe", wrapper, "-WinSWSha256", wrapperHash,
      "-NodeExe", process.execPath,
    ], { timeout: 60_000, windowsHide: true, stdio: "pipe" }),
    /Standalone service must use the embedded runtime/);
    assert.equal(existsSync(rejectedDir), false,
      "service plan must not be created when Node is outside standalone candidate");
  } finally { rmSync(root, { recursive: true, force: true }); }
});

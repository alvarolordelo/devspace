import assert from "node:assert/strict";
import { mkdtempSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { readLaoDashboardToken } from "./daemon-credentials.js";

const token = "lao-service-dashboard-token-12345678901234567890";

test("daemon dashboard credential supports a protected absolute token file", () => {
  const dir = mkdtempSync(join(tmpdir(), "lao-daemon-secret-"));
  const file = join(dir, "dashboard-token.txt");
  try {
    writeFileSync(file, token + "\n", { mode: 0o600 });
    assert.equal(readLaoDashboardToken({ LAO_DASHBOARD_TOKEN_FILE: file }), token);
    assert.equal(readLaoDashboardToken({ LAO_DASHBOARD_TOKEN: token }), token);
    assert.equal(readLaoDashboardToken({}), undefined);
    assert.throws(() => readLaoDashboardToken({
      LAO_DASHBOARD_TOKEN: token, LAO_DASHBOARD_TOKEN_FILE: file,
    }), /not both/);
    assert.throws(() => readLaoDashboardToken({ LAO_DASHBOARD_TOKEN_FILE: "token.txt" }), /absolute/);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test("daemon dashboard credential refuses symlinked secret files", { skip: process.platform === "win32" }, () => {
  const dir = mkdtempSync(join(tmpdir(), "lao-daemon-secret-link-"));
  try {
    const real = join(dir, "real.txt"), link = join(dir, "link.txt");
    writeFileSync(real, token);
    symlinkSync(real, link);
    assert.throws(() => readLaoDashboardToken({ LAO_DASHBOARD_TOKEN_FILE: link }), /invalid/);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

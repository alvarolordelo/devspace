import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { createLaoResourceAlertHistory } from "./resource-alert-history.js";

test("resource pressure history persists transitions only and restores after restart", async () => {
  const dir = mkdtempSync(join(tmpdir(), "lao-resource-history-"));
  const file = join(dir, "alerts.jsonl");
  try {
    const history = createLaoResourceAlertHistory(file, 20);
    assert.equal(await history.record([], "2026-10-28T01:00:00.000Z"), false);
    assert.equal(await history.record(["ram_pressure"], "2026-10-28T01:00:10.000Z"), true);
    assert.equal(await history.record(["ram_pressure"], "2026-10-28T01:00:20.000Z"), false);
    assert.equal(await history.record(["vram_pressure", "cpu_pressure"], "2026-10-28T01:00:30.000Z"), true);
    assert.equal(await history.record([], "2026-10-28T01:00:40.000Z"), true);
    assert.deepEqual((await history.read()).map(item => item.warnings), [
      ["ram_pressure"], ["cpu_pressure", "vram_pressure"], [],
    ]);
    const reopened = createLaoResourceAlertHistory(file, 20);
    assert.deepEqual(await reopened.read(2), [
      { at: "2026-10-28T01:00:30.000Z", warnings: ["cpu_pressure", "vram_pressure"] },
      { at: "2026-10-28T01:00:40.000Z", warnings: [] },
    ]);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test("resource pressure history ignores malformed persisted lines and rejects unsafe input", async () => {
  const dir = mkdtempSync(join(tmpdir(), "lao-resource-history-bad-"));
  const file = join(dir, "alerts.jsonl");
  try {
    writeFileSync(file, [
      "not json",
      JSON.stringify({ at: "bad", warnings: ["ram_pressure"] }),
      JSON.stringify({ at: "2026-10-28T01:00:00.000Z", warnings: ["secret_pressure"] }),
      JSON.stringify({ at: "2026-10-28T01:00:10.000Z", warnings: ["cpu_pressure"] }),
      "",
    ].join("\n"));
    const history = createLaoResourceAlertHistory(file, 20);
    assert.deepEqual(await history.read(), [
      { at: "2026-10-28T01:00:10.000Z", warnings: ["cpu_pressure"] },
    ]);
    await assert.rejects(() => history.record(["invalid" as never]), /Invalid resource alert transition/);
    await assert.rejects(() => history.read(0), RangeError);
    assert.doesNotMatch(readFileSync(file, "utf8"), /token|prompt|process/i);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

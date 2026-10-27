import assert from "node:assert/strict";
import test from "node:test";
import { cpuUsagePercent, createLaoResourceMonitor, parseNvidiaSmiMetrics } from "./resource-metrics.js";

test("CPU utilization requires two valid readings and does not guess on reset", () => {
  assert.equal(cpuUsagePercent(null, { idle: 10, total: 20 }), null);
  assert.equal(cpuUsagePercent({ idle: 10, total: 20 }, { idle: 20, total: 40 }), 50);
  assert.equal(cpuUsagePercent({ idle: 10, total: 20 }, { idle: 10, total: 20 }), null);
  assert.equal(cpuUsagePercent({ idle: 20, total: 50 }, { idle: 10, total: 60 }), null);
  assert.equal(cpuUsagePercent({ idle: 10, total: 20 }, { idle: 90, total: 40 }), null);
});

test("GPU probe accepts bounded NVIDIA numbers only and refuses noisy output", () => {
  assert.deepEqual(parseNvidiaSmiMetrics("42, 256, 6144\r\n"), {
    utilizationPercent: 42, vramUsedMiB: 256, vramTotalMiB: 6144,
  });
  for (const input of ["", "N/A, 200, 6144", "-1, 200, 6144",
    "101, 200, 6144", "50, 7000, 6144", "5, 30, 0",
    "50, 0, 6144\n20, 0, 6144", "20, 30, 6144, extra",
    "20, 30, 6144; unexpected"] ) {
    assert.equal(parseNvidiaSmiMetrics(input), null, input);
  }
});

test("read-only resource monitor reports bounded host metrics and GPU unavailability", async () => {
  let probes = 0;
  const snapshot = createLaoResourceMonitor(async () => { probes++; return null; });
  const first = await snapshot();
  const second = await snapshot();
  assert.equal(probes, 2);
  assert.equal(first.gpu, null);
  assert.equal(second.gpu, null);
  assert.ok(Number.isFinite(first.ram.totalBytes) && first.ram.totalBytes > 0);
  assert.ok(first.ram.usedBytes >= 0 && first.ram.usedBytes <= first.ram.totalBytes);
  assert.ok(first.process.rssBytes > 0 && first.process.heapUsedBytes > 0);
  assert.ok(first.cpu.logicalCores >= 1);
  assert.equal(first.cpu.utilizationPercent, null);
  assert.ok(second.cpu.utilizationPercent === null ||
    second.cpu.utilizationPercent >= 0 && second.cpu.utilizationPercent <= 100);
});

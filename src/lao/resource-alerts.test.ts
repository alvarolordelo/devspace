import assert from "node:assert/strict";
import test from "node:test";
import { createLaoResourceAlertEvaluator } from "./resource-alerts.js";

test("LAO resource alerts require sustained pressure and clear on recovery", () => {
  let time = 1000;
  const evaluate = createLaoResourceAlertEvaluator(3, 8000, () => time);
  const high = {
    cpu: { utilizationPercent: 99 },
    ram: { utilizationPercent: 92 },
    gpu: { vramUsedMiB: 5770, vramTotalMiB: 6144 },
  };
  assert.deepEqual(evaluate(high).warnings, []);
  time += 10_000;
  assert.deepEqual(evaluate(high).warnings, []);
  time += 10_000;
  assert.deepEqual(evaluate(high).warnings,
    ["cpu_pressure", "ram_pressure", "vram_pressure"]);
  assert.deepEqual(evaluate(high).warnings,
    ["cpu_pressure", "ram_pressure", "vram_pressure"]);
  time += 10_000;
  assert.deepEqual(evaluate({
    cpu: { utilizationPercent: 20 },
    ram: { utilizationPercent: 30 },
    gpu: { vramUsedMiB: 100, vramTotalMiB: 6144 },
  }).warnings, []);
  time += 10_000;
  assert.deepEqual(evaluate(high).warnings, [], "streak must reset");
});

test("unavailable GPU and unknown CPU never report zero or fabricate pressure", () => {
  let time = 1000;
  const evaluate = createLaoResourceAlertEvaluator(2, 8000, () => time);
  const absent = {
    cpu: { utilizationPercent: null },
    ram: { utilizationPercent: null },
    gpu: null,
  };
  assert.deepEqual(evaluate(absent).warnings, []);
  time += 10_000;
  assert.deepEqual(evaluate(absent).warnings, []);
  const high = {
    cpu: { utilizationPercent: 100 },
    ram: { utilizationPercent: 95 },
    gpu: { vramUsedMiB: 100, vramTotalMiB: 100 },
  };
  assert.deepEqual(evaluate(high).warnings, []);
  time += 10_000;
  assert.deepEqual(evaluate(absent).warnings, []);
  time += 10_000;
  assert.deepEqual(evaluate(high).warnings, []);
  time += 10_000;
  assert.deepEqual(evaluate(high).warnings,
    ["cpu_pressure", "ram_pressure", "vram_pressure"]);
});

test("resource alert thresholds reject invalid samples and impossible capacity", () => {
  for (const value of [0, 1, 11, 2.5, NaN]) {
    assert.throws(() => createLaoResourceAlertEvaluator(value), RangeError);
  }
  let time = 1000;
  const evaluate = createLaoResourceAlertEvaluator(2, 8000, () => time);
  const broken = {
    cpu: { utilizationPercent: Infinity },
    ram: { utilizationPercent: 103 },
    gpu: { vramUsedMiB: 800, vramTotalMiB: 600 },
  };
  assert.deepEqual(evaluate(broken).warnings, []);
  time += 10_000;
  assert.deepEqual(evaluate(broken).warnings, []);
});

test("fast repeated requests cannot manufacture sustained resource pressure", () => {
  let time = 10_000;
  const evaluate = createLaoResourceAlertEvaluator(3, 8000, () => time);
  const reading = {
    cpu: { utilizationPercent: 97 },
    ram: { utilizationPercent: 91 },
    gpu: { vramUsedMiB: 95, vramTotalMiB: 100 },
  };
  for (let i = 0; i < 20; i++) {
    assert.deepEqual(evaluate(reading).warnings, []);
    time += 100;
  }
  time = 20_000;
  assert.deepEqual(evaluate(reading).warnings, []);
  time = 30_000;
  assert.deepEqual(evaluate(reading).warnings,
    ["cpu_pressure", "ram_pressure", "vram_pressure"]);
  // A long pause cannot preserve stale alerts as though they were current.
  time = 120_000;
  assert.deepEqual(evaluate(reading).warnings, []);
});

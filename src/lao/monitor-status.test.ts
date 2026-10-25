import assert from "node:assert/strict";
import test from "node:test";
import {
  evaluateLaoMonitor,
  type LaoHealth,
  type LaoHealthObservation,
  type LaoMonitorComponent,
} from "./monitor-status.js";

const at = 100_000;
const names: LaoMonitorComponent[] = ["service", "devspace-mcp", "ollama", "model"];

function healthy(): LaoHealthObservation[] {
  return names.map((component) => ({ component, health: "healthy", checkedAtMs: at }));
}

function change(
  observations: LaoHealthObservation[],
  component: LaoMonitorComponent,
  health: LaoHealth,
) {
  return observations.map((o) => o.component === component ? { ...o, health } : o);
}

test("all fresh, healthy components yield green active state", () => {
  const result = evaluateLaoMonitor({ enabled: true, observations: healthy(), nowMs: at });
  assert.equal(result.state, "active");
  assert.equal(result.label, "Ativo");
  assert.equal(result.components.ollama, "healthy");
});

test("a review pending yields yellow without misreporting services", () => {
  const result = evaluateLaoMonitor({
    enabled: true, observations: healthy(), nowMs: at, pendingReviews: 2,
  });
  assert.equal(result.state, "attention");
  assert.equal(result.label, "Aguardando revisão");
  assert.equal(result.components.service, "healthy");
});

test("Ollama offline degrades the UI but does not mark LAO service stopped", () => {
  const result = evaluateLaoMonitor({
    enabled: true,
    observations: change(healthy(), "ollama", "unhealthy"),
    nowMs: at,
  });
  assert.equal(result.state, "attention");
  assert.equal(result.components.service, "healthy");
  assert.equal(result.components.ollama, "unhealthy");
});

test("an unhealthy LAO service shows red offline state", () => {
  const result = evaluateLaoMonitor({
    enabled: true,
    observations: change(healthy(), "service", "unhealthy"),
    nowMs: at,
  });
  assert.equal(result.state, "offline");
  assert.equal(result.label, "Serviço parado");
});

test("disabled LAO is gray regardless of last observed component health", () => {
  const result = evaluateLaoMonitor({ enabled: false, observations: healthy(), nowMs: at });
  assert.equal(result.state, "idle");
  assert.equal(result.label, "Desativado");
});

test("stale service observation must not stay green", () => {
  const old = healthy().map((o) => ({ ...o, checkedAtMs: at - 15_001 }));
  const result = evaluateLaoMonitor({ enabled: true, observations: old, nowMs: at });
  assert.equal(result.state, "idle");
  assert.equal(result.components.service, "unknown");
});

test("missing dependency never produces green global status", () => {
  const result = evaluateLaoMonitor({
    enabled: true,
    observations: healthy().filter((o) => o.component !== "model"),
    nowMs: at,
  });
  assert.equal(result.state, "attention");
  assert.equal(result.components.model, "unknown");
});

test("newer measurements take precedence over older conflicting ones", () => {
  const result = evaluateLaoMonitor({
    enabled: true,
    observations: [
      ...healthy(), { component: "ollama", health: "unhealthy", checkedAtMs: at - 100 },
    ],
    nowMs: at,
  });
  assert.equal(result.state, "active");
});

test("future observations are not treated as fresh", () => {
  const result = evaluateLaoMonitor({
    enabled: true,
    observations: change(healthy(), "service", "healthy").map((o) =>
      o.component === "service" ? { ...o, checkedAtMs: at + 10 } : o),
    nowMs: at,
  });
  assert.equal(result.state, "idle");
});

test("invalid timing and review inputs are rejected", () => {
  assert.throws(() => evaluateLaoMonitor({
    enabled: true, observations: healthy(), nowMs: NaN,
  }), RangeError);
  assert.throws(() => evaluateLaoMonitor({
    enabled: true, observations: healthy(), nowMs: at, staleAfterMs: 0,
  }), RangeError);
  assert.throws(() => evaluateLaoMonitor({
    enabled: true, observations: healthy(), nowMs: at, pendingReviews: -1,
  }), RangeError);
});

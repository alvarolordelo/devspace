import assert from "node:assert/strict";
import test from "node:test";
import { loadLaoConfig } from "./config.js";

test("LAO remains disabled without explicit opt-in", () => {
  const config = loadLaoConfig({});
  assert.equal(config.enabled, false);
  assert.equal(config.ollamaUrl, "http://127.0.0.1:11434");
});
test("LAO requires exact boolean opt-in", () => {
  assert.equal(loadLaoConfig({ DEVSPACE_LAO_ENABLED: "true" }).enabled, true);
  assert.throws(() => loadLaoConfig({ DEVSPACE_LAO_ENABLED: "yes" }), /must be/);
});
test("remote URLs or credentials cannot be configured for Ollama", () => {
  for (const url of ["https://127.0.0.1:11434", "http://example.com:11434", "http://a:b@localhost:11434", "http://localhost:11434/api"]) {
    assert.throws(() => loadLaoConfig({ DEVSPACE_LAO_OLLAMA_URL: url }), /loopback/);
  }
});

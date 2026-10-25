import assert from "node:assert/strict";
import test from "node:test";
import { loadLaoConfig } from "./config.js";
import { LaoOllamaClient, LaoOllamaError } from "./ollama-client.js";

const config = loadLaoConfig({ DEVSPACE_LAO_ENABLED: "true" });
function mock(json: unknown, inspect?: (url: string, init: RequestInit) => void): typeof fetch {
  return (async (input: RequestInfo | URL, init: RequestInit = {}) => {
    inspect?.(String(input), init);
    return new Response(JSON.stringify(json), { status: 200 });
  }) as typeof fetch;
}
test("disabled mode never calls the network", async () => {
  const client = new LaoOllamaClient(loadLaoConfig({}), async () => { throw new Error("unexpected network"); });
  await assert.rejects(client.listModels(), (err: unknown) => err instanceof LaoOllamaError && err.code === "DISABLED");
});
test("lists models from actual Ollama contract", async () => {
  const client = new LaoOllamaClient(config, mock({ models: [{ name: "granite4.2-8b:gpu", size: 123 }] }));
  assert.deepEqual(await client.listModels(), [{ name: "granite4.2-8b:gpu", size: 123 }]);
});
test("tool support is determined from /api/show capabilities", async () => {
  const client = new LaoOllamaClient(config, mock({ capabilities: ["completion", "tools"] }));
  assert.equal((await client.inspectModel("granite4.2-8b:gpu")).supportsTools, true);
});
test("read-only Ollama chat sends no tool definitions or shell access", async () => {
  const client = new LaoOllamaClient(config, mock({
    done: true, message: { role: "assistant", content: "README analyzed" },
  }, (url, init) => {
    assert.equal(url, "http://127.0.0.1:11434/api/chat");
    const input = JSON.parse(String(init.body));
    assert.equal(input.stream, false);
    assert.equal(input.tools, undefined);
    assert.equal(input.options.num_predict, 12);
  }));
  assert.equal(await client.chatReadOnly("Summarize README", { maxOutputTokens: 12 }), "README analyzed");
});
test("offline, invalid responses, timeouts and cancellation are distinguishable", async () => {
  const offline = new LaoOllamaClient(config, (async () => { throw new TypeError("ECONNREFUSED"); }) as typeof fetch);
  await assert.rejects(offline.listModels(), (e: unknown) => e instanceof LaoOllamaError && e.code === "OFFLINE");
  const invalid = new LaoOllamaClient(config, mock({ done: false, message: { role: "assistant", content: "" } }));
  await assert.rejects(invalid.chatReadOnly("Hi"), (e: unknown) => e instanceof LaoOllamaError && e.code === "INVALID_RESPONSE");
  const pending = new LaoOllamaClient(config, ((_: unknown, init: RequestInit) => new Promise((_ok, reject) => {
    init.signal?.addEventListener("abort", () => reject(new Error("aborted")), { once: true });
  })) as typeof fetch);
  await assert.rejects(pending.listModels({ timeoutMs: 10 }), (e: unknown) => e instanceof LaoOllamaError && e.code === "TIMEOUT");
  const cancelled = new AbortController();
  cancelled.abort();
  await assert.rejects(pending.listModels({ signal: cancelled.signal }), (e: unknown) => e instanceof LaoOllamaError && e.code === "CANCELLED");
});

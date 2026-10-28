import assert from "node:assert/strict";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { createLaoDevspaceProbe } from "./devspace-probe.js";

test("MCP probe requires a successful authenticated tool listing", async () => {
  const root = mkdtempSync(join(tmpdir(), "lao-mcp-probe-"));
  try {
    const tokenFile = join(root, "token.txt");
    const token = "a".repeat(43);
    writeFileSync(tokenFile, token);
    let calls = 0;
    const transport = (async (_url: URL, init: RequestInit) => {
      calls++;
      assert.equal((init.headers as Record<string, string>).authorization, `Bearer ${token}`);
      assert.equal(JSON.parse(String(init.body)).method, "tools/list");
      return new Response(JSON.stringify({ jsonrpc: "2.0", result: { tools: [
        { name: "open_workspace" }, { name: "read" },
      ] }}), { status: 200, headers: { "content-type": "application/json" } });
    }) as typeof fetch;
    const probe = createLaoDevspaceProbe({ LAO_DEVSPACE_MCP_TOKEN_FILE: tokenFile }, transport);
    assert.equal(await probe(), "connected");
    assert.equal(await probe(), "connected");
    assert.equal(calls, 1, "short cache prevents repeated authentication requests");
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test("missing credential and authentication rejection remain unverified", async () => {
  const unauthorized = (async () => new Response("", { status: 401 })) as typeof fetch;
  assert.equal(await createLaoDevspaceProbe({}, unauthorized)(), "unverified");
  const root = mkdtempSync(join(tmpdir(), "lao-mcp-probe-"));
  try {
    const tokenFile = join(root, "token.txt");
    writeFileSync(tokenFile, "a".repeat(43));
    assert.equal(await createLaoDevspaceProbe({ LAO_DEVSPACE_MCP_TOKEN_FILE: tokenFile }, unauthorized)(), "unverified");
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test("only repeated refused connections prove offline", async () => {
  let calls = 0;
  const refused = (async () => {
    calls++;
    throw Object.assign(new TypeError("fetch failed"), { cause: { code: "ECONNREFUSED" } });
  }) as typeof fetch;
  assert.equal(await createLaoDevspaceProbe({}, refused)(), "offline");
  assert.equal(calls, 2);
  const timeout = (async () => { throw new DOMException("timeout", "TimeoutError"); }) as typeof fetch;
  assert.equal(await createLaoDevspaceProbe({}, timeout)(), "unverified");
});

test("probe rejects non-loopback endpoints and relative credential paths", () => {
  assert.throws(() => createLaoDevspaceProbe({ LAO_DEVSPACE_MCP_URL: "https://example.com/mcp" }), /loopback/);
  assert.throws(() => createLaoDevspaceProbe({ LAO_DEVSPACE_MCP_TOKEN_FILE: "token.txt" }), /absolute/);
});

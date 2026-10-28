import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { once } from "node:events";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

test("dedicated LAO OAuth setup uses the owner flow and saves renewable credentials", {
  skip: process.platform !== "win32",
}, async () => {
  const root = mkdtempSync(join(tmpdir(), "lao-oauth-setup-"));
  const accessToken = "a".repeat(43);
  const refreshToken = "r".repeat(43);
  const clientId = "devspace-00000000-0000-4000-8000-000000000001";
  let tokenExchanges = 0;
  const server = createServer(async (req, res) => {
    const local = `http://127.0.0.1:${(server.address() as { port: number }).port}`;
    if (req.url === "/mcp") {
      res.writeHead(401, { "www-authenticate":
        `Bearer resource_metadata="${local}/.well-known/oauth-protected-resource/mcp"` });
      res.end(); return;
    }
    const parts: Uint8Array[] = [];
    for await (const part of req) parts.push(part as Uint8Array);
    const body = Buffer.concat(parts).toString("utf8");
    if (req.url === "/register") {
      const data = JSON.parse(body);
      assert.equal(data.client_name, "LAO DevSpace Monitor");
      assert.match(data.redirect_uris[0], /^http:\/\/127\.0\.0\.1:\d+\/callback$/);
      res.writeHead(201, { "content-type": "application/json" });
      res.end(JSON.stringify({ client_id: clientId })); return;
    }
    if (req.url === "/authorize") {
      const form = new URLSearchParams(body);
      assert.equal(form.get("owner_token"), "test-owner-password");
      assert.equal(form.get("resource"), `${local}/mcp`);
      assert.equal(form.get("code_challenge_method"), "S256");
      const redirect = new URL(form.get("redirect_uri")!);
      redirect.searchParams.set("code", "test-code");
      redirect.searchParams.set("state", form.get("state")!);
      res.writeHead(302, { location: redirect.href }); res.end(); return;
    }
    if (req.url === "/token") {
      const form = new URLSearchParams(body);
      assert.equal(form.get("grant_type"), "authorization_code");
      assert.equal(form.get("client_id"), clientId);
      assert.equal(form.get("code"), "test-code");
      assert.ok(form.get("code_verifier"));
      tokenExchanges++;
      res.writeHead(200, { "content-type": "application/json" });
      res.end(JSON.stringify({ access_token: accessToken, refresh_token: refreshToken,
        token_type: "bearer", expires_in: 3600 })); return;
    }
    res.writeHead(404); res.end();
  });
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  const port = (server.address() as { port: number }).port;
  const script = fileURLToPath(new URL("../../scripts/authorize-lao-devspace.mjs", import.meta.url));
  const child = spawn(process.execPath, [script, "--manual"], {
    env: { ...process.env, LOCALAPPDATA: root,
      LAO_DEVSPACE_MCP_URL: `http://127.0.0.1:${port}/mcp` },
    windowsHide: true, stdio: ["ignore", "pipe", "pipe"],
  });
  const exit = once(child, "exit");
  let stdout = "";
  let stderr = "";
  child.stderr.on("data", part => { stderr += String(part); });
  try {
    let timer: NodeJS.Timeout;
    const authorizeUrl = await Promise.race([
      new Promise<string>(resolve => child.stdout.on("data", part => {
        stdout += String(part);
        const found = /http:\/\/127\.0\.0\.1:\d+\/authorize\?[^\r\n]+/.exec(stdout);
        if (found) resolve(found[0]);
      })),
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => reject(new Error(stderr || "OAuth URL missing")), 10_000);
      }),
    ]).finally(() => clearTimeout(timer));
    const url = new URL(authorizeUrl);
    const form = new URLSearchParams(url.search);
    form.set("owner_token", "test-owner-password");
    const approval = await fetch(url.origin + url.pathname, { method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: form, redirect: "manual" });
    assert.equal(approval.status, 302);
    assert.equal((await fetch(approval.headers.get("location")!)).status, 200);
    const [code] = await exit;
    assert.equal(code, 0, stderr);
    const saved = JSON.parse(readFileSync(join(root, "LAODevSpace", "devspace-mcp-token.txt"), "utf8"));
    assert.equal(saved.accessToken, accessToken);
    assert.equal(saved.refreshToken, refreshToken);
    assert.equal(saved.clientId, clientId);
    assert.equal(saved.resource, `http://127.0.0.1:${port}/mcp`);
    assert.equal(tokenExchanges, 1);
    assert.doesNotMatch(stdout + stderr, new RegExp(accessToken));
  } finally {
    child.kill();
    server.closeAllConnections();
    await new Promise<void>(resolve => server.close(() => resolve()));
    rmSync(root, { recursive: true, force: true });
  }
});

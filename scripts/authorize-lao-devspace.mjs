// Authorize a dedicated, refreshable LAO client through DevSpace's existing
// owner-approved OAuth flow. No owner password is read or stored by this script.
import { createHash, randomBytes } from "node:crypto";
import { createServer } from "node:http";
import { mkdir, readFile, rename, writeFile, rm } from "node:fs/promises";
import { join } from "node:path";
import { spawn } from "node:child_process";

const base = new URL(process.env.LAO_DEVSPACE_MCP_URL ?? "http://127.0.0.1:7676/mcp");
const manual = process.argv.length === 3 && process.argv[2] === "--manual";
if (process.argv.length > (manual ? 3 : 2)) throw new Error("Only --manual is supported");
if (process.platform !== "win32" || base.protocol !== "http:" ||
    base.hostname !== "127.0.0.1" || base.pathname !== "/mcp" ||
    base.username || base.password || base.search || base.hash) {
  throw new Error("This authorization flow requires a Windows loopback DevSpace /mcp endpoint");
}
const dataDir = join(process.env.LOCALAPPDATA ?? "", "LAODevSpace");
if (!process.env.LOCALAPPDATA) throw new Error("LOCALAPPDATA is required");
const destination = join(dataDir, "devspace-mcp-token.txt");
try {
  if ((await readFile(destination, "utf8")).trim()) {
    throw new Error("A LAO OAuth credential already exists; remove it only if reauthorization is needed");
  }
} catch (error) {
  if (error?.code !== "ENOENT") throw error;
}

const challengeResponse = await fetch(base, { redirect: "manual", signal: AbortSignal.timeout(3000) });
const challengeHeader = challengeResponse.headers.get("www-authenticate") ?? "";
await challengeResponse.body?.cancel();
const metadata = /resource_metadata="([^"]+)"/.exec(challengeHeader)?.[1];
if (challengeResponse.status !== 401 || !metadata) {
  throw new Error("DevSpace did not provide its OAuth resource challenge");
}
const metadataUrl = new URL(metadata);
const resource = new URL("/mcp", metadataUrl);
if (metadataUrl.pathname !== "/.well-known/oauth-protected-resource/mcp" ||
    !["https:", "http:"].includes(resource.protocol) ||
    (resource.protocol === "http:" && resource.hostname !== "127.0.0.1")) {
  throw new Error("DevSpace OAuth resource is invalid");
}

const state = randomBytes(24).toString("base64url");
const verifier = randomBytes(48).toString("base64url");
const challenge = createHash("sha256").update(verifier).digest("base64url");
let acceptCode;
const codePromise = new Promise((resolve, reject) => { acceptCode = { resolve, reject }; });
const callback = createServer((request, response) => {
  const path = new URL(request.url ?? "/", "http://127.0.0.1");
  if (request.method !== "GET" || path.pathname !== "/callback" ||
      path.searchParams.get("state") !== state) {
    response.writeHead(400); response.end("Invalid authorization response"); return;
  }
  const code = path.searchParams.get("code");
  if (!code || code.length > 512) {
    response.writeHead(400); response.end("Authorization was not completed"); return;
  }
  response.writeHead(200, { "content-type": "text/plain; charset=utf-8", "cache-control": "no-store" });
  response.end("DevSpace authorization received. You may close this tab.");
  acceptCode.resolve(code);
});
callback.listen(0, "127.0.0.1");
await new Promise((resolve, reject) => {
  callback.once("listening", resolve);
  callback.once("error", reject);
});
const address = callback.address();
if (!address || typeof address === "string") throw new Error("OAuth callback listener failed");
const redirectUri = `http://127.0.0.1:${address.port}/callback`;

try {
  const registration = await fetch(new URL("/register", base), {
    method: "POST", redirect: "manual",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      client_name: "LAO DevSpace Monitor",
      redirect_uris: [redirectUri],
      grant_types: ["authorization_code", "refresh_token"],
      response_types: ["code"], token_endpoint_auth_method: "none",
    }), signal: AbortSignal.timeout(3000),
  });
  const client = registration.status === 201 ? await registration.json() : null;
  if (!client?.client_id || !/^devspace-[a-f0-9-]{36}$/i.test(client.client_id)) {
    throw new Error("DevSpace rejected OAuth client registration");
  }
  const authorize = new URL("/authorize", base);
  authorize.search = new URLSearchParams({
    client_id: client.client_id, redirect_uri: redirectUri,
    response_type: "code", code_challenge: challenge,
    code_challenge_method: "S256", scope: "devspace",
    resource: resource.href, state,
  }).toString();
  if (!manual) {
    const browser = spawn("rundll32.exe", ["url.dll,FileProtocolHandler", authorize.href], {
      detached: true, stdio: "ignore", windowsHide: true,
    });
    browser.on("error", () => { /* URL remains available below. */ });
    browser.unref();
  }
  console.log("Authorize LAO in the DevSpace browser page. If it did not open, use:");
  console.log(authorize.href);
  let deadline;
  const code = await Promise.race([
    codePromise,
    new Promise((_, reject) => {
      deadline = setTimeout(() => reject(new Error("OAuth authorization timed out")), 900_000);
    }),
  ]).finally(() => clearTimeout(deadline));
  const exchange = await fetch(new URL("/token", base), {
    method: "POST", redirect: "manual",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "authorization_code", client_id: client.client_id,
      code, code_verifier: verifier, redirect_uri: redirectUri,
      resource: resource.href,
    }), signal: AbortSignal.timeout(3000),
  });
  const tokens = exchange.status === 200 ? await exchange.json() : null;
  const valid = value => typeof value === "string" && /^[A-Za-z0-9_-]{32,128}$/.test(value);
  if (!valid(tokens?.access_token) || !valid(tokens?.refresh_token) ||
      tokens?.token_type?.toLowerCase() !== "bearer" ||
      !Number.isSafeInteger(tokens?.expires_in) || tokens.expires_in <= 0) {
    throw new Error("DevSpace did not issue a renewable LAO OAuth credential");
  }
  await mkdir(dataDir, { recursive: true, mode: 0o700 });
  const temporary = join(dataDir, `.lao-oauth-${randomBytes(8).toString("hex")}.tmp`);
  try {
    await writeFile(temporary, JSON.stringify({
      accessToken: tokens.access_token, refreshToken: tokens.refresh_token,
      clientId: client.client_id, resource: resource.href,
      expiresAt: Date.now() + tokens.expires_in * 1000,
    }), { mode: 0o600, flag: "wx" });
    await rename(temporary, destination);
  } finally { await rm(temporary, { force: true }).catch(() => undefined); }
  console.log(`LAO OAuth authorization saved to ${destination}`);
} finally {
  callback.closeAllConnections();
  await new Promise(resolve => callback.close(resolve));
}

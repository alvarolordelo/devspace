import { readFile, stat, rename, writeFile, rm } from "node:fs/promises";
import { dirname, isAbsolute, join } from "node:path";
import { randomBytes } from "node:crypto";

export type LaoDevspaceStatus = "connected" | "unverified" | "offline";
interface LaoOAuthCredential {
  accessToken: string;
  refreshToken: string;
  clientId: string;
  resource: string;
  expiresAt: number;
}
const tokenPattern = /^[A-Za-z0-9_-]{32,128}$/;

function parseCredential(raw: string): string | LaoOAuthCredential | undefined {
  const value = raw.trim();
  if (tokenPattern.test(value)) return value;
  try {
    const item = JSON.parse(value) as LaoOAuthCredential;
    const resource = new URL(item.resource);
    if (tokenPattern.test(item.accessToken) && tokenPattern.test(item.refreshToken) &&
        /^devspace-[a-f0-9-]{36}$/i.test(item.clientId) &&
        Number.isFinite(item.expiresAt) && resource.pathname === "/mcp" &&
        (resource.protocol === "https:" || (resource.protocol === "http:" &&
          resource.hostname === "127.0.0.1"))) return item;
  } catch { /* Invalid or incomplete credential. */ }
  return undefined;
}

/** A successful authenticated MCP tool listing is the only positive signal. */
export function createLaoDevspaceProbe(
  env: NodeJS.ProcessEnv = process.env,
  transport: typeof fetch = fetch,
): () => Promise<LaoDevspaceStatus> {
  const rawUrl = env.LAO_DEVSPACE_MCP_URL ?? "http://127.0.0.1:7676/mcp";
  const url = new URL(rawUrl);
  if (url.protocol !== "http:" || url.hostname !== "127.0.0.1" ||
      url.username || url.password || url.search || url.hash || url.pathname !== "/mcp") {
    throw new Error("LAO DevSpace MCP probe requires a loopback /mcp URL");
  }
  // A supervised daemon can restart without re-running its PowerShell launcher.
  // Resolve the OAuth file in the daemon as well so newly authorized access is picked up.
  const tokenFile = env.LAO_DEVSPACE_MCP_TOKEN_FILE ??
    (process.platform === "win32" && env.LOCALAPPDATA
      ? join(env.LOCALAPPDATA, "LAODevSpace", "devspace-mcp-token.txt") : undefined);
  if (tokenFile && !isAbsolute(tokenFile)) {
    throw new Error("LAO DevSpace MCP token file must be absolute");
  }
  let last: { status: LaoDevspaceStatus; at: number } | undefined;
  let pending: Promise<LaoDevspaceStatus> | undefined;
  const check = async (): Promise<LaoDevspaceStatus> => {
    let credential: string | LaoOAuthCredential | undefined;
    if (tokenFile) {
      try {
        if ((await stat(tokenFile)).size > 2048) return "unverified";
        credential = parseCredential(await readFile(tokenFile, "utf8"));
      } catch { return "unverified"; }
      if (!credential) return "unverified";
    }
    const refresh = async (): Promise<string | undefined> => {
      if (!tokenFile || !credential || typeof credential === "string") return undefined;
      try {
        const response = await transport(new URL("/token", url), {
          method: "POST", redirect: "manual",
          headers: { "content-type": "application/x-www-form-urlencoded" },
          body: new URLSearchParams({
            grant_type: "refresh_token", client_id: credential.clientId,
            refresh_token: credential.refreshToken, resource: credential.resource,
          }),
          signal: AbortSignal.timeout(3000),
        });
        if (response.status !== 200) { await response.body?.cancel(); return undefined; }
        const data = await response.json() as {
          access_token?: string; refresh_token?: string; token_type?: string; expires_in?: number;
        };
        if (!tokenPattern.test(data.access_token ?? "") ||
            !tokenPattern.test(data.refresh_token ?? "") ||
            data.token_type?.toLowerCase() !== "bearer" ||
            !Number.isSafeInteger(data.expires_in) || (data.expires_in ?? 0) <= 0) return undefined;
        const updated: LaoOAuthCredential = {
          ...credential, accessToken: data.access_token!, refreshToken: data.refresh_token!,
          expiresAt: Date.now() + data.expires_in! * 1000,
        };
        const temporary = join(dirname(tokenFile), `.lao-mcp-${randomBytes(8).toString("hex")}.tmp`);
        try {
          await writeFile(temporary, JSON.stringify(updated), { mode: 0o600, flag: "wx" });
          await rename(temporary, tokenFile);
        } finally { await rm(temporary, { force: true }).catch(() => undefined); }
        credential = updated;
        return updated.accessToken;
      } catch { return undefined; }
    };
    if (credential && typeof credential !== "string" && credential.expiresAt - Date.now() < 30_000) {
      if (!await refresh()) return "unverified";
    }
    let unauthorized = false;
    const attempt = async (): Promise<LaoDevspaceStatus> => {
      try {
        const token = typeof credential === "string" ? credential : credential?.accessToken;
        const response = await transport(url, {
          method: "POST",
          headers: {
            "content-type": "application/json",
            "accept": "application/json, text/event-stream",
            "mcp-method": "tools/list",
            "mcp-protocol-version": "2026-07-28",
            ...(token ? { authorization: `Bearer ${token}` } : {}),
          },
          body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/list", params: {
            _meta: {
              "io.modelcontextprotocol/protocolVersion": "2026-07-28",
              "io.modelcontextprotocol/clientCapabilities": {},
              "io.modelcontextprotocol/clientInfo": { name: "lao-monitor", version: "1" },
            },
          }}),
          signal: AbortSignal.timeout(3000),
        });
        unauthorized = response.status === 401;
        if (!token || response.status !== 200 ||
            !response.headers.get("content-type")?.includes("application/json")) {
          await response.body?.cancel();
          return "unverified";
        }
        const data = await response.json() as {
          jsonrpc?: string; result?: { tools?: Array<{ name?: string }> }; error?: unknown;
        };
        const names = data.result?.tools?.map(item => item.name);
        return data.jsonrpc === "2.0" && !data.error &&
          names?.includes("open_workspace") && names.includes("read")
          ? "connected" : "unverified";
      } catch (error) {
        // Refused connections prove the listener is absent. Timeouts and other
        // transport errors do not establish that the service is down.
        const cause = (error as { cause?: { code?: string } })?.cause;
        return cause?.code === "ECONNREFUSED" ? "offline" : "unverified";
      }
    };
    const first = await attempt();
    if (unauthorized && credential && typeof credential !== "string" &&
        await refresh()) return attempt();
    if (first !== "offline") return first;
    // A second refused connection avoids reacting to a transient handover.
    return (await attempt()) === "offline" ? "offline" : "unverified";
  };
  return () => {
    if (last && Date.now() - last.at < 10_000) return Promise.resolve(last.status);
    pending ??= check().then(status => {
      last = { status, at: Date.now() };
      return status;
    }).finally(() => { pending = undefined; });
    return pending;
  };
}

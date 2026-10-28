import { readFile, stat } from "node:fs/promises";
import { isAbsolute } from "node:path";

export type LaoDevspaceStatus = "connected" | "unverified" | "offline";

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
  const tokenFile = env.LAO_DEVSPACE_MCP_TOKEN_FILE;
  if (tokenFile && !isAbsolute(tokenFile)) {
    throw new Error("LAO DevSpace MCP token file must be absolute");
  }
  let last: { status: LaoDevspaceStatus; at: number } | undefined;
  let pending: Promise<LaoDevspaceStatus> | undefined;
  const check = async (): Promise<LaoDevspaceStatus> => {
    let token: string | undefined;
    if (tokenFile) {
      try {
        if ((await stat(tokenFile)).size > 256) return "unverified";
        const value = (await readFile(tokenFile, "utf8")).trim();
        if (/^[A-Za-z0-9_-]{32,128}$/.test(value)) token = value;
      } catch { return "unverified"; }
      if (!token) return "unverified";
    }
    const attempt = async (): Promise<LaoDevspaceStatus> => {
      try {
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

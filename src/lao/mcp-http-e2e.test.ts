import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { once } from "node:events";
import { existsSync, mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { createServer as httpServer } from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { loadConfig } from "../config.js";
import { SqliteOAuthStore } from "../oauth-store.js";
import { createServer } from "../server.js";
import { writeTestDevspaceConfig } from "../test-support/config.test.js";

test("authenticated real HTTP MCP exposes opt-in LAO and delegates through bounded fake Ollama", async (t) => {
  const root = mkdtempSync(join(tmpdir(), "lao-http-e2e-"));
  const work = join(root, "project");
  mkdirSync(work);
  const git = (...args: string[]) => execFileSync("git", ["-C", work, ...args], {
    windowsHide: true, encoding: "utf8",
  }).trim();
  git("init", "-b", "feature/http-e2e");
  writeFileSync(join(work, "README.md"), "Temporary MCP test workspace");
  git("add", ".");
  git("-c", "user.name=LAO Test", "-c", "user.email=lao-test@example.invalid",
    "commit", "-m", "baseline");
  const live = process.env.LAO_MCP_LIVE === "true";
  const called = { chat: 0, toolsFromModel: false };
  const mock = httpServer(async (req, res) => {
    const chunks: Uint8Array[] = [];
    for await (const chunk of req) chunks.push(chunk as Uint8Array);
    const raw = Buffer.concat(chunks).toString("utf8");
    const body = raw ? JSON.parse(raw) as Record<string, unknown> : {};
    const send = (payload: object) => {
      res.writeHead(200, { "content-type": "application/json" }); res.end(JSON.stringify(payload));
    };
    if (req.url === "/api/tags") { send({ models: [{ name: "mock-granite:latest" }] }); return; }
    if (req.url === "/api/show") { send({ capabilities: ["tools"] }); return; }
    if (req.url === "/api/chat") {
      called.chat++;
      called.toolsFromModel = "tools" in body;
      const firstMessage = (body.messages as Array<{content: string}> | undefined)?.[0]?.content ?? "";
      const content = firstMessage.includes("You propose a text patch only")
        ? "*** Begin Patch\n*** Add File: src/fixture.ts\n+export const fixture = true;\n*** End Patch"
        : "Bounded analysis from fake local model";
      send({ done: true, message: { role: "assistant", content } });
      return;
    }
    res.writeHead(404); res.end();
  });
  mock.listen(0, "127.0.0.1");
  await once(mock, "listening");
  const m = mock.address();
  assert.ok(m && typeof m !== "string");
  const url = "http://127.0.0.1:" + m.port;
  const config = loadConfig(writeTestDevspaceConfig(join(root, "config"), {
    server: { publicBaseUrl: "https://agent.example.com" },
    storage: { stateDir: join(root, "state") },
    workspaces: { allowedRoots: [root] },
    logging: { level: "silent" },
  }));
  const bearer = "https://agent.example.com/mcp";
  const store = new SqliteOAuthStore(config.stateDir);
  const client = store.registerClient({
    redirect_uris: ["https://chatgpt.com/connector_platform_oauth_redirect"],
  }, config.oauth.allowedRedirectHosts);
  store.saveAccessToken(createHash("sha256").update(bearer).digest("base64url"), {
    clientId: client.client_id, scopes: ["devspace"],
    expiresAt: Math.floor(Date.now()/1000) + 3600, resource: bearer,
  });
  store.close();
  const tracked = ["DEVSPACE_LAO_ENABLED", "DEVSPACE_LAO_OLLAMA_URL", "DEVSPACE_LAO_MODEL"];
  const original = Object.fromEntries(tracked.map(k=>[k,process.env[k]])) as Record<string,string|undefined>;
  let running: ReturnType<typeof createServer>;
  try {
    process.env.DEVSPACE_LAO_ENABLED = "true";
    process.env.DEVSPACE_LAO_OLLAMA_URL = live ? "http://127.0.0.1:11434" : url;
    process.env.DEVSPACE_LAO_MODEL = live ? "granite4.2-8b:gpu" : "mock-granite:latest";
    running = createServer(config);
  } finally {
    for (const key of tracked) {
      if (original[key] === undefined) delete process.env[key];
      else process.env[key] = original[key];
    }
  }
  const listener = running.app.listen(0,"127.0.0.1");
  await once(listener,"listening");
  t.after(async () => {
    await running.close();
    listener.closeAllConnections();
    await new Promise<void>((resolve,reject)=>listener.close(err=>err?reject(err):resolve()));
    await new Promise<void>((resolve,reject)=>mock.close(err=>err?reject(err):resolve()));
    rmSync(root,{recursive:true,force:true});
  });
  const a = listener.address();
  assert.ok(a && typeof a !== "string");
  const endpoint = "http://127.0.0.1:" + a.port + "/mcp";
  let id = 0;
  const rpc = async (method: string, params: object, authenticated = true) => {
    const response = await fetch(endpoint, {
      method: "POST", headers: {
        ...(authenticated ? { Authorization: "Bearer " + bearer } : {}),
        "content-type": "application/json",
        "mcp-method": method,
        "mcp-protocol-version": "2026-07-28",
        ...("name" in params && typeof params.name === "string" ? { "mcp-name": params.name } : {}),
      },
      body: JSON.stringify({
        jsonrpc: "2.0", id: ++id, method,
        params: { ...params, _meta: {
          "io.modelcontextprotocol/protocolVersion": "2026-07-28",
          "io.modelcontextprotocol/clientCapabilities": {},
          "io.modelcontextprotocol/clientInfo": { name: "lao-http-e2e", version: "1" },
        }},
      }),
      signal: AbortSignal.timeout(15000),
    });
    const text = await response.text();
    return { status: response.status, data: JSON.parse(text) as {
      result?: { tools?: Array<{name: string}>; structuredContent?: Record<string,any>; isError?: boolean },
      error?: unknown,
    } };
  };
  assert.equal((await rpc("tools/list",{},false)).status,401);
  const listed = await rpc("tools/list",{});
  assert.equal(listed.status,200);
  assert.ok(listed.data.result?.tools?.some(x=>x.name==="lao_delegate"));
  assert.ok(listed.data.result?.tools?.some(x=>x.name==="lao_result"));
  const open = await rpc("tools/call",{ name:"open_workspace", arguments:{path:work} });
  assert.equal(open.status,200);
  const workspaceId = open.data.result?.structuredContent?.workspace_id;
  assert.equal(typeof workspaceId,"string");
  const delegated = await rpc("tools/call",{ name:"lao_delegate", arguments:{
    workspace_id: workspaceId, goal:"Explain the feature safely",
    acceptance_criteria:["Provide one sentence"],
  }});
  assert.equal(delegated.status,200);
  const data = delegated.data.result?.structuredContent;
  assert.equal(data?.status,"awaiting_review");
  assert.equal(data?.criteria_verified,false);
  if (!live) {
    assert.equal(called.chat,1);
    assert.equal(called.toolsFromModel,false);
  } else {
    assert.equal(called.chat,0,"auth MCP must use the local Ollama, not the fake server");
  }
  const taskId = data?.task_id;
  assert.equal(typeof taskId,"string");
  const result = await rpc("tools/call",{name:"lao_result",arguments:{
    workspace_id: workspaceId, task_id: taskId,
  }});
  assert.equal(result.data.result?.structuredContent?.task?.status,"awaiting_review");
  assert.equal(result.data.result?.structuredContent?.runs?.[0]?.status,"completed");
  const denied = await rpc("tools/call",{name:"lao_result",arguments:{
    workspace_id:"fake-ws",task_id:taskId,
  }});
  assert.equal(denied.data.result?.structuredContent?.task,undefined);
  assert.equal((await rpc("tools/call",{name:"lao_result",arguments:{
    workspace_id:workspaceId,task_id:taskId,
  }},false)).status,401);
  {
    const prepared = await rpc("tools/call",{ name:"lao_write_prepare", arguments:{
      source_workspace_id: workspaceId, goal:"Add one bounded fixture",
      acceptance_criteria:["Fixture constant is true"],
      allowed_write_paths:["src/fixture.ts"],
    }});
    assert.equal(prepared.data.result?.structuredContent?.status,"created");
    const managedId = prepared.data.result?.structuredContent?.workspace_id;
    const writeTask = prepared.data.result?.structuredContent?.task_id;
    assert.equal(typeof managedId, "string");
    assert.equal(typeof writeTask, "string");
    const written = await rpc("tools/call",{name:"lao_write_run",arguments:{
      workspace_id:managedId,task_id:writeTask,
    }});
    assert.equal(written.data.result?.structuredContent?.status,"awaiting_review");
    const validated = await rpc("tools/call",{name:"lao_write_validate",arguments:{
      workspace_id:managedId,task_id:writeTask,
    }});
    assert.equal(validated.data.result?.structuredContent?.staticChecksPassed,true);
    const deniedApproval = await rpc("tools/call",{name:"lao_review",arguments:{
      workspace_id:managedId,task_id:writeTask,decision:"approved",
      criteria_verified:true,evidence:["Not accepted"],note:"Test",
    }});
    assert.equal(deniedApproval.data.result?.isError,true);
    assert.equal(existsSync(join(work,"src","fixture.ts")),false);
    assert.equal(git("status","--porcelain"),"");
  }
  if (live) console.log("Authenticated MCP + real Granite: task persisted and awaiting review");
});

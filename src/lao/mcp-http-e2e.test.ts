import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { once } from "node:events";
import { existsSync, mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { createServer as httpServer } from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { loadConfig } from "../config.js";
import { SqliteOAuthStore } from "../oauth-store.js";
import { createServer } from "../server.js";
import { writeTestDevspaceConfig } from "../test-support/config.test.js";
import { createLaoDevspaceProbe } from "./devspace-probe.js";
import { SqliteWorkspaceStore } from "../workspace-store.js";
import { WorkspaceRegistry } from "../workspaces.js";

test("authenticated MCP runs LAO with bounded fake or optional live Ollama", async (t) => {
  const live = process.env.LAO_MCP_LIVE === "true";
  // Deliberately outside CI: a scripted supervisor may only promote a
  // disposable fixture with real Ollama AND real offline Docker evidence.
  const promotionLive = process.env.LAO_MCP_PROMOTION_LIVE === "true";
  if (promotionLive && (!live || !process.env.LAO_SANDBOX_NODE_IMAGE)) {
    throw new Error("Live promotion smoke requires LAO_MCP_LIVE and a pinned Docker image");
  }
  const root = mkdtempSync(join(tmpdir(), "lao-http-e2e-"));
  const work = join(root, "project");
  mkdirSync(work);
  const git = (...args: string[]) => execFileSync("git", ["-C", work, ...args], {
    windowsHide: true, encoding: "utf8",
  }).trim();
  git("init", "-b", "feature/http-e2e");
  writeFileSync(join(work, "README.md"), "Temporary MCP test workspace");
  mkdirSync(join(work, "tests"));
  writeFileSync(join(work, "tests", "fixture.test.mjs"), [
    'import test from "node:test";',
    'import assert from "node:assert/strict";',
    'import { readFileSync } from "node:fs";',
    'test("model patch contains approved boolean fixture", () => {',
    '  const source = readFileSync("/workspace/src/fixture.ts", "utf8");',
    '  assert.match(source, /fixture\\s*=\\s*true/);',
    '});', "",
  ].join("\n"));
  git("add", ".");
  git("-c", "user.name=LAO Test", "-c", "user.email=lao-test@example.invalid",
    "commit", "-m", "baseline");
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
      // An ordinary DevSpace RPC has a 20 s budget. LAO's bounded local-model
      // calls must survive that budget without changing the core tools.
      if (!live && firstMessage.includes("long-running LAO transport test")) {
        await new Promise(resolve => setTimeout(resolve, 20_400));
      }
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
  const probeToken = "p".repeat(43);
  const probeRefreshToken = "r".repeat(43);
  store.saveAccessToken(createHash("sha256").update(probeToken).digest("base64url"), {
    clientId: client.client_id, scopes: ["devspace"],
    expiresAt: Math.floor(Date.now()/1000) + 3600, resource: bearer,
  });
  store.saveRefreshToken(createHash("sha256").update(probeRefreshToken).digest("base64url"), {
    clientId: client.client_id, scopes: ["devspace"],
    expiresAt: Math.floor(Date.now()/1000) + 3600, resource: bearer,
  });
  store.close();
  const tracked = ["DEVSPACE_LAO_ENABLED", "DEVSPACE_LAO_OLLAMA_URL", "DEVSPACE_LAO_MODEL",
    "DEVSPACE_LAO_STATE_DIR",
    "LAO_WRITE_APPROVAL_ENABLED", "LAO_WRITE_PROMOTION_ENABLED"];
  const original = Object.fromEntries(tracked.map(k=>[k,process.env[k]])) as Record<string,string|undefined>;
  let running: ReturnType<typeof createServer>;
  try {
    process.env.DEVSPACE_LAO_ENABLED = "true";
    // Never let a test inherit the operator's persisted live LAO database.
    process.env.DEVSPACE_LAO_STATE_DIR = join(root, "lao-state");
    process.env.DEVSPACE_LAO_OLLAMA_URL = live ? "http://127.0.0.1:11434" : url;
    process.env.DEVSPACE_LAO_MODEL = live ? "granite4.2-8b:gpu" : "mock-granite:latest";
    // This isolated server is the only place where the test permits these
    // opt-ins; the normal listener never inherits approval/promotion rights.
    if (promotionLive) {
      process.env.LAO_WRITE_APPROVAL_ENABLED = "true";
      process.env.LAO_WRITE_PROMOTION_ENABLED = "true";
    } else {
      delete process.env.LAO_WRITE_APPROVAL_ENABLED;
      delete process.env.LAO_WRITE_PROMOTION_ENABLED;
    }
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
  const probeFile = join(root, "lao-probe-token.txt");
  writeFileSync(probeFile, JSON.stringify({
    accessToken: probeToken, refreshToken: probeRefreshToken,
    clientId: client.client_id, resource: bearer, expiresAt: Date.now() - 1000,
  }));
  assert.equal(await createLaoDevspaceProbe({
    LAO_DEVSPACE_MCP_URL: endpoint,
    LAO_DEVSPACE_MCP_TOKEN_FILE: probeFile,
  })(), "connected", "standalone LAO verifies the real OAuth-protected MCP endpoint");
  assert.notEqual(JSON.parse(readFileSync(probeFile, "utf8")).refreshToken, probeRefreshToken,
    "OAuth refresh rotation is persisted for later checks");
  let id = 0;
  const rpc = async (method: string, params: object, authenticated = true, timeoutMs = 15_000) => {
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
      signal: AbortSignal.timeout(live ? Math.max(timeoutMs,120000) : timeoutMs),
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
  assert.equal(listed.data.result?.tools?.some(x=>x.name==="lao_write_approve"), promotionLive);
  assert.equal(listed.data.result?.tools?.some(x=>x.name==="lao_write_promote"), promotionLive);
  const open = await rpc("tools/call",{ name:"open_workspace", arguments:{path:work} });
  assert.equal(open.status,200);
  const workspaceId = open.data.result?.structuredContent?.workspace_id;
  assert.equal(typeof workspaceId,"string");
  const delegated = await rpc("tools/call",{ name:"lao_delegate", arguments:{
    workspace_id: workspaceId, goal:"Explain the feature safely",
    acceptance_criteria:["Provide one sentence"], requested_by:"gemini",
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
  assert.equal(result.data.result?.structuredContent?.task?.requestedBy,"gemini");
  const pending = await rpc("tools/call",{name:"lao_pending",arguments:{}});
  assert.equal(pending.status,200);
  assert.equal(pending.data.result?.structuredContent?.tasks?.some(
    (task:{task_id:string;requested_by:string}) =>
      task.task_id===taskId && task.requested_by==="gemini"),true);
  const resumed = await rpc("tools/call",{name:"lao_resume",arguments:{task_id:taskId}});
  assert.equal(resumed.status,200);
  assert.equal(resumed.data.result?.structuredContent?.task?.requested_by,"gemini");
  assert.equal(resumed.data.result?.structuredContent?.task?.goal,"Explain the feature safely");
  assert.equal(resumed.data.result?.structuredContent?.runs?.[0]?.status,"completed");
  assert.equal(resumed.data.result?.structuredContent?.requires_human_review,true);
  const missingResume = await rpc("tools/call",{name:"lao_resume",arguments:{
    task_id:"00000000-0000-4000-8000-000000000099",
  }});
  assert.equal(missingResume.data.result?.isError,true);
  if (!live) {
    const longRun = await rpc("tools/call",{name:"lao_delegate",arguments:{
      workspace_id:workspaceId,goal:"long-running LAO transport test",
      acceptance_criteria:["Return an analysis"],max_wall_seconds:45,
    }},true,40_000);
    assert.equal(longRun.status,200, "long LAO RPC must not hit the core 20s limit");
    assert.equal(longRun.data.result?.structuredContent?.status,"awaiting_review");
  }
  const denied = await rpc("tools/call",{name:"lao_result",arguments:{
    workspace_id:"fake-ws",task_id:taskId,
  }});
  assert.equal(denied.data.result?.structuredContent?.task,undefined);
  assert.equal(denied.data.result?.isError,true,
    "lost workspace identities must fail closed, not invent a different worktree");
  assert.equal((await rpc("tools/call",{name:"lao_result",arguments:{
    workspace_id:workspaceId,task_id:taskId,
  }},false)).status,401);
  {
    const prepared = await rpc("tools/call",{ name:"lao_write_prepare", arguments:{
      source_workspace_id: workspaceId, goal:"Create src/fixture.ts containing exactly: export const fixture = true;",
      acceptance_criteria:["static: integrity","node:test tests/fixture.test.mjs"],
      allowed_write_paths:["src/fixture.ts"],
    }});
    assert.equal(prepared.data.result?.structuredContent?.status,"created");
    const managedId = prepared.data.result?.structuredContent?.workspace_id;
    const writeTask = prepared.data.result?.structuredContent?.task_id;
    assert.equal(typeof managedId, "string");
    assert.equal(typeof writeTask, "string");
    // Prove the identity survives a registry reconstruction (as after MCP
    // restart), without reopening a different worktree or replacing its ID.
    const persistedWorkspaceStore = new SqliteWorkspaceStore(config.stateDir);
    try {
      const recovered = await new WorkspaceRegistry(config,persistedWorkspaceStore)
        .getWorkspace(managedId);
      assert.equal(recovered.id,managedId);
      assert.equal(recovered.mode,"worktree");
      assert.equal(recovered.worktree?.managed,true);
    } finally { persistedWorkspaceStore.close(); }
    const written = await rpc("tools/call",{name:"lao_write_run",arguments:{
      workspace_id:managedId,task_id:writeTask,
    }});
    assert.equal(written.data.result?.structuredContent?.status,"awaiting_review");
    const validated = await rpc("tools/call",{name:"lao_write_validate",arguments:{
      workspace_id:managedId,task_id:writeTask,
    }});
    assert.equal(validated.data.result?.structuredContent?.staticChecksPassed,true);
    const beforeTests = await rpc("tools/call",{name:"lao_write_assess",arguments:{
      workspace_id:managedId,task_id:writeTask,
    }});
    assert.equal(beforeTests.data.result?.structuredContent?.allCriteriaVerified,false);
    assert.equal(beforeTests.data.result?.structuredContent?.promotionAllowed,false);
    if (process.env.LAO_SANDBOX_NODE_IMAGE) {
      const isolated = await rpc("tools/call",{name:"lao_write_test",arguments:{
        workspace_id:managedId,task_id:writeTask,
        test_files:["tests/fixture.test.mjs"],
      }});
      assert.equal(isolated.data.result?.structuredContent?.passed,true, JSON.stringify(isolated.data.result));
      const assessed = await rpc("tools/call",{name:"lao_write_assess",arguments:{
        workspace_id:managedId,task_id:writeTask,
      }});
      assert.equal(assessed.data.result?.structuredContent?.allCriteriaVerified,true);
      assert.equal(assessed.data.result?.structuredContent?.approvalAllowed,false);
      assert.equal(assessed.data.result?.structuredContent?.promotionAllowed,false);
      console.log("Authenticated MCP + Docker test + declarative acceptance: passed, review blocked");
      if (promotionLive) {
        const fingerprint = assessed.data.result?.structuredContent?.contentFingerprint;
        assert.match(fingerprint, /^[a-f0-9]{64}$/);
        assert.equal(readFileSync(join(work,"README.md"), "utf8"),
          "Temporary MCP test workspace");
        assert.equal(existsSync(join(work,"src","fixture.ts")), false);
        assert.equal(git("status","--porcelain"), "");
        const approval = { workspace_id: managedId, task_id: writeTask,
          review_note: "Test supervisor: inspected bounded fixture patch and Docker acceptance",
          confirmation: "APPROVE " + writeTask + " " + fingerprint };
        const badApproval = await rpc("tools/call", { name:"lao_write_approve",
          arguments: { ...approval, confirmation: "APPROVE invalid" } });
        assert.equal(badApproval.data.result?.isError, true);
        const approved = await rpc("tools/call", { name:"lao_write_approve",
          arguments: approval });
        assert.equal(approved.data.result?.structuredContent?.status, "approved",
          JSON.stringify(approved.data.result));
        assert.equal(approved.data.result?.structuredContent?.source_checkout_modified, false);
        assert.equal(git("status","--porcelain"), "");
        const promotion = { workspace_id: managedId, task_id: writeTask,
          confirmation: "PROMOTE " + writeTask + " " + fingerprint };
        const badPromotion = await rpc("tools/call", { name:"lao_write_promote",
          arguments: { ...promotion, confirmation: "PROMOTE invalid" } });
        assert.equal(badPromotion.data.result?.isError, true);
        assert.equal(git("status","--porcelain"), "");
        const promoted = await rpc("tools/call", { name:"lao_write_promote",
          arguments: promotion });
        assert.equal(promoted.data.result?.structuredContent?.path, "src/fixture.ts",
          JSON.stringify(promoted.data.result));
        assert.equal(promoted.data.result?.structuredContent?.backupRetained, true);
        assert.equal(promoted.data.result?.structuredContent?.committed, false);
        assert.match(readFileSync(join(work,"src","fixture.ts"),"utf8"),
          /fixture\s*=\s*true/);
        assert.match(git("status","--porcelain","--untracked-files=all"), /src\/fixture\.ts/);
        const recovered = await rpc("tools/call", { name:"lao_result", arguments: {
          workspace_id: managedId, task_id: writeTask,
        }});
        assert.equal(recovered.data.result?.structuredContent?.task?.status, "approved");
        assert.equal((await rpc("tools/call", { name:"lao_write_promote",
          arguments: promotion })).data.result?.isError, true);
        console.log("MCP + real Granite + offline Docker + scripted review + single-file promotion: passed (DISPOSABLE REPOSITORY ONLY)");
      }
    }
    const deniedApproval = await rpc("tools/call",{name:"lao_review",arguments:{
      workspace_id:managedId,task_id:writeTask,decision:"approved",
      criteria_verified:true,evidence:["Not accepted"],note:"Test",
    }});
    assert.equal(deniedApproval.data.result?.isError,true);
    if (!promotionLive) {
      assert.equal(existsSync(join(work,"src","fixture.ts")),false);
      assert.equal(git("status","--porcelain"),"");
    }
  }
  if (live) console.log("Authenticated MCP + real Granite: task persisted and awaiting review");
});

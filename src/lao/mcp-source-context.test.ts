import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, rmSync, writeFileSync, realpathSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import type { McpRegistrationTarget } from "../mcp-modern-server.js";
import { resolvePathInsideCanonicalRoot } from "../roots.js";
import type { Workspace } from "../workspaces.js";
import { loadLaoConfig } from "./config.js";
import { registerLaoMcpTools } from "./mcp-tools.js";
import { LaoTaskStore } from "./task-store.js";

type Handler = (args: Record<string, unknown>) => Promise<{
  isError?: boolean; structuredContent?: Record<string, unknown>
}>;

test("explicit source snapshots are bounded, untrusted and hashed in persisted runs", async () => {
  const dir = mkdtempSync(join(tmpdir(), "lao-mcp-context-"));
  const workRoot = join(dir, "repo");
  mkdirSync(workRoot);
  const stateDir = join(dir, "state");
  writeFileSync(join(workRoot, "README.md"), "README_SOURCE_SIGNATURE\n");
  writeFileSync(join(workRoot, ".env"), "PRIVATE_SECRET_VALUE\n");
  const workspace = { id: "ws_source", root: workRoot, canonicalRoot: realpathSync(workRoot) } as Workspace;
  const handlers = new Map<string, Handler>();
  let prompt = "";
  const server = {
    registerTool: (name: string, _schema: unknown, fn: Handler) => { handlers.set(name, fn); },
  } as unknown as Pick<McpRegistrationTarget, "registerTool">;
  try {
    registerLaoMcpTools(server, loadLaoConfig({ DEVSPACE_LAO_ENABLED: "true" }), {
      stateDir,
      workspaces: {
        getWorkspace: async id => { if (id !== workspace.id) throw new Error("not authorized"); return workspace; },
        resolvePath: (ws, relative) => resolvePathInsideCanonicalRoot(relative, ws.root, ws.root, ws.canonicalRoot),
      },
      ollama: {
        inspectModel: async name => ({ name, capabilities: ["tools"], supportsTools: true }),
        chatReadOnly: async p => { prompt = p; return "README explained"; },
      },
    });
    const delegate = handlers.get("lao_delegate")!;
    const args = { workspace_id: workspace.id, goal: "Analyze README", acceptance_criteria: ["Mention summary"], source_files: ["README.md"] };
    const result = await delegate(args);
    assert.equal(result.isError, undefined);
    assert.equal(result.structuredContent?.status, "awaiting_review");
    assert.match(prompt, /README_SOURCE_SIGNATURE/);
    assert.match(prompt, /UNTRUSTED DATA/);
    assert.doesNotMatch(prompt, /PRIVATE_SECRET_VALUE/);
    const id = result.structuredContent?.task_id as string;
    const db = new LaoTaskStore(stateDir);
    try {
      const persisted = db.getRuns(id);
      assert.equal(persisted.length, 1);
      assert.equal(persisted[0]?.sourceManifest[0]?.path, "README.md");
      assert.match(persisted[0]?.sourceManifest[0]?.sha256 ?? "", /^[0-9a-f]{64}$/);
      assert.equal(persisted[0]?.status, "completed");
    } finally { db.close(); }
    const blocked = await delegate({ ...args, source_files: [".env"] });
    assert.equal(blocked.isError, true);
    const store = new LaoTaskStore(stateDir);
    try { assert.equal(store.list().length, 1); }
    finally { store.close(); }
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

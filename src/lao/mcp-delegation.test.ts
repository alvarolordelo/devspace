import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import type { McpRegistrationTarget } from "../mcp-modern-server.js";
import { loadLaoConfig } from "./config.js";
import { registerLaoMcpTools } from "./mcp-tools.js";

const config = loadLaoConfig({ DEVSPACE_LAO_ENABLED: "true" });
type Handler = (args: Record<string, unknown>) => Promise<{
  isError?: boolean; structuredContent?: Record<string, unknown>
}>;
function registry() {
  const handlers = new Map<string, Handler>();
  const server = { registerTool: (name: string, _: unknown, handler: Handler) => {
    handlers.set(name, handler);
  } } as unknown as Pick<McpRegistrationTarget, "registerTool">;
  return { server, get: (name: string) => {
    const fn = handlers.get(name);
    if (!fn) throw new Error(`Tool absent: ${name}`);
    return fn;
  }, names: () => [...handlers.keys()] };
}
test("opt-in MCP can delegate read-only, inspect durable run, and accept explicit review", async () => {
  const stateDir = mkdtempSync(join(tmpdir(), "lao-mcp-"));
  try {
    const r = registry();
    registerLaoMcpTools(r.server, config, {
      stateDir,
      workspaces: { getWorkspace: async (id: string) => {
        if (id !== "ws_authorized") throw new Error("Unauthorized workspace");
        return {} as never;
      } },
      ollama: {
        inspectModel: async (name: string) => ({ name, capabilities: ["tools"], supportsTools: true }),
        chatReadOnly: async () => "Technical read-only analysis",
      },
    });
    assert.deepEqual(r.names(), ["lao_status", "lao_models", "lao_delegate", "lao_retry", "lao_result", "lao_review"]);
    const delegated = await r.get("lao_delegate")({
      workspace_id: "ws_authorized", goal: "Describe the component",
      acceptance_criteria: ["Return a summary"], max_wall_seconds: 2,
    });
    assert.equal(delegated.structuredContent?.status, "awaiting_review");
    assert.equal(delegated.structuredContent?.criteria_verified, false);
    const id = delegated.structuredContent?.task_id as string;
    assert.ok(id);
    const result = await r.get("lao_result")({ workspace_id: "ws_authorized", task_id: id });
    const runs = result.structuredContent?.runs as Array<{ summary: string }>;
    assert.equal(runs[0]?.summary, "Technical read-only analysis");
    const forbidden = await r.get("lao_result")({ workspace_id: "ws_intruder", task_id: id });
    assert.equal(forbidden.isError, true);
    const unverified = await r.get("lao_review")({
      workspace_id: "ws_authorized", task_id: id, decision: "approved",
      criteria_verified: false, evidence: ["none"], note: "No tests",
    });
    assert.equal(unverified.isError, true);
    const review = await r.get("lao_review")({
      workspace_id: "ws_authorized", task_id: id, decision: "approved",
      criteria_verified: true, evidence: ["host reviewed summary"], note: "Accepted as analysis only",
    });
    assert.equal((review.structuredContent?.task as {status: string})?.status, "approved");
    const final = await r.get("lao_result")({ workspace_id: "ws_authorized", task_id: id });
    assert.equal((final.structuredContent?.review as { decision: string })?.decision, "approved");
    assert.equal((final.structuredContent?.events as unknown[]).length, 7);
  } finally { rmSync(stateDir, { recursive: true, force: true }); }
});

test("unauthorized workspace cannot create any task records", async () => {
  const stateDir = mkdtempSync(join(tmpdir(), "lao-mcp-denied-"));
  try {
    const r = registry();
    registerLaoMcpTools(r.server, config, {
      stateDir,
      workspaces: { getWorkspace: async () => { throw new Error("not allowed"); } },
    });
    const output = await r.get("lao_delegate")({
      workspace_id: "bad", goal: "Do something", acceptance_criteria: ["Answer"],
    });
    assert.equal(output.isError, true);
    assert.equal(output.structuredContent, undefined);
  } finally { rmSync(stateDir, { recursive: true, force: true }); }
});

test("explicit supervisor corrections are retried at most twice, with stored feedback and no auto-approval", async () => {
  const stateDir = mkdtempSync(join(tmpdir(), "lao-mcp-retry-"));
  try {
    const r = registry();
    const prompts: string[] = [];
    registerLaoMcpTools(r.server, config, {
      stateDir,
      workspaces: { getWorkspace: async (id: string) => {
        if (id !== "ws_reviewed") throw new Error("Unauthorized workspace");
        return {} as never;
      } },
      ollama: {
        inspectModel: async name => ({ name, capabilities: ["tools"], supportsTools: true }),
        chatReadOnly: async p => { prompts.push(p); return "Response " + prompts.length; },
      },
    });
    const delegated = await r.get("lao_delegate")({
      workspace_id: "ws_reviewed", goal: "Provide an explanation",
      acceptance_criteria: ["Be accurate"],
    });
    const id = delegated.structuredContent?.task_id as string;
    assert.equal(delegated.structuredContent?.status, "awaiting_review");
    assert.equal((await r.get("lao_retry")({
      workspace_id: "ws_reviewed", task_id: id,
    })).isError, true, "retry without review must be denied");

    for (let count = 1; count <= 2; count++) {
      const reviewed = await r.get("lao_review")({
        workspace_id: "ws_reviewed", task_id: id,
        decision: "needs_revision", criteria_verified: false,
        evidence: ["Supervisor compared answer with goal"], note: "Address correction " + count,
      });
      assert.equal((reviewed.structuredContent?.task as { status: string })?.status, "needs_revision");
      assert.equal((await r.get("lao_retry")({
        workspace_id: "ws_intruder", task_id: id,
      })).isError, true, "retry from unauthorized workspace must be denied");
      const retried = await r.get("lao_retry")({
        workspace_id: "ws_reviewed", task_id: id,
      });
      assert.equal(retried.structuredContent?.status, "awaiting_review");
      assert.equal(retried.structuredContent?.revision_count, count);
      assert.equal(retried.structuredContent?.criteria_verified, false);
      assert.match(prompts[count] ?? "", new RegExp("Address correction " + count));
    }
    const result = await r.get("lao_result")({
      workspace_id: "ws_reviewed", task_id: id,
    });
    assert.equal((result.structuredContent?.runs as unknown[]).length, 3);
    assert.equal((result.structuredContent?.task as { status: string }).status, "awaiting_review");

    await r.get("lao_review")({
      workspace_id: "ws_reviewed", task_id: id,
      decision: "needs_revision", criteria_verified: false,
      evidence: ["Correction still needed"], note: "Third request",
    });
    const exhausted = await r.get("lao_retry")({
      workspace_id: "ws_reviewed", task_id: id,
    });
    assert.equal(exhausted.isError, true);
    assert.equal(prompts.length, 3, "exhausted budget must not invoke the model");
    const final = await r.get("lao_result")({ workspace_id: "ws_reviewed", task_id: id });
    assert.equal((final.structuredContent?.runs as unknown[]).length, 3);
    assert.equal((final.structuredContent?.task as { status: string }).status, "needs_revision");
  } finally { rmSync(stateDir, { recursive: true, force: true }); }
});

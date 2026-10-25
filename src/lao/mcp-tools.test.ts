import assert from "node:assert/strict";
import test from "node:test";
import type { McpRegistrationTarget } from "../mcp-modern-server.js";
import { loadLaoConfig } from "./config.js";
import { registerLaoMcpTools } from "./mcp-tools.js";

test("LAO OFF preserves the existing MCP tool surface", () => {
  const names: string[] = [];
  const server = { registerTool: (name: string) => { names.push(name); } } as unknown as Pick<McpRegistrationTarget, "registerTool">;
  registerLaoMcpTools(server, loadLaoConfig({}));
  assert.deepEqual(names, []);
});
test("LAO ON registers only the bounded read-only health and discovery tools", () => {
  const tools: Array<{ name: string; options: {annotations?: { readOnlyHint?: boolean }} }> = [];
  const server = { registerTool: (name: string, options: { annotations?: { readOnlyHint?: boolean } }) => {
    tools.push({ name, options });
  } } as unknown as Pick<McpRegistrationTarget, "registerTool">;
  registerLaoMcpTools(server, loadLaoConfig({ DEVSPACE_LAO_ENABLED: "true" }));
  assert.deepEqual(tools.map(({name}) => name), ["lao_status", "lao_models"]);
  assert.ok(tools.every(({options}) => options.annotations?.readOnlyHint === true));
});

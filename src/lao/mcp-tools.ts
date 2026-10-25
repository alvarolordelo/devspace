import type { McpRegistrationTarget } from "../mcp-modern-server.js";
import type { LaoConfig } from "./config.js";
import { LaoOllamaClient } from "./ollama-client.js";
import { measureLaoReadiness } from "./health.js";

/** Read-only, optional MCP extension. No task execution or filesystem writes. */
export function registerLaoMcpTools(
  server: Pick<McpRegistrationTarget, "registerTool">,
  config: LaoConfig,
): void {
  if (!config.enabled) return;
  server.registerTool("lao_status", {
    title: "LAO status",
    description: "Get opt-in LAO dependency readiness. Does not execute a task or start a service.",
    inputSchema: {},
    annotations: { readOnlyHint: true },
  }, async () => {
    // This is reached through the authenticated DevSpace MCP route.
    const snapshot = await measureLaoReadiness(config, { devspaceReady: true });
    return {
      content: [{ type: "text" as const, text: JSON.stringify(snapshot) }],
      structuredContent: snapshot,
    };
  });
  server.registerTool("lao_models", {
    title: "LAO local models",
    description: "List locally installed Ollama models (read-only). No model is loaded or executed.",
    inputSchema: {},
    annotations: { readOnlyHint: true },
  }, async () => {
    try {
      const models = await new LaoOllamaClient(config).listModels();
      return {
        content: [{ type: "text" as const, text: JSON.stringify({ models }) }],
        structuredContent: { models },
      };
    } catch {
      return {
        isError: true,
        content: [{ type: "text" as const, text: "Ollama unavailable; no model was started." }],
      };
    }
  });
}

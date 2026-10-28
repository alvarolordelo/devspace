import { LAO_CONTRACT_VERSION, laoHealthSchema, type LaoHealthSnapshot } from "./contracts.js";
import type { LaoConfig } from "./config.js";
import { LaoOllamaClient } from "./ollama-client.js";
import type { LaoDevspaceStatus } from "./devspace-probe.js";

/**
 * Report readiness honestly: LAO being alive is different from having an
 * authenticated, functioning DevSpace MCP connection.
 */
export async function measureLaoReadiness(
  config: LaoConfig,
  input: { devspaceReady?: boolean; devspaceStatus?: LaoDevspaceStatus; client?: LaoOllamaClient; signal?: AbortSignal },
): Promise<LaoHealthSnapshot> {
  const reasons: string[] = [];
  if (!config.enabled) reasons.push("lao_disabled");
  const devspaceStatus = input.devspaceStatus ?? (input.devspaceReady ? "connected" : "unverified");
  if (devspaceStatus === "unverified") reasons.push("devspace_unverified");
  if (devspaceStatus === "offline") reasons.push("devspace_unavailable");
  if (config.enabled) {
    try {
      const client = input.client ?? new LaoOllamaClient(config);
      const models = await client.listModels({ signal: input.signal, timeoutMs: 3000 });
      if (!models.some((item) => item.name === config.defaultModel)) {
        reasons.push("model_missing");
      } else {
        const found = await client.inspectModel(config.defaultModel, { signal: input.signal, timeoutMs: 3000 });
        if (!found.supportsTools) reasons.push("model_tools_unsupported");
      }
    } catch {
      reasons.push("ollama_unavailable");
    }
  }
  return laoHealthSchema.parse({
    schemaVersion: LAO_CONTRACT_VERSION,
    enabled: config.enabled,
    live: true,
    ready: reasons.length === 0,
    checkedAt: new Date().toISOString(),
    blockingReasons: reasons,
  });
}

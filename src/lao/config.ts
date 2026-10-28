/**
 * LAO configuration is opt-in and independent of DevSpace's persisted config.
 * Merely importing these functions never opens a socket, database or process.
 */
export interface LaoConfig {
  enabled: boolean;
  ollamaUrl: string;
  defaultModel: string;
  fallbackModel: string | null;
}

function validateModelName(name: string, label: string): string {
  if (!name || name.length > 200 || /[\r\n\x00-\x1f]/.test(name)) {
    throw new Error(label + " must be a valid local model name");
  }
  if (/(?:^|[:.-])cloud$/i.test(name)) {
    throw new Error(label + " cannot select an Ollama cloud/proxy model");
  }
  return name;
}

export function loadLaoConfig(env: NodeJS.ProcessEnv = process.env): LaoConfig {
  const raw = (env.DEVSPACE_LAO_ENABLED ?? "false").trim().toLowerCase();
  if (raw !== "true" && raw !== "false") {
    throw new Error("DEVSPACE_LAO_ENABLED must be 'true' or 'false'");
  }
  const ollamaUrl = env.DEVSPACE_LAO_OLLAMA_URL ?? "http://127.0.0.1:11434";
  const parsed = new URL(ollamaUrl);
  if (parsed.protocol !== "http:" || !["127.0.0.1", "localhost", "[::1]"].includes(parsed.hostname) ||
      parsed.username || parsed.password || parsed.search || parsed.hash || parsed.pathname !== "/") {
    throw new Error("LAO Ollama URL must point to a loopback HTTP origin");
  }
  const model = validateModelName(env.DEVSPACE_LAO_MODEL?.trim() || "granite4.2-8b:gpu",
    "DEVSPACE_LAO_MODEL");
  const fallbackRaw = env.DEVSPACE_LAO_FALLBACK_MODEL?.trim();
  const fallbackModel = fallbackRaw
    ? validateModelName(fallbackRaw, "DEVSPACE_LAO_FALLBACK_MODEL") : null;
  if (fallbackModel === model) {
    throw new Error("DEVSPACE_LAO_FALLBACK_MODEL must differ from the primary model");
  }
  return { enabled: raw === "true", ollamaUrl: parsed.origin,
    defaultModel: model, fallbackModel };
}

import { readFile, rename, rm, writeFile } from "node:fs/promises";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { randomBytes } from "node:crypto";
import type { LaoConfig } from "./config.js";
import { LaoOllamaClient } from "./ollama-client.js";

/** A user-owned LAO-only preference, never a change to Ollama or DevSpace. */
export function validLocalModel(name: unknown): name is string {
  return typeof name === "string" && name.length > 0 && name.length <= 200 &&
    !/[\r\n\x00-\x1f]/.test(name);
}

/**
 * Cross-process LAO preference for MCP delegation. Never changes the original
 * DevSpace configuration; a missing preference preserves its pinned default.
 * Windows LocalAppData is the default location of the LAO daemon launcher.
 */
export function readLaoPreferredModel(defaultModel: string,
  env: NodeJS.ProcessEnv = process.env): string {
  const stateDir = env.DEVSPACE_LAO_STATE_DIR ??
    (env.LOCALAPPDATA ? join(env.LOCALAPPDATA, "LAODevSpace", "state") : undefined);
  if (!stateDir) return defaultModel;
  try {
    const data = JSON.parse(readFileSync(join(stateDir, "selected-model.json"), "utf8"));
    return validLocalModel(data?.model) ? data.model : defaultModel;
  } catch { return defaultModel; }
}

export function createLaoModelSelection(config: LaoConfig, stateDir: string,
  listLocal = () => new LaoOllamaClient(config).listModels({ timeoutMs: 3500 })) {
  const file = join(stateDir, "selected-model.json");
  const listModels = async () => {
    const models = await listLocal();
    // Ollama may expose proxy/cloud entries in /api/tags; those are not local
    // models and must never be offered by the LOCAL model picker.
    return [...new Set(models.map(m => m.name)
      .filter((name): name is string => validLocalModel(name) &&
        !/(?:^|[:.-])cloud$/i.test(name)))].slice(0, 200);
  };
  return {
    async restore() {
      try {
        const saved = JSON.parse(await readFile(file, "utf8"));
        if (validLocalModel(saved?.model)) config.defaultModel = saved.model;
      } catch (err) {
        if ((err as NodeJS.ErrnoException).code !== "ENOENT") {
          // Corrupt preferences must never silently claim a model is loaded.
          throw new Error("LAO model preference invalid", { cause: err });
        }
      }
    },
    listModels,
    async selectModel(model: unknown): Promise<"selected" | "not_installed" | "invalid"> {
      if (!validLocalModel(model)) return "invalid";
      if (!(await listModels()).includes(model)) return "not_installed";
      const temp = join(stateDir, ".selected-model-" + randomBytes(8).toString("hex") + ".tmp");
      try {
        await writeFile(temp, JSON.stringify({ model }) + "\n", { encoding: "utf8", flag: "wx", mode: 0o600 });
        await rename(temp, file);
        config.defaultModel = model;
      } finally {
        await rm(temp, { force: true }).catch(() => undefined);
      }
      return "selected";
    },
  };
}

import * as z from "zod/v4";
import type { LaoConfig } from "./config.js";

export type LaoOllamaErrorCode =
  | "DISABLED" | "OFFLINE" | "TIMEOUT" | "CANCELLED" | "HTTP_ERROR" | "INVALID_RESPONSE";

export class LaoOllamaError extends Error {
  constructor(readonly code: LaoOllamaErrorCode, message: string) {
    super(message);
    this.name = "LaoOllamaError";
  }
}

const modelsSchema = z.object({
  models: z.array(z.object({
    name: z.string().min(1),
    size: z.number().optional(),
  }).passthrough()),
}).passthrough();

const showSchema = z.object({
  capabilities: z.array(z.string()).optional(),
}).passthrough();

const chatSchema = z.object({
  message: z.object({ role: z.string(), content: z.string() }).passthrough(),
  done: z.boolean(),
}).passthrough();

export interface LaoModelInfo {
  name: string;
  size?: number;
}

export class LaoOllamaClient {
  constructor(
    private readonly config: LaoConfig,
    private readonly transport: typeof fetch = fetch,
  ) {}

  async listModels(options: { signal?: AbortSignal; timeoutMs?: number } = {}): Promise<LaoModelInfo[]> {
    const data = modelsSchema.parse(await this.request("/api/tags", undefined, options));
    return data.models.map(({ name, size }) => ({ name, size }));
  }

  /** Models in /api/tags may not support tool calling; /api/show is authoritative. */
  async inspectModel(name: string, options: { signal?: AbortSignal; timeoutMs?: number } = {}) {
    if (!name || name.length > 200) throw new RangeError("Invalid model name");
    const data = showSchema.parse(await this.request("/api/show", { model: name }, options));
    return { name, capabilities: data.capabilities ?? [], supportsTools: data.capabilities?.includes("tools") ?? false };
  }

  /** Text-only smoke test: no tools or workspace write capability are passed to Ollama. */
  async chatReadOnly(
    prompt: string,
    options: { model?: string; signal?: AbortSignal; timeoutMs?: number; maxOutputTokens?: number } = {},
  ): Promise<string> {
    if (!prompt.trim() || prompt.length > 20_000) throw new RangeError("Invalid prompt length");
    const maxTokens = options.maxOutputTokens ?? 256;
    if (!Number.isSafeInteger(maxTokens) || maxTokens < 1 || maxTokens > 1024) {
      throw new RangeError("Invalid maximum output tokens");
    }
    const model = options.model ?? this.config.defaultModel;
    if (!model || model.length > 200) throw new RangeError("Invalid model name");
    const result = chatSchema.safeParse(await this.request("/api/chat", {
      model, messages: [{ role: "user", content: prompt }],
      // A bounded response must not consume its entire token budget on hidden thinking.
      stream: false, think: false, options: { num_predict: maxTokens },
    }, { signal: options.signal, timeoutMs: options.timeoutMs ?? 90_000 }));
    if (!result.success || result.data.done !== true || result.data.message.role !== "assistant") {
      throw new LaoOllamaError("INVALID_RESPONSE", "Incomplete or invalid Ollama chat response");
    }
    return result.data.message.content;
  }

  private async request(
    path: string,
    body: object | undefined,
    options: { signal?: AbortSignal; timeoutMs?: number },
  ): Promise<unknown> {
    if (!this.config.enabled) throw new LaoOllamaError("DISABLED", "LAO is not enabled");
    const timeoutMs = options.timeoutMs ?? 5_000;
    if (!Number.isSafeInteger(timeoutMs) || timeoutMs < 1 || timeoutMs > 180_000) {
      throw new RangeError("Invalid timeout");
    }
    const controller = new AbortController();
    let timedOut = false;
    const timer = setTimeout(() => { timedOut = true; controller.abort(); }, timeoutMs);
    const cancel = () => controller.abort(options.signal?.reason);
    options.signal?.addEventListener("abort", cancel, { once: true });
    if (options.signal?.aborted) cancel();
    try {
      if (controller.signal.aborted) throw new LaoOllamaError("CANCELLED", "Ollama request cancelled");
      const response = await this.transport(`${this.config.ollamaUrl}${path}`, {
        method: body === undefined ? "GET" : "POST",
        headers: body === undefined ? undefined : { "content-type": "application/json" },
        body: body === undefined ? undefined : JSON.stringify(body),
        signal: controller.signal,
        redirect: "error",
      });
      if (!response.ok) throw new LaoOllamaError("HTTP_ERROR", `Ollama returned HTTP ${response.status}`);
      try { return await response.json(); }
      catch { throw new LaoOllamaError("INVALID_RESPONSE", "Ollama returned invalid JSON"); }
    } catch (error) {
      if (error instanceof LaoOllamaError) throw error;
      if (options.signal?.aborted) throw new LaoOllamaError("CANCELLED", "Ollama request cancelled");
      if (timedOut) throw new LaoOllamaError("TIMEOUT", "Ollama request timed out");
      throw new LaoOllamaError("OFFLINE", "Unable to contact Ollama");
    } finally {
      clearTimeout(timer);
      options.signal?.removeEventListener("abort", cancel);
    }
  }
}

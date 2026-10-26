import { LaoOllamaError, type LaoOllamaClient } from "./ollama-client.js";
import type { LaoRun, LaoTask, LaoTaskInput } from "./contracts.js";
import type { LaoTaskStore } from "./task-store.js";

/**
 * Read-only phase of LAO: no filesystem, shell, patch or tool definitions are
 * ever provided to the model. A model answer is NOT evidence of verification.
 */
export class LaoReadOnlyRunner {
  constructor(
    private readonly store: LaoTaskStore,
    private readonly ollama: Pick<LaoOllamaClient, "inspectModel" | "chatReadOnly">,
  ) {}

  createTask(input: LaoTaskInput): LaoTask {
    if (input.permissions.write !== "none" || input.permissions.shell !== "none") {
      throw new Error("Only read-only tasks are supported at this stage");
    }
    return this.store.create(input);
  }

  async runTask(taskId: string, signal?: AbortSignal): Promise<{ task: LaoTask; run: LaoRun }> {
    const task = this.store.get(taskId);
    if (!task) throw new Error("LAO task not found");
    if (task.permissions.write !== "none" || task.permissions.shell !== "none") {
      throw new Error("Execution of write/shell tasks is not authorized");
    }
    if (task.status === "created" || task.status === "needs_revision" || task.status === "interrupted") {
      this.store.transition(taskId, "queued");
    } else if (task.status !== "queued") {
      throw new Error(`Task is not queued: ${task.status}`);
    }

    this.store.transition(taskId, "preparing");
    const deadlineController = new AbortController();
    const deadlineTimer = setTimeout(
      () => deadlineController.abort(), task.limits.maxWallSeconds * 1000,
    );
    const effectiveSignal = signal
      ? AbortSignal.any([signal, deadlineController.signal])
      : deadlineController.signal;
    let run: LaoRun | undefined;
    try {
      if (effectiveSignal.aborted) throw new Error("Task cancelled or timed out");
      const info = await this.ollama.inspectModel(task.model, {
        timeoutMs: Math.min(5000, task.limits.maxWallSeconds * 1000), signal: effectiveSignal,
      });
      if (!info.supportsTools) throw new Error("Requested model lacks tools capability");
      const prompt = [
        "You are a read-only technical assistant. You cannot inspect project files or execute tools.",
        "Never claim that you ran tests or inspected files. Give a concise, evidence-limited answer.",
        "Goal:", task.goal, "Acceptance criteria:", ...task.acceptanceCriteria.map((x) => "- " + x),
      ].join("\n");
      if (prompt.length > 8000) throw new Error("Task context exceeds read-only prompt budget");
      this.store.transition(taskId, "running");
      run = this.store.startRun(taskId);
      const response = await this.ollama.chatReadOnly(prompt, {
        model: task.model,
        signal: effectiveSignal,
        timeoutMs: Math.min(task.limits.maxWallSeconds * 1000, 180000),
        maxOutputTokens: 512,
      });
      if (effectiveSignal.aborted) throw new Error("Task cancelled or timed out");
      if (!response.trim()) throw new Error("Ollama returned an empty response");
      const completed = this.store.completeRun(run.id, { status: "completed", summary: response });
      this.store.transition(taskId, "validating");
      // A response is never considered proof that acceptance criteria passed.
      const awaiting = this.store.transition(taskId, "awaiting_review");
      return { task: awaiting, run: completed };
    } catch (error) {
      if (run) {
        try {
          this.store.completeRun(run.id, { status: signal?.aborted ? "cancelled" : "failed",
            errorCode: deadlineController.signal.aborted && !signal?.aborted
              ? "TIMEOUT" : error instanceof LaoOllamaError ? error.code : "EXECUTION_ERROR" });
        } catch { /* retain primary error */ }
      }
      try {
        this.store.transition(taskId, signal?.aborted ? "cancelled" : "failed");
      } catch { /* retain primary error */ }
      throw error;
    } finally {
      clearTimeout(deadlineTimer);
    }
  }
}

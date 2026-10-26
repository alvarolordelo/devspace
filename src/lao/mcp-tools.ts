import * as z from "zod/v4";
import type { McpRegistrationTarget } from "../mcp-modern-server.js";
import type { WorkspaceRegistry } from "../workspaces.js";
import type { LaoConfig } from "./config.js";
import { LaoOllamaClient } from "./ollama-client.js";
import { measureLaoReadiness } from "./health.js";
import { LaoTaskStore } from "./task-store.js";
import { LaoReadOnlyRunner } from "./task-runner.js";
import { loadLaoReadContext } from "./read-context.js";
import type { LaoReview } from "./contracts.js";

type Target = Pick<McpRegistrationTarget, "registerTool">;

export interface LaoMcpContext {
  stateDir: string;
  workspaces: Pick<WorkspaceRegistry, "getWorkspace"> & Partial<Pick<WorkspaceRegistry, "resolvePath">>;
  ollama?: Pick<LaoOllamaClient, "inspectModel" | "chatReadOnly">;
}

function asToolResult(data: object) {
  return {
    content: [{ type: "text" as const, text: JSON.stringify(data) }],
    structuredContent: { ...data },
  };
}
function toolFailure(error: unknown) {
  const safeCode = error instanceof Error && error.name === "LaoOllamaError"
    ? "ollama_error" : "lao_request_failed";
  return {
    isError: true,
    content: [{ type: "text" as const, text: safeCode }],
  };
}
function withStore<T>(dir: string, operation: (store: LaoTaskStore) => Promise<T> | T): Promise<T> {
  const store = new LaoTaskStore(dir);
  return Promise.resolve().then(() => operation(store)).finally(() => store.close());
}
async function assertWorkspace(
  workspaceId: string,
  taskId: string | undefined,
  context: LaoMcpContext,
  store?: LaoTaskStore,
) {
  // The DevSpace registry revalidates allowed roots on lookup.
  await context.workspaces.getWorkspace(workspaceId);
  if (taskId && store?.get(taskId)?.workspaceId !== workspaceId) {
    throw new Error("Task is not accessible in this workspace");
  }
}

export function registerLaoMcpTools(
  server: Target,
  config: LaoConfig,
  context?: LaoMcpContext,
): void {
  if (!config.enabled) return;

  server.registerTool("lao_status", {
    title: "LAO status",
    description: "Get opt-in LAO dependency readiness without running a model.",
    inputSchema: {},
    annotations: { readOnlyHint: true },
  }, async () => asToolResult(
    await measureLaoReadiness(config, { devspaceReady: true }),
  ));

  server.registerTool("lao_models", {
    title: "LAO local models",
    description: "List locally installed Ollama models (read-only); no model is started.",
    inputSchema: {},
    annotations: { readOnlyHint: true },
  }, async () => {
    try { return asToolResult({ models: await new LaoOllamaClient(config).listModels() }); }
    catch (error) { return toolFailure(error); }
  });

  // A context is supplied only by the MCP server running with a validated
  // workspace registry. Standalone discovery-only callers cannot delegate.
  if (!context) return;

  server.registerTool("lao_delegate", {
    title: "Delegate read-only task to local model",
    description: "Create a bounded read-only task with optionally supplied source file snapshots from the authorized workspace. No shell or model tools; always requires supervisor review.",
    inputSchema: {
      workspace_id: z.string().min(1),
      goal: z.string().trim().min(1).max(4000),
      acceptance_criteria: z.array(z.string().trim().min(1).max(500)).min(1).max(10),
      model: z.string().trim().min(1).max(200).optional(),
      max_wall_seconds: z.number().int().min(1).max(180).optional(),
      source_files: z.array(z.string().min(1).max(240)).max(3).optional(),
    },
    annotations: { readOnlyHint: false, openWorldHint: false },
  }, async ({ workspace_id, goal, acceptance_criteria, model, max_wall_seconds, source_files }, extra) => {
    let taskId: string | undefined;
    try {
      const workspace = await context.workspaces.getWorkspace(workspace_id);
      const selectedFiles = source_files ?? [];
      if (selectedFiles.length && !context.workspaces.resolvePath) {
        throw new Error("File read context is unavailable");
      }
      const sourceSnapshots = selectedFiles.length
        ? await loadLaoReadContext(context.workspaces as Pick<WorkspaceRegistry, "resolvePath">, workspace, selectedFiles)
        : [];
      return await withStore(context.stateDir, async (store) => {
        const runner = new LaoReadOnlyRunner(store, context.ollama ?? new LaoOllamaClient(config));
        const task = runner.createTask({
          workspaceId: workspace_id, model: model ?? config.defaultModel, goal,
          acceptanceCriteria: acceptance_criteria,
          permissions: { read: true, write: "none", shell: "none" },
          limits: { maxRevisions: 2, maxToolCalls: 1, maxWallSeconds: max_wall_seconds ?? 90 },
          requireReview: true,
        });
        taskId = task.id;
        try {
          const result = await runner.runTask(task.id, extra?.signal, sourceSnapshots);
          return asToolResult({ task_id: task.id, status: result.task.status, run: result.run,
            requires_review: true, criteria_verified: false, source_manifest: result.run.sourceManifest });
        } catch {
          return asToolResult({ task_id: task.id, status: store.get(task.id)?.status,
            requires_review: true, error: "execution_failed", criteria_verified: false });
        }
      });
    } catch (error) {
      return { ...toolFailure(error), ...(taskId ? { structuredContent: { task_id: taskId } } : {}) };
    }
  });

  server.registerTool("lao_retry", {
    title: "Retry reviewed LAO read-only task",
    description: "Explicitly retry an existing task only after supervisor requested corrections. Reuses the stored limits, read-only policy, model and criteria; at most two retries, never self-approves.",
    inputSchema: {
      workspace_id: z.string().min(1),
      task_id: z.string().uuid(),
      source_files: z.array(z.string().min(1).max(240)).max(3).optional(),
    },
    annotations: { readOnlyHint: false, openWorldHint: false },
  }, async ({ workspace_id, task_id, source_files }, extra) => {
    try {
      return await withStore(context.stateDir, async (store) => {
        const workspace = await context.workspaces.getWorkspace(workspace_id);
        const task = store.get(task_id);
        if (!task || task.workspaceId !== workspace_id) {
          throw new Error("Task is not accessible in this workspace");
        }
        if (task.status !== "needs_revision") {
          throw new Error("Task must have explicit needs_revision decision");
        }
        if (task.revisionCount >= task.limits.maxRevisions) {
          throw new Error("LAO revision budget exhausted");
        }
        const selectedFiles = source_files ?? [];
        if (selectedFiles.length && !context.workspaces.resolvePath) {
          throw new Error("File read context is unavailable");
        }
        const snapshots = selectedFiles.length
          ? await loadLaoReadContext(context.workspaces as Pick<WorkspaceRegistry, "resolvePath">, workspace, selectedFiles)
          : [];
        const runner = new LaoReadOnlyRunner(store, context.ollama ?? new LaoOllamaClient(config));
        try {
          const result = await runner.runTask(task_id, extra?.signal, snapshots);
          return asToolResult({
            task_id, status: result.task.status, run: result.run,
            revision_count: result.task.revisionCount,
            requires_review: true, criteria_verified: false,
            source_manifest: result.run.sourceManifest,
          });
        } catch {
          return asToolResult({
            task_id, status: store.get(task_id)?.status,
            requires_review: true, criteria_verified: false, error: "execution_failed",
          });
        }
      });
    } catch (error) { return toolFailure(error); }
  });

  server.registerTool("lao_result", {
    title: "Read LAO task result",
    description: "Inspect persisted runs, event history, and review decision for a task in an authorized workspace.",
    inputSchema: {
      workspace_id: z.string().min(1),
      task_id: z.string().uuid(),
    },
    annotations: { readOnlyHint: true },
  }, async ({ workspace_id, task_id }) => {
    try {
      return await withStore(context.stateDir, async (store) => {
        await assertWorkspace(workspace_id, task_id, context, store);
        return asToolResult({
          task: store.get(task_id), runs: store.getRuns(task_id),
          events: store.events(task_id), review: store.getReview(task_id),
        });
      });
    } catch (error) { return toolFailure(error); }
  });

  server.registerTool("lao_review", {
    title: "Record explicit LAO task review",
    description: "Only after an actual supervisor/user review: record approve/reject/needs_revision, with evidence. Does not merge, write to workspace, or commit.",
    inputSchema: {
      workspace_id: z.string().min(1),
      task_id: z.string().uuid(),
      decision: z.enum(["approved", "rejected", "needs_revision"]),
      criteria_verified: z.boolean(),
      evidence: z.array(z.string().trim().min(1).max(500)).min(1).max(25),
      note: z.string().max(8000),
    },
    annotations: { readOnlyHint: false, destructiveHint: false },
  }, async ({ workspace_id, task_id, decision, criteria_verified, evidence, note }) => {
    try {
      return await withStore(context.stateDir, async (store) => {
        await assertWorkspace(workspace_id, task_id, context, store);
        const review: LaoReview = {
          schemaVersion: 1, taskId: task_id, decision, criteriaVerified: criteria_verified,
          evidence, note, reviewer: "supervisor", decidedAt: new Date().toISOString(),
        };
        return asToolResult({ task: store.decideReview(review), review });
      });
    } catch (error) { return toolFailure(error); }
  });
}

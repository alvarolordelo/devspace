import * as z from "zod/v4";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import type { McpRegistrationTarget } from "../mcp-modern-server.js";
import type { WorkspaceRegistry } from "../workspaces.js";
import type { LaoConfig } from "./config.js";
import { LaoOllamaClient } from "./ollama-client.js";
import { measureLaoReadiness } from "./health.js";
import { LaoTaskStore } from "./task-store.js";
import { LaoReadOnlyRunner } from "./task-runner.js";
import { LaoIsolatedWriteRunner } from "./write-task-runner.js";
import { validateLaoStaticWrite } from "./write-validation.js";
import { runLaoSandboxTests } from "./write-test-sandbox.js";
import { normalizeLaoPatchPath } from "./worktree-patch.js";
import { loadLaoReadContext } from "./read-context.js";
import type { LaoReview } from "./contracts.js";

type Target = Pick<McpRegistrationTarget, "registerTool">;

export interface LaoMcpContext {
  stateDir: string;
  workspaces: Pick<WorkspaceRegistry, "getWorkspace"> & Partial<Pick<WorkspaceRegistry, "resolvePath" | "openWorkspace">>;
  worktreeRoot?: string;
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


  // Write-capable tools are not advertised to discovery-only callers.
  // Creation requires DevSpace's actual authorized-workspace registry and
  // its configured, managed worktree root. No shell is given to Ollama.
  if (context.worktreeRoot && context.workspaces.openWorkspace) {
    const openManaged = context.workspaces.openWorkspace.bind(context.workspaces);
    const gitBranch = promisify(execFile);
    server.registerTool("lao_write_prepare", {
      title: "Prepare supervised isolated LAO task",
      description: "Create a fresh managed detached worktree from an authorized feature checkout, then persist a bounded task with exact write paths. Does not execute a model or patch.",
      inputSchema: {
        source_workspace_id: z.string().min(1),
        goal: z.string().trim().min(1).max(4000),
        acceptance_criteria: z.array(z.string().trim().min(1).max(500)).min(1).max(10),
        allowed_write_paths: z.array(z.string().min(1).max(240)).min(1).max(5),
        model: z.string().trim().min(1).max(200).optional(),
        max_wall_seconds: z.number().int().min(1).max(180).optional(),
      },
      annotations: { readOnlyHint: false, destructiveHint: false, openWorldHint: false },
    }, async ({ source_workspace_id, goal, acceptance_criteria,
      allowed_write_paths, model, max_wall_seconds }) => {
      try {
        const source = await context.workspaces.getWorkspace(source_workspace_id);
        if (source.mode !== "checkout" || !source.canonicalRoot) {
          throw new Error("A source checkout is required");
        }
        const normalized = allowed_write_paths.map(normalizeLaoPatchPath);
        const unique = normalized.map(p => process.platform === "win32" ? p.toLowerCase() : p);
        if (new Set(unique).size !== normalized.length) throw new Error("Duplicate write paths");
        const { stdout: branch } = await gitBranch("git",
          ["-C", source.root, "symbolic-ref", "--short", "HEAD"],
          { timeout: 5_000, windowsHide: true });
        if (!branch.trim().startsWith("feature/")) {
          throw new Error("Only an authorized feature-branch checkout can be a write source");
        }
        const { stdout: dirty } = await gitBranch("git",
          ["-C", source.root, "status", "--porcelain=v1"],
          { timeout: 5_000, windowsHide: true });
        if (dirty.trim()) throw new Error("Source checkout must be clean");
        const managed = (await openManaged({ path: source.root, mode: "worktree" })).workspace;
        const task = await withStore(context.stateDir, store =>
          new LaoIsolatedWriteRunner(store, context.ollama ?? new LaoOllamaClient(config),
            context.worktreeRoot!).createTask({
            workspaceId: managed.id, model: model ?? config.defaultModel,
            goal, acceptanceCriteria: acceptance_criteria,
            permissions: { read: true, write: "isolated_worktree",
              shell: "none", allowedWritePaths: normalized },
            limits: { maxRevisions: 2, maxToolCalls: 1, maxWallSeconds: max_wall_seconds ?? 90 },
            requireReview: true,
          }, managed));
        return asToolResult({
          task_id: task.id, workspace_id: managed.id, status: task.status,
          allowed_write_paths: task.permissions.allowedWritePaths, requires_review: true,
          shell_allowed: false, source_checkout_modified_by_lao: false,
        });
      } catch (error) { return toolFailure(error); }
    });

    server.registerTool("lao_write_run", {
      title: "Run bounded model patch in isolated worktree",
      description: "Execute one model-generated Codex patch through the exact-path worktree broker; store diff evidence and ALWAYS await supervisor review. No shell, tests or approval.",
      inputSchema: {
        workspace_id: z.string().min(1),
        task_id: z.string().uuid(),
        source_files: z.array(z.string().min(1).max(240)).max(3).optional(),
      },
      annotations: { readOnlyHint: false, destructiveHint: false, openWorldHint: false },
    }, async ({ workspace_id, task_id, source_files }, extra) => {
      try {
        return await withStore(context.stateDir, async store => {
          const workspace = await context.workspaces.getWorkspace(workspace_id);
          const task = store.get(task_id);
          if (!task || task.workspaceId !== workspace_id ||
              task.permissions.write !== "isolated_worktree") {
            throw new Error("Write task not accessible");
          }
          const chosen = source_files ?? [];
          if (chosen.length && !context.workspaces.resolvePath)
            throw new Error("Source reading is unavailable");
          const snapshots = chosen.length
            ? await loadLaoReadContext(
              context.workspaces as Pick<WorkspaceRegistry, "resolvePath">, workspace, chosen)
            : [];
          const runner = new LaoIsolatedWriteRunner(
            store, context.ollama ?? new LaoOllamaClient(config), context.worktreeRoot!);
          try {
            const result = await runner.runTask(task_id, workspace, extra?.signal, snapshots);
            return asToolResult({
              task_id, workspace_id, status: result.task.status, run: result.run,
              changed_files: result.outcome.applied.files,
              patch: result.outcome.applied.patch,
              evidence: result.outcome.evidence, requires_review: true,
              tests_verified: false, criteria_verified: false,
            });
          } catch {
            return asToolResult({
              task_id, status: store.get(task_id)?.status, error: "execution_failed",
              requires_review: true, tests_verified: false, criteria_verified: false,
            });
          }
        });
      } catch (error) { return toolFailure(error); }
    });

    server.registerTool("lao_write_validate", {
      title: "Validate supervised write without executing code",
      description: "Re-read persisted worktree evidence and perform bounded integrity, scope, whitespace and syntax checks. Does not run tests, verify acceptance criteria, approve or merge.",
      inputSchema: {
        workspace_id: z.string().min(1),
        task_id: z.string().uuid(),
      },
      annotations: { readOnlyHint: true, openWorldHint: false },
    }, async ({ workspace_id, task_id }) => {
      try {
        return await withStore(context.stateDir, async store => {
          const workspace = await context.workspaces.getWorkspace(workspace_id);
          const task = store.get(task_id);
          if (!task || task.workspaceId !== workspace_id) {
            throw new Error("Write task not accessible");
          }
          const record = store.getWriteEvidence(task_id).at(-1);
          if (!record) throw new Error("No persisted write evidence");
          const result = await validateLaoStaticWrite(task, workspace, context.worktreeRoot!, record);
          return asToolResult({ ...result, requires_review: true });
        });
      } catch (error) { return toolFailure(error); }
    });

    server.registerTool("lao_write_test", {
      title: "Run approved isolated node test suite",
      description: "Run only specified baseline node:test scripts inside a locked, offline Docker sandbox with a locally installed image pinned by host SHA-256. No shell commands from the model. Tests do not verify acceptance criteria or approve changes.",
      inputSchema: {
        workspace_id: z.string().min(1),
        task_id: z.string().uuid(),
        test_files: z.array(z.string().min(1).max(240)).min(1).max(5),
      },
      annotations: { readOnlyHint: false, destructiveHint: false, openWorldHint: false },
    }, async ({ workspace_id, task_id, test_files }, extra) => {
      try {
        return await withStore(context.stateDir, async store => {
          const workspace = await context.workspaces.getWorkspace(workspace_id);
          const task = store.get(task_id);
          if (!task || task.workspaceId !== workspace_id ||
              task.permissions.write !== "isolated_worktree") throw new Error("Write task not accessible");
          const record = store.getWriteEvidence(task_id).at(-1);
          if (!record) throw new Error("No persisted write evidence");
          const evidence = await runLaoSandboxTests(
            task, workspace, context.worktreeRoot!, record, test_files,
            process.env.LAO_SANDBOX_NODE_IMAGE, undefined, extra?.signal,
          );
          store.recordTestEvidence(evidence);
          return asToolResult({ ...evidence, requires_review: true });
        });
      } catch (error) { return toolFailure(error); }
    });
  }

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
          write_evidence: store.getWriteEvidence(task_id),
          test_evidence: store.getTestEvidence(task_id),
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

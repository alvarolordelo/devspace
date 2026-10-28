import * as z from "zod/v4";

export const LAO_CONTRACT_VERSION = 1 as const;

export const laoTaskStateSchema = z.enum([
  "created", "queued", "preparing", "running", "validating",
  "awaiting_review", "needs_revision", "approved", "rejected",
  "failed", "cancelled", "interrupted",
]);
export type LaoTaskState = z.infer<typeof laoTaskStateSchema>;

export const laoLimitsSchema = z.object({
  maxRevisions: z.number().int().min(0).max(2).default(2),
  maxToolCalls: z.number().int().min(1).max(100).default(25),
  maxWallSeconds: z.number().int().min(1).max(3600).default(600),
}).strict();

export const laoPermissionsSchema = z.object({
  read: z.literal(true),
  write: z.enum(["none", "isolated_worktree"]).default("none"),
  shell: z.enum(["none", "allowlist"]).default("none"),
  allowedWritePaths: z.array(z.string().trim().min(1).max(240)).max(20).default([]),
}).strict();

export const laoTaskInputSchema = z.object({
  workspaceId: z.string().trim().min(1).max(200),
  // Provider-neutral origin of the *requesting assistant*, not the model
  // executing the task. Optional for tasks created before this capability.
  requestedBy: z.string().trim().regex(/^[a-z][a-z0-9_-]{0,39}$/).optional(),
  model: z.string().trim().min(1).max(200),
  goal: z.string().trim().min(1).max(8000),
  acceptanceCriteria: z.array(z.string().trim().min(1).max(1000)).min(1).max(30),
  permissions: laoPermissionsSchema,
  limits: laoLimitsSchema,
  requireReview: z.literal(true),
}).strict();
export type LaoTaskInput = z.input<typeof laoTaskInputSchema>;
export type ValidatedLaoTaskInput = z.output<typeof laoTaskInputSchema>;

export const laoTaskSchema = laoTaskInputSchema.extend({
  schemaVersion: z.literal(LAO_CONTRACT_VERSION),
  id: z.string().uuid(),
  traceId: z.string().uuid(),
  status: laoTaskStateSchema,
  revisionCount: z.number().int().min(0),
  createdAt: z.iso.datetime(),
  updatedAt: z.iso.datetime(),
});
export type LaoTask = z.output<typeof laoTaskSchema>;

export const laoRunSchema = z.object({
  schemaVersion: z.literal(LAO_CONTRACT_VERSION),
  id: z.string().uuid(),
  taskId: z.string().uuid(),
  model: z.string().min(1),
  status: z.enum(["running", "completed", "failed", "cancelled", "interrupted"]),
  startedAt: z.iso.datetime(),
  finishedAt: z.iso.datetime().nullable(),
  toolCalls: z.number().int().min(0),
  summary: z.string().max(20000).nullable(),
  errorCode: z.string().max(64).nullable().default(null),
  sourceManifest: z.array(z.object({ path: z.string().min(1).max(240), sha256: z.string().regex(/^[0-9a-f]{64}$/) }).strict()).max(3).default([]),
}).strict();
export type LaoRun = z.output<typeof laoRunSchema>;

export const laoReviewSchema = z.object({
  schemaVersion: z.literal(LAO_CONTRACT_VERSION),
  taskId: z.string().uuid(),
  decision: z.enum(["approved", "rejected", "needs_revision"]),
  reviewer: z.enum(["supervisor", "user"]),
  criteriaVerified: z.boolean(),
  evidence: z.array(z.string().min(1)).min(1),
  note: z.string().max(8000),
  decidedAt: z.iso.datetime(),
}).strict();
export type LaoReview = z.output<typeof laoReviewSchema>;

export const laoHealthSchema = z.object({
  schemaVersion: z.literal(LAO_CONTRACT_VERSION),
  enabled: z.boolean(),
  live: z.boolean(),
  ready: z.boolean(),
  checkedAt: z.iso.datetime(),
  blockingReasons: z.array(z.string()),
}).strict();
export type LaoHealthSnapshot = z.output<typeof laoHealthSchema>;

import { randomUUID } from "node:crypto";
import type { LaoPatchOutcome } from "./worktree-patch.js";
import type { LaoSandboxTestEvidence } from "./write-test-sandbox.js";
import { chmodSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import Database from "better-sqlite3";
import {
  LAO_CONTRACT_VERSION, laoReviewSchema, laoTaskInputSchema, laoTaskSchema,
  type LaoReview, type LaoTask, type LaoTaskInput, type LaoTaskState,
  LAO_CONTRACT_VERSION as RUN_VERSION, laoRunSchema, type LaoRun,
} from "./contracts.js";
import { assertLaoTransition } from "./task-state.js";

export interface LaoStoredWriteEvidence {
  taskId: string;
  runId: string;
  patchSha256: string;
  modelOutputSha256: string;
  normalizationApplied: boolean;
  applied: LaoPatchOutcome["applied"];
  evidence: LaoPatchOutcome["evidence"];
}

export interface LaoTaskEvent {
  id: number;
  taskId: string;
  from: LaoTaskState | null;
  to: LaoTaskState;
  at: string;
}

/** A separate, opt-in database; never migrates DevSpace's existing schema. */
export class LaoTaskStore {
  private readonly sqlite: Database.Database;

  constructor(stateDir: string) {
    const dir = join(stateDir, "lao");
    mkdirSync(dir, { recursive: true, mode: 0o700 });
    const path = join(dir, "lao.sqlite");
    this.sqlite = new Database(path);
    // POSIX modes are best-effort on Windows; local filesystem ACLs still apply.
    chmodSync(path, 0o600);
    this.sqlite.pragma("journal_mode = WAL");
    this.sqlite.pragma("busy_timeout = 5000");
    this.sqlite.pragma("foreign_keys = ON");
    this.sqlite.exec(`
      create table if not exists lao_tasks (
        id text primary key,
        status text not null,
        updated_at text not null,
        record_json text not null
      );
      create index if not exists lao_tasks_status_idx on lao_tasks(status, updated_at);
      create table if not exists lao_events (
        id integer primary key autoincrement,
        task_id text not null references lao_tasks(id) on delete cascade,
        from_status text,
        to_status text not null,
        at text not null
      );
      create index if not exists lao_events_task_idx on lao_events(task_id, id);
      create table if not exists lao_reviews (
        id integer primary key autoincrement,
        task_id text not null references lao_tasks(id) on delete cascade,
        record_json text not null
      );
      create index if not exists lao_reviews_task_idx on lao_reviews(task_id, id);
      create table if not exists lao_runs (
        id text primary key,
        task_id text not null references lao_tasks(id) on delete cascade,
        status text not null,
        record_json text not null
      );
      create index if not exists lao_runs_task_idx on lao_runs(task_id, id);
      create table if not exists lao_write_evidence (
        run_id text primary key references lao_runs(id) on delete cascade,
        task_id text not null references lao_tasks(id) on delete cascade,
        record_json text not null
      );
      create table if not exists lao_write_test_evidence (
        id integer primary key autoincrement,
        task_id text not null references lao_tasks(id) on delete cascade,
        run_id text not null references lao_runs(id) on delete cascade,
        record_json text not null
      );
      create index if not exists lao_write_test_idx on lao_write_test_evidence(task_id, id);
      create table if not exists lao_write_test_leases (
        task_id text primary key references lao_tasks(id) on delete cascade,
        lease_token text not null,
        expires_at_ms integer not null
      );
      create table if not exists lao_daemon_lease (
        id integer primary key check (id = 1),
        token text not null,
        expires_at_ms integer not null
      );
    `);
  }

  /**
   * At most one foreground daemon owns a given LAO state directory, even
   * when operators configure different TCP ports. Lease is persisted in
   * SQLite and can be reclaimed after a crashed process stops renewing.
   */
  acquireDaemonLease(ttlMs = 45_000): string {
    if (!Number.isSafeInteger(ttlMs) || ttlMs < 1 || ttlMs > 60_000) {
      throw new Error("Invalid LAO daemon lease duration");
    }
    return this.sqlite.transaction(() => {
      const row = this.sqlite.prepare(
        "select expires_at_ms from lao_daemon_lease where id = 1"
      ).get() as { expires_at_ms: number } | undefined;
      const now = Date.now();
      if (row && row.expires_at_ms > now) {
        throw new Error("A LAO daemon already owns this state directory");
      }
      const token = randomUUID();
      this.sqlite.prepare(
        "insert into lao_daemon_lease(id, token, expires_at_ms) values (1, ?, ?) " +
        "on conflict(id) do update set token=excluded.token, expires_at_ms=excluded.expires_at_ms"
      ).run(token, now + ttlMs);
      return token;
    }).immediate();
  }

  renewDaemonLease(token: string, ttlMs = 45_000): boolean {
    if (!Number.isSafeInteger(ttlMs) || ttlMs < 1 || ttlMs > 60_000) {
      throw new Error("Invalid LAO daemon lease duration");
    }
    const now = Date.now();
    return this.sqlite.prepare(
      "update lao_daemon_lease set expires_at_ms = ? " +
      "where id = 1 and token = ? and expires_at_ms > ?"
    ).run(now + ttlMs, token, now).changes === 1;
  }

  releaseDaemonLease(token: string): boolean {
    return this.sqlite.prepare(
      "delete from lao_daemon_lease where id = 1 and token = ?"
    ).run(token).changes === 1;
  }

  create(input: LaoTaskInput): LaoTask {
    const data = laoTaskInputSchema.parse(input);
    const now = new Date().toISOString();
    const task = laoTaskSchema.parse({
      ...data, schemaVersion: LAO_CONTRACT_VERSION,
      id: randomUUID(), traceId: randomUUID(), status: "created",
      revisionCount: 0, createdAt: now, updatedAt: now,
    });
    this.sqlite.transaction(() => {
      this.sqlite.prepare("insert into lao_tasks values (?, ?, ?, ?)")
        .run(task.id, task.status, task.updatedAt, JSON.stringify(task));
      this.recordEvent(task.id, null, task.status, now);
    }).immediate();
    return task;
  }

  get(id: string): LaoTask | null {
    const row = this.sqlite.prepare("select record_json from lao_tasks where id = ?")
      .get(id) as { record_json: string } | undefined;
    return row ? laoTaskSchema.parse(JSON.parse(row.record_json)) : null;
  }

  list(): LaoTask[] {
    const rows = this.sqlite.prepare("select record_json from lao_tasks order by updated_at desc, id")
      .all() as Array<{ record_json: string }>;
    return rows.map((row) => laoTaskSchema.parse(JSON.parse(row.record_json)));
  }

  /** Execution transitions cannot approve, reject or request review changes. */
  transition(id: string, to: LaoTaskState): LaoTask {
    return this.sqlite.transaction(() => {
      const current = this.requireTask(id);
      assertLaoTransition(current.status, to, "execution");
      if (current.status === "needs_revision" && to === "queued" &&
          current.revisionCount >= current.limits.maxRevisions) {
        throw new Error("LAO revision budget exhausted");
      }
      const updated: LaoTask = {
        ...current, status: to,
        revisionCount: current.revisionCount + (current.status === "needs_revision" && to === "queued" ? 1 : 0),
        updatedAt: new Date().toISOString(),
      };
      this.save(updated, current.status);
      return updated;
    }).immediate();
  }

  /** Approval is explicit, and only possible with verified criteria and evidence. */
  decideReview(review: LaoReview): LaoTask {
    const decision = laoReviewSchema.parse(review);
    return this.sqlite.transaction(() => {
      const current = this.requireTask(decision.taskId);
      assertLaoTransition(current.status, decision.decision, "review");
      if (current.permissions.write === "isolated_worktree") {
        const testLease = this.sqlite.prepare(
          "select expires_at_ms from lao_write_test_leases where task_id = ?"
        ).get(current.id) as { expires_at_ms: number } | undefined;
        if (testLease && testLease.expires_at_ms > Date.now()) {
          throw new Error("Cannot review write task while isolated tests are active");
        }
      }
      if (decision.decision === "approved" && current.permissions.write !== "none") {
        throw new Error("Write task approval requires deterministic evidence pipeline");
      }
      if (decision.decision === "approved" && !decision.criteriaVerified) {
        throw new Error("Cannot approve without verified acceptance criteria");
      }
      const updated: LaoTask = {
        ...current, status: decision.decision, updatedAt: decision.decidedAt,
      };
      this.save(updated, current.status);
      this.sqlite.prepare("insert into lao_reviews(task_id, record_json) values (?, ?)")
        .run(current.id, JSON.stringify(decision));
      return updated;
    }).immediate();
  }

  getReview(taskId: string): LaoReview | null {
    const row = this.sqlite.prepare("select record_json from lao_reviews where task_id = ? order by id desc limit 1")
      .get(taskId) as { record_json: string } | undefined;
    return row ? laoReviewSchema.parse(JSON.parse(row.record_json)) : null;
  }

  /** Records one run before model execution so crashes leave an audit record. */
  startRun(taskId: string, sourceManifest: LaoRun["sourceManifest"] = []): LaoRun {
    return this.sqlite.transaction(() => {
      const task = this.requireTask(taskId);
      if (task.status !== "running") throw new Error("Run requires running task");
      const existing = this.sqlite.prepare(
        "select id from lao_runs where task_id = ? and status = 'running'"
      ).get(taskId);
      if (existing) throw new Error("A model run is already in progress");
      const run = laoRunSchema.parse({
        schemaVersion: RUN_VERSION, id: randomUUID(), taskId,
        model: task.model, status: "running",
        startedAt: new Date().toISOString(), finishedAt: null,
        toolCalls: 0, summary: null, errorCode: null, sourceManifest,
      });
      this.sqlite.prepare("insert into lao_runs(id, task_id, status, record_json) values (?, ?, ?, ?)")
        .run(run.id, taskId, run.status, JSON.stringify(run));
      return run;
    }).immediate();
  }

  completeRun(id: string, outcome: { status: "completed" | "failed" | "cancelled"; summary?: string; errorCode?: string; toolCalls?: number }): LaoRun {
    return this.sqlite.transaction(() => {
      const row = this.sqlite.prepare("select record_json from lao_runs where id = ?")
        .get(id) as { record_json: string } | undefined;
      if (!row) throw new Error("LAO run not found");
      const run = laoRunSchema.parse(JSON.parse(row.record_json));
      if (run.status !== "running") throw new Error("LAO run already finished");
      const updated = laoRunSchema.parse({
        ...run, status: outcome.status, finishedAt: new Date().toISOString(),
        toolCalls: outcome.toolCalls ?? run.toolCalls,
        summary: outcome.summary?.slice(0, 20000) ?? null,
        errorCode: outcome.errorCode?.slice(0,64) ?? null,
      });
      const changed = this.sqlite.prepare("update lao_runs set status = ?, record_json = ? where id = ? and status = 'running'")
        .run(updated.status, JSON.stringify(updated), id);
      if (changed.changes !== 1) throw new Error("Concurrent run finish");
      return updated;
    }).immediate();
  }

  /** Store a bounded reviewable diff before a run is marked completed. */
  recordWriteEvidence(runId: string, artifact: Omit<LaoStoredWriteEvidence, "runId" | "taskId">): void {
    this.sqlite.transaction(() => {
      const row = this.sqlite.prepare("select task_id, record_json from lao_runs where id = ?")
        .get(runId) as { task_id: string; record_json: string } | undefined;
      if (!row) throw new Error("LAO run not found");
      const run = laoRunSchema.parse(JSON.parse(row.record_json));
      const task = this.requireTask(run.taskId);
      if (run.status !== "running" || task.status !== "running" ||
          task.permissions.write !== "isolated_worktree") {
        throw new Error("Cannot record write evidence outside active write run");
      }
      if (!/^[0-9a-f]{64}$/.test(artifact.patchSha256) ||
          !/^[0-9a-f]{64}$/.test(artifact.modelOutputSha256) ||
          typeof artifact.normalizationApplied !== "boolean" ||
          artifact.evidence.taskId !== task.id ||
          artifact.evidence.workspaceId !== task.workspaceId ||
          !/^[0-9a-f]{64}$/.test(artifact.evidence.contentFingerprint) ||
          artifact.evidence.testsVerified !== false ||
          artifact.evidence.criteriaVerified !== false ||
          JSON.stringify(artifact.applied).length > 100_000) {
        throw new Error("Invalid or unbounded write evidence");
      }
      const data: LaoStoredWriteEvidence = { taskId: task.id, runId, ...artifact };
      this.sqlite.prepare("insert into lao_write_evidence(run_id,task_id,record_json) values(?,?,?)")
        .run(runId, task.id, JSON.stringify(data));
    }).immediate();
  }

  getWriteEvidence(taskId: string): LaoStoredWriteEvidence[] {
    this.requireTask(taskId);
    const rows = this.sqlite.prepare(
      "select record_json from lao_write_evidence where task_id = ? order by rowid",
    ).all(taskId) as Array<{record_json:string}>;
    return rows.map(row => JSON.parse(row.record_json) as LaoStoredWriteEvidence);
  }

  /**
   * One active sandbox suite per task, enforced by SQLite across MCP clients
   * and LAO processes. An expired lease can be reclaimed after a process crash.
   * The opaque token prevents a stale worker from recording/releasing a new lease.
   */
  acquireTestLease(taskId: string, ttlMs = 180_000): string {
    if (!Number.isSafeInteger(ttlMs) || ttlMs < 1 || ttlMs > 180_000) {
      throw new Error("Invalid sandbox lease duration");
    }
    return this.sqlite.transaction(() => {
      const task = this.requireTask(taskId);
      if (task.status !== "awaiting_review" ||
          task.permissions.write !== "isolated_worktree") {
        throw new Error("Test lease requires pending isolated-write review");
      }
      const now = Date.now();
      const row = this.sqlite.prepare(
        "select expires_at_ms from lao_write_test_leases where task_id = ?"
      ).get(taskId) as { expires_at_ms: number } | undefined;
      if (row && row.expires_at_ms > now) {
        throw new Error("Sandbox test already running for this task");
      }
      const token = randomUUID();
      this.sqlite.prepare(
        "insert into lao_write_test_leases(task_id, lease_token, expires_at_ms) values(?,?,?)" +
        " on conflict(task_id) do update set lease_token=excluded.lease_token," +
        " expires_at_ms=excluded.expires_at_ms"
      ).run(taskId, token, now + ttlMs);
      return token;
    }).immediate();
  }

  releaseTestLease(taskId: string, token: string): boolean {
    return this.sqlite.prepare(
      "delete from lao_write_test_leases where task_id = ? and lease_token = ?"
    ).run(taskId, token).changes === 1;
  }

  /** One immutable audit record for each attempted isolated suite. */
  recordTestEvidence(evidence: LaoSandboxTestEvidence, token: string): void {
    this.sqlite.transaction(() => {
      const task = this.requireTask(evidence.taskId);
      const row = this.sqlite.prepare(
        "select run_id from lao_write_evidence where run_id = ? and task_id = ?"
      ).get(evidence.runId, evidence.taskId);
      const lease = this.sqlite.prepare(
        "select lease_token, expires_at_ms from lao_write_test_leases where task_id = ?"
      ).get(evidence.taskId) as { lease_token: string; expires_at_ms: number } | undefined;
      if (!row || !lease || lease.lease_token !== token || lease.expires_at_ms <= Date.now() ||
          task.status !== "awaiting_review" ||
          task.permissions.write !== "isolated_worktree" ||
          evidence.criteriaVerified !== false || evidence.approvalAllowed !== false ||
          JSON.stringify(evidence).length > 8192) {
        throw new Error("Invalid isolated test evidence");
      }
      this.sqlite.prepare(
        "insert into lao_write_test_evidence(task_id,run_id,record_json) values (?,?,?)"
      ).run(evidence.taskId, evidence.runId, JSON.stringify(evidence));
    }).immediate();
  }

  getTestEvidence(taskId: string): LaoSandboxTestEvidence[] {
    this.requireTask(taskId);
    return (this.sqlite.prepare(
      "select record_json from lao_write_test_evidence where task_id = ? order by id"
    ).all(taskId) as Array<{record_json:string}>).map(row =>
      JSON.parse(row.record_json) as LaoSandboxTestEvidence);
  }

  getRuns(taskId: string): LaoRun[] {
    this.requireTask(taskId);
    const rows = this.sqlite.prepare("select record_json from lao_runs where task_id = ? order by rowid")
      .all(taskId) as Array<{ record_json: string }>;
    return rows.map(row => laoRunSchema.parse(JSON.parse(row.record_json)));
  }

  /** Called on LAO startup. Never resumes tasks or writes to a worktree. */
  recoverInterrupted(): number {
    return this.sqlite.transaction(() => {
      const currentRuns = this.sqlite.prepare("select id, record_json from lao_runs where status = 'running'")
        .all() as Array<{id: string;record_json: string}>;
      for (const row of currentRuns) {
        const run = laoRunSchema.parse(JSON.parse(row.record_json));
        const interrupted = laoRunSchema.parse({
          ...run, status: "interrupted", finishedAt: new Date().toISOString(),
        });
        this.sqlite.prepare("update lao_runs set status = ?, record_json = ? where id = ?")
          .run(interrupted.status, JSON.stringify(interrupted), row.id);
      }
      let changed = 0;
      const interruptedStates: LaoTaskState[] = ["preparing", "running", "validating"];
      for (const task of this.list()) {
        if (!interruptedStates.includes(task.status)) continue;
        assertLaoTransition(task.status, "interrupted", "recovery");
        this.save({ ...task, status: "interrupted", updatedAt: new Date().toISOString() }, task.status);
        changed++;
      }
      return changed;
    }).immediate();
  }

  events(id: string): LaoTaskEvent[] {
    const rows = this.sqlite.prepare(
      "select id, task_id, from_status, to_status, at from lao_events where task_id = ? order by id",
    ).all(id) as Array<{id:number;task_id:string;from_status:LaoTaskState|null;to_status:LaoTaskState;at:string}>;
    return rows.map(({ id: eventId, task_id, from_status, to_status, at }) => ({
      id: eventId, taskId: task_id, from: from_status, to: to_status, at,
    }));
  }

  close(): void { this.sqlite.close(); }

  private requireTask(id: string): LaoTask {
    const task = this.get(id);
    if (!task) throw new Error("LAO task not found");
    return task;
  }

  private save(task: LaoTask, previous: LaoTaskState): void {
    laoTaskSchema.parse(task);
    const result = this.sqlite.prepare(
      "update lao_tasks set status = ?, updated_at = ?, record_json = ? where id = ? and status = ?",
    ).run(task.status, task.updatedAt, JSON.stringify(task), task.id, previous);
    if (result.changes !== 1) throw new Error("Concurrent LAO task transition detected");
    this.recordEvent(task.id, previous, task.status, task.updatedAt);
  }

  private recordEvent(taskId: string, from: LaoTaskState | null, to: LaoTaskState, at: string): void {
    this.sqlite.prepare("insert into lao_events(task_id, from_status, to_status, at) values (?, ?, ?, ?)")
      .run(taskId, from, to, at);
  }
}

import { randomUUID } from "node:crypto";
import { chmodSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import Database from "better-sqlite3";
import {
  LAO_CONTRACT_VERSION, laoReviewSchema, laoTaskInputSchema, laoTaskSchema,
  type LaoReview, type LaoTask, type LaoTaskInput, type LaoTaskState,
} from "./contracts.js";
import { assertLaoTransition } from "./task-state.js";

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
    `);
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

  /** Called on LAO startup. Never resumes tasks or writes to a worktree. */
  recoverInterrupted(): number {
    return this.sqlite.transaction(() => {
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

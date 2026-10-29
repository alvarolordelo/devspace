#!/usr/bin/env node
// Local read-only fallback for "continue LAO" when an MCP host has not yet
// refreshed its tool catalog. Never starts or retries tasks, approves or writes.
import Database from "better-sqlite3";
import { isAbsolute, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

export function readLocalLaoContinuation(stateDir, limit = 10) {
  if (!Number.isInteger(limit) || limit < 1 || limit > 20) {
    throw new Error("LAO_CONTINUE_LIMIT_INVALID");
  }
  const db = new Database(join(resolve(stateDir), "lao", "lao.sqlite"),
    { readonly: true, fileMustExist: true });
  try {
    db.pragma("query_only = ON");
    const statuses = ["awaiting_review", "needs_revision", "interrupted"];
    const pending = db.prepare(
      `select record_json from lao_tasks where status in (${statuses.map(() => "?").join(",")})
       order by updated_at desc, id limit ?`
    ).all(...statuses, limit);
    const count = db.prepare(
      `select count(*) as total from lao_tasks where status in (${statuses.map(() => "?").join(",")})`
    ).get(...statuses).total;
    const lastRun = db.prepare(
      "select record_json from lao_runs where task_id = ? order by rowid desc limit 1");
    const lastReview = db.prepare(
      "select record_json from lao_reviews where task_id = ? order by id desc limit 1");
    const lastTest = db.prepare(
      "select record_json from lao_write_test_evidence where task_id = ? order by id desc limit 1");
    const lastWrite = db.prepare(
      "select record_json from lao_write_evidence where task_id = ? order by rowid desc limit 1");
    const tasks = pending.map(({ record_json }) => {
      const task = JSON.parse(record_json);
      const run = lastRun.get(task.id);
      const review = lastReview.get(task.id);
      const test = lastTest.get(task.id);
      const write = lastWrite.get(task.id);
      const r = run ? JSON.parse(run.record_json) : null;
      const rv = review ? JSON.parse(review.record_json) : null;
      const ts = test ? JSON.parse(test.record_json) : null;
      const wr = write ? JSON.parse(write.record_json) : null;
      return {
        task_id: task.id, workspace_id: task.workspaceId,
        requested_by: task.requestedBy ?? "unknown",
        status: task.status, updated_at: task.updatedAt,
        goal: task.goal.slice(0, 1200), model: task.model,
        acceptance_criteria: task.acceptanceCriteria.slice(0, 10),
        write_mode: task.permissions.write,
        latest_run: r ? { status: r.status, model: r.model,
          summary: r.summary?.slice(0, 1800) ?? null,
          error_code: r.errorCode } : null,
        changed_files: wr?.applied?.files?.slice(0, 5).map(file =>
          ({ path: file.path, operation: file.operation })) ?? [],
        latest_test: ts ? { passed: ts.passed, executed: ts.executed,
          failure_code: ts.failureCode } : null,
        latest_review: rv ? { decision: rv.decision,
          note: rv.note.slice(0, 500) } : null,
      };
    });
    return {
      command: "continue_lao", source: "local_read_only",
      tasks, total_pending: count, has_more: count > tasks.length,
      requires_human_review: true, changes_applied: false,
      instruction: "Display pending tasks and ask what to review; do not approve, retry or promote automatically. The local CLI has the operator's filesystem authority; the MCP tool separately validates each workspace.",
    };
  } finally { db.close(); }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const args = process.argv.slice(2);
  const defaultDir = process.platform === "win32" && process.env.LOCALAPPDATA
    ? join(process.env.LOCALAPPDATA, "LAODevSpace", "state")
    : null;
  let stateDir = defaultDir;
  if (args.length === 2 && args[0] === "--state-dir") {
    stateDir = args[1];
  } else if (args.length) {
    console.error("Usage: node scripts/lao-continue.mjs [--state-dir ABSOLUTE_PATH]");
    process.exit(2);
  }
  if (!stateDir) {
    console.error("LAO_CONTINUE_STATE_DIR_UNAVAILABLE");
    process.exit(2);
  }
  if (!isAbsolute(stateDir)) {
    console.error("LAO_CONTINUE_STATE_DIR_MUST_BE_ABSOLUTE");
    process.exit(2);
  }
  try {
    console.log(JSON.stringify(readLocalLaoContinuation(stateDir), null, 2));
  } catch {
    console.error("LAO_CONTINUE_DATABASE_UNAVAILABLE");
    process.exitCode = 1;
  }
}

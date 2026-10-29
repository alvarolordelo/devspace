import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, mkdirSync, rmSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import Database from "better-sqlite3";
import test from "node:test";

const script = fileURLToPath(new URL("../../scripts/lao-continue.mjs", import.meta.url));

test("local 'continue LAO' command reads persisted tasks without changing any status", () => {
  const stateDir = mkdtempSync(join(tmpdir(), "lao-continue-cli-"));
  const dir = join(stateDir, "lao");
  mkdirSync(dir);
  const sqlitePath = join(dir, "lao.sqlite");
  const db = new Database(sqlitePath);
  try {
    db.exec(`
      create table lao_tasks (id text, status text, updated_at text, record_json text);
      create table lao_runs (task_id text, record_json text);
      create table lao_reviews (id integer primary key autoincrement, task_id text, record_json text);
      create table lao_write_test_evidence (id integer primary key autoincrement, task_id text, record_json text);
      create table lao_write_evidence (task_id text, record_json text);
    `);
    for (const [id, status] of [["t1", "awaiting_review"], ["t2", "approved"],
      ["t3", "interrupted"], ["t4", "needs_revision"]] as const) {
      db.prepare("insert into lao_tasks values (?, ?, ?, ?)").run(id, status,
        "2026-10-29T12:00:00.000Z", JSON.stringify({
          id, status, workspaceId: "ws_demo", requestedBy: "gemini",
          updatedAt: "2026-10-29T12:00:00.000Z", goal: "Review saved task",
          model: "local-model", acceptanceCriteria: ["Read safely"],
          permissions: { write: "none" },
        }));
    }
    db.prepare("insert into lao_runs values (?, ?)").run("t1", JSON.stringify({
      status: "completed", model: "local-model", summary: "Persisted result", errorCode: null,
    }));
    const before = db.prepare("select id, status, record_json from lao_tasks order by id").all();
    // Ensure the CLI has to open a separate read-only connection.
    db.close();
    const originalMtime = statSync(sqlitePath).mtimeMs;
    const text = execFileSync(process.execPath, [script, "--state-dir", stateDir], {
      encoding: "utf8", windowsHide: true, timeout: 15_000,
    });
    const response = JSON.parse(text) as {
      command: string; total_pending: number; changes_applied: boolean;
      tasks: Array<{ task_id: string; latest_run: {summary: string} | null }>;
    };
    assert.equal(response.command, "continue_lao");
    assert.equal(response.total_pending, 3);
    assert.equal(response.changes_applied, false);
    assert.equal(response.tasks.some(task => task.task_id === "t2"), false);
    assert.equal(response.tasks.find(task => task.task_id === "t1")?.latest_run?.summary,
      "Persisted result");
    assert.equal(statSync(sqlitePath).mtimeMs, originalMtime,
      "read-only CLI must not rewrite SQLite");
    const reopened = new Database(sqlitePath, { readonly: true, fileMustExist: true });
    try {
      assert.deepEqual(reopened.prepare("select id, status, record_json from lao_tasks order by id").all(), before);
    } finally { reopened.close(); }
  } finally {
    if (db.open) db.close();
    rmSync(stateDir, { recursive: true, force: true });
  }
});

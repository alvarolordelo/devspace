import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, rmSync, writeFileSync, symlinkSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { realpath } from "node:fs/promises";
import test from "node:test";
import { loadLaoReadContext, LAO_MAX_CONTEXT_FILE_BYTES } from "./read-context.js";
import type { Workspace, WorkspaceRegistry } from "../workspaces.js";
import { resolvePathInsideCanonicalRoot } from "../roots.js";

async function fixture() {
  const base = mkdtempSync(join(tmpdir(), "lao-context-"));
  const root = join(base, "repo"), outside = join(base, "outside");
  mkdirSync(root); mkdirSync(outside);
  writeFileSync(join(root, "README.md"), "Repository overview\n");
  writeFileSync(join(root, ".env"), "SECRET=must_not_leak\n");
  writeFileSync(join(root, "oversize.ts"), "x".repeat(LAO_MAX_CONTEXT_FILE_BYTES + 1));
  writeFileSync(join(outside, "outside.md"), "not inside root\n");
  const workspace = { id: "ws", root, canonicalRoot: await realpath(root) } as Workspace;
  const registry = { resolvePath: async (ws: Workspace, path: string) =>
    resolvePathInsideCanonicalRoot(path, ws.root, ws.root, ws.canonicalRoot),
  } as Pick<WorkspaceRegistry, "resolvePath">;
  return { base, root, outside, workspace, registry, cleanup: () =>
    rmSync(base, { recursive: true, force: true }) };
}
test("reads explicit text from approved root without adding unrelated files", async () => {
  const f = await fixture();
  try {
    const files = await loadLaoReadContext(f.registry, f.workspace, ["README.md"]);
    assert.deepEqual(files, [{ path: "README.md", content: "Repository overview\n" }]);
  } finally { f.cleanup(); }
});
test("rejects traversal, absolute paths, secrets, duplicate paths and excess count", async () => {
  const f = await fixture();
  try {
    for (const name of ["../outside/outside.md", "/etc/passwd", ".env", ".git/config", "secret.md", "id_rsa", "a/../../README.md", "oversize.ts", "README.exe", "C:\\Windows\\win.ini"]) {
      await assert.rejects(loadLaoReadContext(f.registry, f.workspace, [name]));
    }
    await assert.rejects(loadLaoReadContext(f.registry, f.workspace, ["README.md", "README.md"]), /Duplicate/);
    await assert.rejects(loadLaoReadContext(f.registry, f.workspace, Array(4).fill("README.md")), /limit/);
    assert.deepEqual(await loadLaoReadContext(f.registry, f.workspace, []), []);
  } finally { f.cleanup(); }
});
test("symlink escaping canonical root is refused", async t => {
  const f = await fixture();
  try {
    try { symlinkSync(join(f.outside, "outside.md"), join(f.root, "linked.md")); }
    catch { t.skip("Symlink unavailable on this Windows account"); return; }
    await assert.rejects(loadLaoReadContext(f.registry, f.workspace, ["linked.md"]));
  } finally { f.cleanup(); }
});

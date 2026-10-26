import { constants } from "node:fs";
import { open, realpath } from "node:fs/promises";
import { isAbsolute, win32, posix, relative, sep } from "node:path";
import type { Workspace } from "../workspaces.js";
import type { WorkspaceRegistry } from "../workspaces.js";

export interface LaoSourceFile { path: string; content: string }
export const LAO_MAX_CONTEXT_FILES = 3;
export const LAO_MAX_CONTEXT_FILE_BYTES = 4_000;
export const LAO_MAX_CONTEXT_TOTAL_BYTES = 12_000;

const blockedSegment = /^(?:\.git|\.ssh|\.aws|\.devspace|node_modules|\.pnpm|\.env(?:\..*)?|\.npmrc|\.netrc|credentials(?:\..*)?|secrets?(?:\..*)?|tokens?(?:\..*)?|id_rsa|id_ed25519)$/i;
const blockedExtension = /\.(?:pem|p12|pfx|key|crt|cer|sqlite|db|env)$/i;
const safeSourceExtension = /\.(?:md|txt|ts|tsx|js|jsx|mjs|cjs|json|yml|yaml|css|scss|html|htm|py|php|java|go|rs|sql|sh|ps1|xml|svg)$/i;

/** Only explicit source files under the active checkout may be sent to a model. */
export async function loadLaoReadContext(
  registry: Pick<WorkspaceRegistry, "resolvePath">,
  workspace: Workspace,
  requestedPaths: readonly string[],
): Promise<LaoSourceFile[]> {
  if (requestedPaths.length > LAO_MAX_CONTEXT_FILES) {
    throw new RangeError("LAO source file limit exceeded");
  }
  const seen = new Set<string>();
  const results: LaoSourceFile[] = [];
  let total = 0;

  for (const input of requestedPaths) {
    if (!input || input.length > 240 || input.includes("\0") ||
        isAbsolute(input) || posix.isAbsolute(input) || win32.isAbsolute(input) ||
        input.startsWith("~") || /[\r\n]/.test(input)) {
      throw new Error("LAO source path must be relative");
    }
    const parts = input.replace(/\\/g, "/").split("/");
    if (parts.some(part => !part || part === "." || part === ".." || blockedSegment.test(part)) ||
        blockedExtension.test(parts.at(-1)!) || !safeSourceExtension.test(parts.at(-1)!)) {
      throw new Error("LAO source path is not allowed");
    }
    const relativePath = parts.join("/");
    const key = process.platform === "win32" ? relativePath.toLowerCase() : relativePath;
    if (seen.has(key)) throw new Error("Duplicate LAO source path");
    seen.add(key);

    // Use the current DevSpace canonical workspace root check, not a new root.
    // resolvePath (rather than resolveReadPath) disallows skill fallbacks.
    const file = await registry.resolvePath(workspace, relativePath);
    const canonical = await realpath(file);
    const rel = relative(workspace.canonicalRoot, canonical);
    if (rel === "" || rel === ".." || rel.startsWith(".." + sep) || isAbsolute(rel)) {
      throw new Error("LAO source escaped workspace");
    }
    const handle = await open(canonical, constants.O_RDONLY | (constants.O_NOFOLLOW ?? 0));
    try {
      const stat = await handle.stat();
      if (!stat.isFile() || stat.size > LAO_MAX_CONTEXT_FILE_BYTES) {
        throw new Error("LAO source file is not a small regular file");
      }
      const bytes = Buffer.alloc(LAO_MAX_CONTEXT_FILE_BYTES + 1);
      const result = await handle.read(bytes, 0, bytes.length, 0);
      if (result.bytesRead > LAO_MAX_CONTEXT_FILE_BYTES) throw new Error("LAO source file is too large");
      total += result.bytesRead;
      if (total > LAO_MAX_CONTEXT_TOTAL_BYTES) throw new Error("LAO source byte budget exceeded");
      const content = new TextDecoder("utf-8", { fatal: true })
        .decode(bytes.subarray(0, result.bytesRead));
      if (content.includes("\0")) throw new Error("Binary file is not allowed");
      results.push({ path: relativePath, content });
    } finally {
      await handle.close();
    }
  }
  return results;
}

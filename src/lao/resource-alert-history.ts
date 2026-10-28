import { appendFile, mkdir, readFile, stat, writeFile } from "node:fs/promises";
import { dirname, isAbsolute } from "node:path";
import type { LaoResourceWarning } from "./resource-alerts.js";

export interface LaoResourceAlertTransition {
  at: string;
  warnings: LaoResourceWarning[];
}

const allowed = new Set<LaoResourceWarning>(["cpu_pressure", "ram_pressure", "vram_pressure"]);

function parseLine(line: string): LaoResourceAlertTransition | null {
  try {
    const value = JSON.parse(line) as { at?: unknown; warnings?: unknown };
    if (typeof value.at !== "string" || !Number.isFinite(Date.parse(value.at)) ||
        !Array.isArray(value.warnings) || value.warnings.length > 3 ||
        value.warnings.some(item => typeof item !== "string" || !allowed.has(item as LaoResourceWarning))) {
      return null;
    }
    return { at: value.at, warnings: [...value.warnings] as LaoResourceWarning[] };
  } catch { return null; }
}

function sameWarnings(a: LaoResourceWarning[], b: LaoResourceWarning[]): boolean {
  return a.length === b.length && a.every((value, index) => value === b[index]);
}

/**
 * Bounded, sanitized JSONL history of pressure transitions only. No process
 * names, task content, prompts, paths or tokens are persisted.
 */
export function createLaoResourceAlertHistory(file: string, maxEntries = 200) {
  if (!isAbsolute(file)) throw new Error("Resource alert history path must be absolute");
  if (!Number.isSafeInteger(maxEntries) || maxEntries < 20 || maxEntries > 1000) {
    throw new RangeError("Resource alert history must retain 20-1000 entries");
  }
  let loaded = false;
  let entries: LaoResourceAlertTransition[] = [];
  let queue = Promise.resolve();
  const load = async () => {
    if (loaded) return;
    loaded = true;
    try {
      const raw = await readFile(file, "utf8");
      if (raw.length > 512 * 1024) return;
      entries = raw.split(/\r?\n/).filter(Boolean).map(parseLine)
        .filter((item): item is LaoResourceAlertTransition => item !== null)
        .slice(-maxEntries);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
    }
  };
  const compact = async () => {
    const body = entries.map(item => JSON.stringify(item)).join("\n") + (entries.length ? "\n" : "");
    await writeFile(file, body, { encoding: "utf8", flag: "w", mode: 0o600 });
  };
  return {
    async record(warnings: LaoResourceWarning[], at = new Date().toISOString()) {
      const work = async () => {
        await load();
        if (!Number.isFinite(Date.parse(at)) || warnings.length > 3 ||
            warnings.some(item => !allowed.has(item))) throw new Error("Invalid resource alert transition");
        const normalized = [...new Set(warnings)].sort() as LaoResourceWarning[];
        const previous = entries.at(-1)?.warnings ?? [];
        if (sameWarnings(previous, normalized)) return false;
        // Do not create a meaningless initial "all clear" event.
        if (entries.length === 0 && normalized.length === 0) return false;
        const item = { at, warnings: normalized } satisfies LaoResourceAlertTransition;
        await mkdir(dirname(file), { recursive: true });
        await appendFile(file, JSON.stringify(item) + "\n", { encoding: "utf8", mode: 0o600 });
        entries.push(item);
        let bytes = 0;
        try { bytes = (await stat(file)).size; } catch { /* next write will retry */ }
        if (entries.length > maxEntries || bytes > 256 * 1024) {
          entries = entries.slice(-maxEntries);
          await compact();
        }
        return true;
      };
      const next = queue.then(work, work);
      queue = next.then(() => undefined, () => undefined);
      return next;
    },
    async read(limit = 20) {
      if (!Number.isSafeInteger(limit) || limit < 1 || limit > 100) {
        throw new RangeError("Resource alert history read limit must be 1-100");
      }
      await queue;
      await load();
      return entries.slice(-limit).map(item => ({ at: item.at, warnings: [...item.warnings] }));
    },
  };
}

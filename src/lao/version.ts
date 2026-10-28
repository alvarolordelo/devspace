import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

export type LaoVersionSnapshot = Readonly<{
  runningVersion: string;
  installedVersion: string;
  updateAvailable: boolean;
}>;

const versionFile = fileURLToPath(new URL("../../docs/lao-devspace/LAO_VERSION.json", import.meta.url));

function readInstalledVersion(): string {
  try {
    const parsed = JSON.parse(readFileSync(versionFile, "utf8")) as {
      schemaVersion?: unknown; product?: unknown; version?: unknown;
    };
    if (parsed.schemaVersion !== 1 || parsed.product !== "LAO DevSpace" ||
        typeof parsed.version !== "string" ||
        !/^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/.test(parsed.version)) return "unknown";
    return parsed.version;
  } catch { return "unknown"; }
}

// Captured once when this daemon build is loaded. If files on disk are later
// replaced, this keeps reporting the version actually running in memory.
const runningVersion = readInstalledVersion();

/** Single source of truth for LAO version reporting. */
export function LAOgetVersion(): LaoVersionSnapshot {
  const installedVersion = readInstalledVersion();
  return {
    runningVersion,
    installedVersion,
    updateAvailable: runningVersion !== "unknown" && installedVersion !== "unknown" &&
      runningVersion !== installedVersion,
  };
}

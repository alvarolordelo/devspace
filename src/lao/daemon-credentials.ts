import { lstatSync, readFileSync } from "node:fs";
import { isAbsolute } from "node:path";
import { validateLaoDashboardToken } from "./dashboard.js";

/**
 * Dashboard credential loading for foreground and Windows service modes.
 * Secrets may be supplied directly by the interactive launcher OR through an
 * absolute protected file path, never both. File contents are never logged.
 */
export function readLaoDashboardToken(env: NodeJS.ProcessEnv = process.env): string | undefined {
  const direct = env.LAO_DASHBOARD_TOKEN;
  const file = env.LAO_DASHBOARD_TOKEN_FILE;
  if (direct && file) throw new Error("Choose LAO_DASHBOARD_TOKEN or LAO_DASHBOARD_TOKEN_FILE, not both");
  if (!file) return validateLaoDashboardToken(direct);
  if (!isAbsolute(file)) throw new Error("LAO_DASHBOARD_TOKEN_FILE must be absolute");
  const entry = lstatSync(file);
  if (!entry.isFile() || entry.isSymbolicLink() || entry.size < 32 || entry.size > 1024) {
    throw new Error("LAO dashboard token file is invalid");
  }
  return validateLaoDashboardToken(readFileSync(file, "utf8").trim());
}

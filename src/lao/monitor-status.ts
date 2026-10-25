/**
 * LAO DevSpace monitor state rules.
 * Pure decision logic; performs no I/O or background work.
 * The LAO monitor is opt-in and is not wired into the stable MCP server.
 */

export const LAO_MONITOR_COMPONENTS = [
  "service",
  "devspace-mcp",
  "ollama",
  "model",
] as const;

export type LaoMonitorComponent = (typeof LAO_MONITOR_COMPONENTS)[number];
export type LaoHealth = "healthy" | "degraded" | "unhealthy" | "unknown";
export type LaoTrayState = "active" | "attention" | "offline" | "idle";

export interface LaoHealthObservation {
  component: LaoMonitorComponent;
  health: LaoHealth;
  checkedAtMs: number;
  details?: string;
}

export interface LaoMonitorResult {
  state: LaoTrayState;
  label: string;
  components: Record<LaoMonitorComponent, LaoHealth>;
  pendingReviews: number;
}

export interface EvaluateLaoMonitorOptions {
  enabled: boolean;
  observations: readonly LaoHealthObservation[];
  nowMs: number;
  pendingReviews?: number;
  staleAfterMs?: number;
}

export const DEFAULT_STATUS_TTL_MS = 15_000;

export function evaluateLaoMonitor({
  enabled,
  observations,
  nowMs,
  pendingReviews = 0,
  staleAfterMs = DEFAULT_STATUS_TTL_MS,
}: EvaluateLaoMonitorOptions): LaoMonitorResult {
  if (!Number.isFinite(nowMs) || nowMs < 0) {
    throw new RangeError("nowMs must be a nonnegative finite number");
  }
  if (!Number.isFinite(staleAfterMs) || staleAfterMs <= 0) {
    throw new RangeError("staleAfterMs must be positive and finite");
  }
  if (!Number.isSafeInteger(pendingReviews) || pendingReviews < 0) {
    throw new RangeError("pendingReviews must be a nonnegative safe integer");
  }

  const components: Record<LaoMonitorComponent, LaoHealth> = {
    service: "unknown",
    "devspace-mcp": "unknown",
    ollama: "unknown",
    model: "unknown",
  };

  // Prefer the latest observation, not whichever happens to arrive last.
  const mostRecent = new Map<LaoMonitorComponent, LaoHealthObservation>();
  for (const item of observations) {
    if (!LAO_MONITOR_COMPONENTS.includes(item.component)) continue;
    const previous = mostRecent.get(item.component);
    if (!previous || item.checkedAtMs > previous.checkedAtMs) {
      mostRecent.set(item.component, item);
    }
  }
  for (const name of LAO_MONITOR_COMPONENTS) {
    const observation = mostRecent.get(name);
    if (!observation) continue;
    const age = nowMs - observation.checkedAtMs;
    if (Number.isFinite(age) && age >= 0 && age <= staleAfterMs) {
      components[name] = observation.health;
    }
  }

  let state: LaoTrayState;
  let label: string;
  if (!enabled) {
    state = "idle";
    label = "Desativado";
  } else if (components.service === "unhealthy") {
    state = "offline";
    label = "Serviço parado";
  } else if (components.service === "unknown") {
    state = "idle";
    label = "Status desconhecido";
  } else if (
    LAO_MONITOR_COMPONENTS.some((component) => components[component] !== "healthy")
  ) {
    state = "attention";
    label = "Atenção necessária";
  } else if (pendingReviews > 0) {
    state = "attention";
    label = "Aguardando revisão";
  } else {
    state = "active";
    label = "Ativo";
  }
  return { state, label, components, pendingReviews };
}

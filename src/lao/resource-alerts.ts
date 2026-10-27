/** Advisory-only, sustained resource pressure. Never start/stop processes. */
export type LaoResourceWarning = "ram_pressure" | "vram_pressure" | "cpu_pressure";
export interface LaoResourceReading {
  cpu: { utilizationPercent: number | null };
  ram: { utilizationPercent: number | null };
  gpu: { vramUsedMiB: number; vramTotalMiB: number } | null;
}

export function createLaoResourceAlertEvaluator(
  requiredSamples = 3, minIntervalMs = 8000, now: () => number = Date.now,
) {
  if (!Number.isSafeInteger(requiredSamples) || requiredSamples < 2 || requiredSamples > 10) {
    throw new RangeError("Resource alert confirmation requires 2-10 samples");
  }
  if (!Number.isFinite(minIntervalMs) || minIntervalMs < 1000 || minIntervalMs > 60_000) {
    throw new RangeError("Resource alert sampling interval must be 1-60 seconds");
  }
  const streak = new Map<LaoResourceWarning, number>();
  let lastSampleAt: number | null = null;
  let lastWarnings: LaoResourceWarning[] = [];
  return (reading: LaoResourceReading) => {
    const timestamp = now();
    if (!Number.isFinite(timestamp) || timestamp < 0) {
      throw new RangeError("Invalid resource alert sampling time");
    }
    if (lastSampleAt !== null && timestamp >= lastSampleAt &&
        timestamp - lastSampleAt < minIntervalMs) {
      return { warnings: [...lastWarnings], requiredSamples, advisoryOnly: true as const };
    }
    if (lastSampleAt !== null &&
        (timestamp < lastSampleAt || timestamp - lastSampleAt > 60_000)) {
      streak.clear();
    }
    lastSampleAt = timestamp;
    const utilization = reading.cpu.utilizationPercent;
    const ram = reading.ram.utilizationPercent;
    const gpu = reading.gpu;
    const conditions: Record<LaoResourceWarning, boolean> = {
      cpu_pressure: utilization !== null && Number.isFinite(utilization) &&
        utilization >= 95 && utilization <= 100,
      ram_pressure: ram !== null && Number.isFinite(ram) && ram >= 90 && ram <= 100,
      vram_pressure: gpu !== null &&
        Number.isFinite(gpu.vramUsedMiB) && Number.isFinite(gpu.vramTotalMiB) &&
        gpu.vramTotalMiB > 0 && gpu.vramUsedMiB >= 0 &&
        gpu.vramUsedMiB <= gpu.vramTotalMiB &&
        gpu.vramUsedMiB / gpu.vramTotalMiB >= 0.9,
    };
    const warnings: LaoResourceWarning[] = [];
    for (const name of ["cpu_pressure", "ram_pressure", "vram_pressure"] as const) {
      const count = conditions[name] ? Math.min(requiredSamples, (streak.get(name) ?? 0) + 1) : 0;
      streak.set(name, count);
      if (count >= requiredSamples) warnings.push(name);
    }
    lastWarnings = warnings;
    return { warnings: [...warnings], requiredSamples, advisoryOnly: true as const };
  };
}

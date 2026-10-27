import { execFile } from "node:child_process";
import { cpus, freemem, totalmem } from "node:os";
import { promisify } from "node:util";
import { createLaoResourceAlertEvaluator } from "./resource-alerts.js";

const execFileAsync = promisify(execFile);
type CpuReading = Readonly<{ idle: number; total: number }>;

function sampleCpu(): CpuReading {
  let idle = 0; let total = 0;
  for (const cpu of cpus()) {
    idle += cpu.times.idle;
    total += cpu.times.user + cpu.times.nice + cpu.times.sys +
      cpu.times.idle + cpu.times.irq;
  }
  return { idle, total };
}

/** Return null instead of guessing CPU load without two valid samples. */
export function cpuUsagePercent(previous: CpuReading | null, current: CpuReading): number | null {
  if (!previous) return null;
  const elapsed = current.total - previous.total;
  const busy = elapsed - (current.idle - previous.idle);
  if (!Number.isFinite(elapsed) || elapsed <= 0 || !Number.isFinite(busy) ||
      busy < 0 || busy > elapsed) return null;
  return Math.round(1000 * busy / elapsed) / 10;
}

export type LaoGpuMetrics = Readonly<{
  utilizationPercent: number; vramUsedMiB: number; vramTotalMiB: number;
}>;

/** Accept a single physical GPU result; never report arbitrary driver output. */
export function parseNvidiaSmiMetrics(raw: string): LaoGpuMetrics | null {
  const lines = raw.trim().split(/\r?\n/);
  if (lines.length !== 1) return null;
  const fields = lines[0]!.split(",").map(x => x.trim());
  if (fields.length !== 3 || fields.some(x => !/^\d{1,6}$/.test(x))) return null;
  const [utilizationPercent, vramUsedMiB, vramTotalMiB] = fields.map(Number);
  if (utilizationPercent === undefined || vramUsedMiB === undefined ||
      vramTotalMiB === undefined || utilizationPercent > 100 ||
      vramTotalMiB <= 0 || vramUsedMiB > vramTotalMiB) return null;
  return { utilizationPercent, vramUsedMiB, vramTotalMiB };
}

async function readNvidiaGpu(): Promise<LaoGpuMetrics | null> {
  try {
    // Fixed executable and arguments; never execute instructions from a task
    // or expose hardware identifiers. Absence/timeout is not a health failure.
    const { stdout } = await execFileAsync("nvidia-smi", [
      "--query-gpu=utilization.gpu,memory.used,memory.total",
      "--format=csv,noheader,nounits",
    ], { timeout: 1500, windowsHide: true, maxBuffer: 4096,
      // NVIDIA's Windows NVML loader requires ProgramFiles to locate its DLLs.
      // Keep the environment bounded rather than forwarding secrets to a driver tool.
      env: { PATH: process.env.PATH, SystemRoot: process.env.SystemRoot,
        ProgramFiles: process.env.ProgramFiles } });
    return parseNvidiaSmiMetrics(stdout);
  } catch { return null; }
}

/** Read-only local diagnostics behind the existing dashboard Bearer token. */
export function createLaoResourceMonitor(gpuProbe: () => Promise<LaoGpuMetrics | null> = readNvidiaGpu) {
  let lastCpu: CpuReading | null = null;
  const assessPressure = createLaoResourceAlertEvaluator();
  return async () => {
    const currentCpu = sampleCpu();
    const cpuPercent = cpuUsagePercent(lastCpu, currentCpu);
    lastCpu = currentCpu;
    const totalRam = totalmem();
    const freeRam = freemem();
    const usedRam = Math.max(0, totalRam - freeRam);
    const node = process.memoryUsage();
    const reading = {
      checkedAt: new Date().toISOString(),
      cpu: { utilizationPercent: cpuPercent, logicalCores: cpus().length },
      ram: { usedBytes: usedRam, totalBytes: totalRam,
        utilizationPercent: totalRam > 0 ? Math.round(1000 * usedRam / totalRam) / 10 : null },
      process: { rssBytes: node.rss, heapUsedBytes: node.heapUsed },
      gpu: await gpuProbe(),
    };
    return { ...reading, alerts: assessPressure(reading) };
  };
}

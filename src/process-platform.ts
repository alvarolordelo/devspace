import { basename } from "node:path";
import { spawnSync } from "node:child_process";

export interface ShellCommand {
  executable: string;
  args: string[];
}

export interface KillableProcess {
  pid?: number;
  kill(signal?: NodeJS.Signals): boolean;
}

interface ProcessTreeRuntime {
  platform: NodeJS.Platform;
  killGroup(pid: number, signal: NodeJS.Signals): void;
  killWindowsTree(pid: number): boolean;
}

const WINDOWS_TREE_KILL_FALLBACK = String.raw`
$ErrorActionPreference = 'Stop'
$rootPid = [int]$env:DEVSPACE_KILL_ROOT_PID
$source = @'
using System;
using System.Collections.Generic;
using System.Runtime.InteropServices;

public static class DevSpaceProcessTree {
    private const uint TH32CS_SNAPPROCESS = 0x00000002;
    private static readonly IntPtr INVALID_HANDLE_VALUE = new IntPtr(-1);

    [StructLayout(LayoutKind.Sequential, CharSet = CharSet.Auto)]
    private struct PROCESSENTRY32 {
        public uint dwSize;
        public uint cntUsage;
        public uint th32ProcessID;
        public IntPtr th32DefaultHeapID;
        public uint th32ModuleID;
        public uint cntThreads;
        public uint th32ParentProcessID;
        public int pcPriClassBase;
        public uint dwFlags;
        [MarshalAs(UnmanagedType.ByValTStr, SizeConst = 260)]
        public string szExeFile;
    }

    [DllImport("kernel32.dll", SetLastError = true)]
    private static extern IntPtr CreateToolhelp32Snapshot(uint dwFlags, uint th32ProcessID);

    [DllImport("kernel32.dll", SetLastError = true, CharSet = CharSet.Auto)]
    private static extern bool Process32First(IntPtr hSnapshot, ref PROCESSENTRY32 lppe);

    [DllImport("kernel32.dll", SetLastError = true, CharSet = CharSet.Auto)]
    private static extern bool Process32Next(IntPtr hSnapshot, ref PROCESSENTRY32 lppe);

    [DllImport("kernel32.dll")]
    private static extern bool CloseHandle(IntPtr hObject);

    public static int[] DescendantsPostOrder(int rootPid) {
        var children = new Dictionary<int, List<int>>();
        var snapshot = CreateToolhelp32Snapshot(TH32CS_SNAPPROCESS, 0);
        if (snapshot == INVALID_HANDLE_VALUE) return new int[0];

        try {
            var entry = new PROCESSENTRY32();
            entry.dwSize = (uint)Marshal.SizeOf(typeof(PROCESSENTRY32));
            if (Process32First(snapshot, ref entry)) {
                do {
                    var parent = (int)entry.th32ParentProcessID;
                    var pid = (int)entry.th32ProcessID;
                    List<int> list;
                    if (!children.TryGetValue(parent, out list)) {
                        list = new List<int>();
                        children[parent] = list;
                    }
                    list.Add(pid);
                    entry.dwSize = (uint)Marshal.SizeOf(typeof(PROCESSENTRY32));
                } while (Process32Next(snapshot, ref entry));
            }
        } finally {
            CloseHandle(snapshot);
        }

        var result = new List<int>();
        var seen = new HashSet<int>();
        Action<int> visit = null;
        visit = pid => {
            if (!seen.Add(pid)) return;
            List<int> list;
            if (children.TryGetValue(pid, out list)) {
                foreach (var child in list) visit(child);
            }
            if (pid != rootPid) result.Add(pid);
        };
        visit(rootPid);
        return result.ToArray();
    }
}
'@

Add-Type -TypeDefinition $source -ErrorAction Stop
$descendants = [DevSpaceProcessTree]::DescendantsPostOrder($rootPid)
foreach ($processId in $descendants) {
    Stop-Process -Id $processId -Force -ErrorAction SilentlyContinue
}
Stop-Process -Id $rootPid -Force -ErrorAction SilentlyContinue
Start-Sleep -Milliseconds 50

$alive = @()
foreach ($processId in @($descendants) + @($rootPid)) {
    if (Get-Process -Id $processId -ErrorAction SilentlyContinue) {
        $alive += $processId
    }
}
if ($alive.Count -gt 0) { exit 1 }
exit 0
`;

function killWindowsTreeWithPowerShell(pid: number): boolean {
  const result = spawnSync(
    "powershell.exe",
    ["-NoProfile", "-NonInteractive", "-ExecutionPolicy", "Bypass", "-Command", WINDOWS_TREE_KILL_FALLBACK],
    {
      stdio: "ignore",
      windowsHide: true,
      env: {
        ...process.env,
        DEVSPACE_KILL_ROOT_PID: String(pid),
      },
    },
  );
  return !result.error && result.status === 0;
}

const defaultProcessTreeRuntime: ProcessTreeRuntime = {
  platform: process.platform,
  killGroup: (pid, signal) => process.kill(-pid, signal),
  killWindowsTree: (pid) => {
    const result = spawnSync("taskkill.exe", ["/pid", String(pid), "/T", "/F"], {
      stdio: "ignore",
      windowsHide: true,
    });
    if (!result.error && result.status === 0) return true;
    return killWindowsTreeWithPowerShell(pid);
  },
};

const LOGIN_SHELLS = new Set(["bash", "ksh", "zsh"]);
const POSIX_SHELLS = new Set(["ash", "dash", "sh"]);

export function resolveShellCommand(
  command: string,
  platform: NodeJS.Platform = process.platform,
  environment: NodeJS.ProcessEnv = process.env,
): ShellCommand {
  if (platform === "win32") {
    return {
      executable: environment.ComSpec ?? environment.COMSPEC ?? "cmd.exe",
      args: ["/d", "/s", "/c", command],
    };
  }

  const configuredShell = environment.SHELL;
  const shellName = configuredShell ? basename(configuredShell) : "";
  if (configuredShell && LOGIN_SHELLS.has(shellName)) {
    return { executable: configuredShell, args: ["-lc", command] };
  }
  if (configuredShell && POSIX_SHELLS.has(shellName)) {
    return { executable: configuredShell, args: ["-c", command] };
  }

  return { executable: "/bin/sh", args: ["-c", command] };
}

export function terminateProcessTree(
  child: KillableProcess,
  signal: NodeJS.Signals,
  detached: boolean,
  runtime: ProcessTreeRuntime = defaultProcessTreeRuntime,
): void {
  if (runtime.platform === "win32" && child.pid) {
    if (runtime.killWindowsTree(child.pid)) return;
  } else if (detached && child.pid) {
    try {
      runtime.killGroup(child.pid, signal);
      return;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ESRCH") return;
    }
  }

  child.kill(signal);
}

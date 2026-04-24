import { execFile } from "child_process";
import { promisify } from "util";
import type { TmuxPaneInfo } from "./types.js";
import { TmuxError } from "./types.js";

const execFileAsync = promisify(execFile);

async function runTmux(args: string[]): Promise<string> {
  try {
    const { stdout } = await execFileAsync("tmux", args);
    return stdout;
  } catch (e: unknown) {
    const err = e as { stderr?: string; message?: string };
    throw new TmuxError(
      `tmux ${args.join(" ")} failed`,
      err.stderr ?? err.message ?? ""
    );
  }
}

export async function listAllPanes(): Promise<TmuxPaneInfo[]> {
  let output: string;
  try {
    output = await runTmux([
      "list-panes",
      "-a",
      "-F",
      "#{session_name}\t#{window_index}\t#{pane_index}\t#{pane_pid}\t#{pane_current_command}\t#{window_name}",
    ]);
  } catch {
    return [];
  }

  return output
    .trim()
    .split("\n")
    .filter((l) => l.length > 0)
    .map((line) => {
      const [session, windowIndex, paneIndex, pid, currentCommand, windowName] =
        line.split("\t");
      const wi = parseInt(windowIndex, 10);
      const pi = parseInt(paneIndex, 10);
      return {
        target: `${session}:${wi}.${pi}`,
        session,
        window_index: wi,
        pane_index: pi,
        pid: parseInt(pid, 10),
        current_command: currentCommand ?? "",
        window_name: windowName ?? "",
      };
    });
}

export async function ensureSession(sessionName: string): Promise<void> {
  try {
    await execFileAsync("tmux", ["has-session", "-t", sessionName]);
  } catch {
    await runTmux(["new-session", "-d", "-s", sessionName]);
  }
}

export async function getPanesInSession(
  sessionName: string
): Promise<TmuxPaneInfo[]> {
  const all = await listAllPanes();
  return all.filter((p) => p.session === sessionName);
}

export async function allocatePane(
  sessionName: string,
  maxPanesPerWindow: number
): Promise<string> {
  await ensureSession(sessionName);
  const panes = await getPanesInSession(sessionName);

  if (panes.length === 0) {
    // session 剛建立，直接使用第一個 pane
    const out = await runTmux([
      "list-panes",
      "-t",
      sessionName,
      "-F",
      "#{session_name}:#{window_index}.#{pane_index}",
    ]);
    return out.trim().split("\n")[0];
  }

  // 統計每個 window 的 pane 數
  const windowPaneCount: Record<number, number> = {};
  let maxWindowIndex = 0;
  for (const p of panes) {
    windowPaneCount[p.window_index] = (windowPaneCount[p.window_index] ?? 0) + 1;
    if (p.window_index > maxWindowIndex) maxWindowIndex = p.window_index;
  }

  const lastWindowCount = windowPaneCount[maxWindowIndex] ?? 0;

  if (lastWindowCount < maxPanesPerWindow) {
    // 在最後一個 window 分割
    const out = await runTmux([
      "split-window",
      "-t",
      `${sessionName}:${maxWindowIndex}`,
      "-h",
      "-P",
      "-F",
      "#{session_name}:#{window_index}.#{pane_index}",
    ]);
    return out.trim();
  } else {
    // 開新 window
    const out = await runTmux([
      "new-window",
      "-t",
      sessionName,
      "-P",
      "-F",
      "#{session_name}:#{window_index}.#{pane_index}",
    ]);
    return out.trim();
  }
}

export async function sendKeys(
  target: string,
  keys: string,
  pressEnter: boolean = true
): Promise<void> {
  const args = pressEnter
    ? ["send-keys", "-t", target, keys, "Enter"]
    : ["send-keys", "-t", target, keys];
  await runTmux(args);
}

export async function killPane(target: string): Promise<void> {
  try {
    await runTmux(["kill-pane", "-t", target]);
  } catch {
    // pane 不存在時忽略
  }
}

export async function hasPaneAlive(target: string): Promise<boolean> {
  try {
    await execFileAsync("tmux", ["list-panes", "-t", target]);
    return true;
  } catch {
    return false;
  }
}

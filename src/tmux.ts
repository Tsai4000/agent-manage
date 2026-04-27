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
      "#{session_name}\t#{window_index}\t#{pane_index}\t#{pane_pid}\t#{pane_current_command}\t#{window_name}\t#{pane_id}",
    ]);
  } catch {
    return [];
  }

  return output
    .trim()
    .split("\n")
    .filter((l) => l.length > 0)
    .map((line) => {
      const [session, windowIndex, paneIndex, pid, currentCommand, windowName, paneId] =
        line.split("\t");
      const wi = parseInt(windowIndex, 10);
      const pi = parseInt(paneIndex, 10);
      return {
        target: paneId ?? "",  // pane ID（如 %5），全域唯一且不隨 index 重排改變
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

// 取最近偶數（最小為 2）
function roundToEven(n: number): number {
  if (n <= 1) return 2;
  return n % 2 === 0 ? n : n - 1;
}

async function newWindow(sessionName: string): Promise<string> {
  const out = await runTmux([
    "new-window", "-t", sessionName,
    "-P", "-F", "#{pane_id}",
  ]);
  return out.trim();
}

/**
 * 在 session 中分配下一個 agent pane。
 *
 * orderedWindowTargets：當前活躍 window 中，依建立時間排序的已有 managed pane targets。
 * 空陣列表示需要開新 window。
 *
 * 佈局規則（cols = roundToEven(max)/2，rows 固定 2）：
 *   位置 n，row = floor(n/cols)，col = n%cols
 *   row=0：水平分割前一個 top-row pane → 新增右欄
 *   row=1：垂直分割同欄的 top-row pane → 新增下半
 */
export async function allocatePane(
  sessionName: string,
  maxPanesPerWindow: number,
  orderedWindowTargets: string[]
): Promise<string> {
  await ensureSession(sessionName);

  const n = orderedWindowTargets.length;

  if (n === 0) {
    // new-session 已自動建立 window 0, pane 0，直接用它，不另開 window
    const sessionPanes = await getPanesInSession(sessionName);
    if (sessionPanes.length > 0) {
      sessionPanes.sort((a, b) =>
        a.window_index !== b.window_index
          ? a.window_index - b.window_index
          : a.pane_index - b.pane_index
      );
      return sessionPanes[0].target;
    }
    // 理論上不會發生，保留 fallback
    return newWindow(sessionName);
  }

  // 當前 window 已滿，開新的
  if (n >= maxPanesPerWindow) {
    return newWindow(sessionName);
  }

  const cols = roundToEven(maxPanesPerWindow) / 2;
  const row = Math.floor(n / cols);
  const col = n % cols;

  let splitTarget: string;
  let splitDir: string;

  if (row === 0) {
    // top row：水平分割，在前一個 top-row pane 右側加新欄
    splitTarget = orderedWindowTargets[n - 1];
    splitDir = "-h";
  } else {
    // bottom row：垂直分割，在同欄 top-row pane 下方加下半
    splitTarget = orderedWindowTargets[col];
    splitDir = "-v";
  }

  const out = await runTmux([
    "split-window", "-t", splitTarget,
    splitDir, "-P", "-F", "#{pane_id}",
  ]);
  return out.trim();
}

export async function sendKeys(
  target: string,
  keys: string,
  pressEnter: boolean = true,
  literal: boolean = false,
  enterDelayMs: number = 150
): Promise<void> {
  if (literal) {
    // -l 逐字送出，避免特殊字元被 tmux 當作控制序列（Gemini CLI 等需要此模式）
    await runTmux(["send-keys", "-t", target, "-l", keys]);
    if (pressEnter) {
      // 等待 Ink/raw input handler 處理文字後再送 Enter，避免 Enter 在 state 更新前觸發
      await new Promise((r) => setTimeout(r, enterDelayMs));
      await runTmux(["send-keys", "-t", target, "Enter"]);
    }
  } else {
    await runTmux(["send-keys", "-t", target, keys]);
    if (pressEnter) {
      await new Promise((r) => setTimeout(r, enterDelayMs));
      await runTmux(["send-keys", "-t", target, "Enter"]);
    }
  }
}

export async function killPane(target: string): Promise<void> {
  try {
    await runTmux(["kill-pane", "-t", target]);
  } catch {
    // pane 不存在時忽略
  }
}

export async function hasPaneAlive(target: string): Promise<boolean> {
  const all = await listAllPanes().catch(() => []);
  return all.some((p) => p.target === target);
}

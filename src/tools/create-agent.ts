import { z } from "zod";
import path from "path";
import { readRegistry, setAgent } from "../registry.js";
import { allocatePane, getPanesInSession, sendKeys, hasPaneAlive } from "../tmux.js";
import { createWorktree, removeWorktree } from "../worktree.js";
import type { AgentRecord, Config, TmuxPaneInfo } from "../types.js";

/**
 * 從 registry 中找出「當前活躍 window」的有序 pane targets。
 * 以建立時間排序，過濾已死亡的 pane，並找最後一個仍有空間的 window。
 * 若所有 window 已滿或無 managed pane，回傳空陣列（表示需開新 window）。
 */
function buildOrderedWindowTargets(
  agents: Record<string, AgentRecord>,
  livePanes: TmuxPaneInfo[],
  maxPanesPerWindow: number
): string[] {
  const paneByTarget = new Map(livePanes.map((p) => [p.target, p]));

  // 只保留仍存活的 managed agents，依建立時間排序
  const liveAgents = Object.values(agents)
    .filter((a) => paneByTarget.has(a.tmux_target))
    .sort(
      (a, b) =>
        new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
    );

  // 依 window index 分組
  const byWindow = new Map<number, AgentRecord[]>();
  for (const agent of liveAgents) {
    const wi = paneByTarget.get(agent.tmux_target)!.window_index;
    const list = byWindow.get(wi) ?? [];
    list.push(agent);
    byWindow.set(wi, list);
  }

  if (byWindow.size === 0) return [];

  // 從最新的 window 往回找，回傳第一個仍有空間的 window 的有序 targets
  const sortedWindowIndices = [...byWindow.keys()].sort((a, b) => b - a);
  for (const wi of sortedWindowIndices) {
    const group = byWindow.get(wi)!;
    if (group.length < maxPanesPerWindow) {
      return group.map((a) => a.tmux_target);
    }
  }

  // 所有 window 皆滿
  return [];
}

const CreateAgentSchema = z.object({
  name: z
    .string()
    .regex(/^[a-zA-Z0-9_-]+$/, "Name must match ^[a-zA-Z0-9_-]+$")
    .describe("Agent name (alphanumeric, hyphens, underscores only)"),
  branch: z
    .string()
    .optional()
    .describe(
      "Git branch name. Must follow 'feature/<description>' or 'fix/<description>' convention, " +
      "where <description> is a short kebab-case summary of the work purpose (e.g. feature/add-login-flow, fix/cart-total-overflow). " +
      "Avoid task/ticket numbers. If omitted, defaults to 'feature/<name>' as a fallback."
    ),
  cli_type: z
    .enum(["claude", "gemini", "copilot"])
    .describe("CLI agent to launch. Starts in interactive mode only; extra flags are not allowed."),
  session: z
    .string()
    .optional()
    .describe("tmux session name (overrides config default)"),
});

type ToolResult = { content: Array<{ type: "text"; text: string }> };

// 序列化所有 create_agent 呼叫，避免並發時兩次呼叫讀到相同的 registry 狀態
// 導致分配到相同的 pane target（序號重複）
let createQueue: Promise<ToolResult> = Promise.resolve() as unknown as Promise<ToolResult>;

export function createAgent(args: unknown, config: Config): Promise<ToolResult> {
  const result = createQueue.then(() => doCreateAgent(args, config));
  createQueue = result.catch(() => ({ content: [] } as ToolResult));
  return result;
}

async function doCreateAgent(args: unknown, config: Config) {
  const parsed = CreateAgentSchema.parse(args);
  const { name, cli_type } = parsed;

  const branch = parsed.branch ?? `feature/${name}`;
  const session = parsed.session ?? config.tmuxSession;
  const worktreePath = path.join(config.worktreeRoot, name);

  // 建立 worktree
  await createWorktree({
    projectRoot: config.projectRoot,
    worktreePath,
    branch,
  });

  // 分配 tmux pane，失敗時回滾 worktree
  // 只計算 registry 中已記錄的 targets，避免把使用者的 terminal（如 iTerm2 attach）算進去
  const existingRegistry = await readRegistry(config.registryPath);
  const orderedWindowTargets = buildOrderedWindowTargets(
    existingRegistry.agents,
    await getPanesInSession(session),
    config.maxPanesPerWindow
  );

  let tmuxTarget: string;
  try {
    tmuxTarget = await allocatePane(session, config.maxPanesPerWindow, orderedWindowTargets);
  } catch (e) {
    await removeWorktree({ projectRoot: config.projectRoot, worktreePath }).catch(() => {});
    throw e;
  }

  // 檢查 target 是否已被 registry 占用（tmux 會在 pane 死後重用相同 index）
  const freshRegistry = await readRegistry(config.registryPath);
  for (const [existingId, existingAgent] of Object.entries(freshRegistry.agents)) {
    if (existingAgent.tmux_target === tmuxTarget) {
      await removeWorktree({ projectRoot: config.projectRoot, worktreePath }).catch(() => {});
      const paneAlive = await hasPaneAlive(tmuxTarget);
      throw new Error(
        `[registry 衝突] 分配到的 pane ${tmuxTarget} 已被 registry 中的 agent '${existingAgent.name}'（id: ${existingId}）占用，` +
        `該 pane 目前${paneAlive ? "仍存活" : "已死亡（可能是 tmux index 重用）"}。` +
        `請通知使用者手動處理：若該 agent 已無效，可用 kill_agent 移除（agent_id: ${existingId}），` +
        `或用 update_registry 修正 tmux_target 欄位後再重試。` +
        `本次建立已回滾，worktree 已清除。`
      );
    }
  }

  // cd 到 worktree
  await sendKeys(tmuxTarget, `cd ${worktreePath}`, true);

  // 各 CLI 的預設安全參數：全自動模式 + 路徑限制於 worktree
  const defaultCliArgs: Record<string, string> = {
    claude: "--dangerously-skip-permissions",
    gemini: "--yolo",
    copilot: "--allow-all-tools",
  };

  // 啟動 CLI agent
  const defaultArgs = defaultCliArgs[cli_type] ?? "";
  const cliCmd = [cli_type, defaultArgs].filter(Boolean).join(" ");
  await sendKeys(tmuxTarget, cliCmd, true);

  // 等待 CLI 完成初始化（載入 banner、設定等），避免第一次 send-to-agent 時 input handler 尚未就緒
  const initWaitMs: Record<string, number> = {
    claude: 5000,
    gemini: 3000,
    copilot: 3000,
  };
  await new Promise((r) => setTimeout(r, initWaitMs[cli_type] ?? 3000));

  // 寫入 registry
  const agentId = crypto.randomUUID();
  await setAgent(config.registryPath, agentId, {
    name,
    tmux_target: tmuxTarget,
    worktree_path: worktreePath,
    branch,
    cli_type,
    created_at: new Date().toISOString(),
    status: "running",
  });

  return {
    content: [
      {
        type: "text" as const,
        text: JSON.stringify(
          {
            success: true,
            agent_id: agentId,
            name,
            tmux_target: tmuxTarget,
            worktree_path: worktreePath,
            branch,
            cli_type,
            message: "Agent created and started",
          },
          null,
          2
        ),
      },
    ],
  };
}

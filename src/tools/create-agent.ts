import { z } from "zod";
import path from "path";
import { setAgent } from "../registry.js";
import { allocatePane, sendKeys } from "../tmux.js";
import { createWorktree, removeWorktree } from "../worktree.js";
import type { Config } from "../types.js";

const CreateAgentSchema = z.object({
  name: z
    .string()
    .regex(/^[a-zA-Z0-9_-]+$/, "Name must match ^[a-zA-Z0-9_-]+$")
    .describe("Agent name (alphanumeric, hyphens, underscores only)"),
  branch: z
    .string()
    .optional()
    .describe("Git branch name (default: agent/<name>)"),
  cli_type: z
    .string()
    .describe("CLI agent to launch (e.g. claude, gemini, copilot)"),
  cli_args: z.string().optional().describe("Additional CLI arguments"),
  session: z
    .string()
    .optional()
    .describe("tmux session name (overrides config default)"),
});

export async function createAgent(args: unknown, config: Config) {
  const parsed = CreateAgentSchema.parse(args);
  const {
    name,
    cli_type,
    cli_args,
  } = parsed;

  const branch = parsed.branch ?? `agent/${name}`;
  const session = parsed.session ?? config.tmuxSession;
  const worktreePath = path.join(config.worktreeRoot, name);

  // 建立 worktree
  await createWorktree({
    projectRoot: config.projectRoot,
    worktreePath,
    branch,
  });

  // 分配 tmux pane，失敗時回滾 worktree
  let tmuxTarget: string;
  try {
    tmuxTarget = await allocatePane(session, config.maxPanesPerWindow);
  } catch (e) {
    await removeWorktree({ projectRoot: config.projectRoot, worktreePath }).catch(() => {});
    throw e;
  }

  // cd 到 worktree
  await sendKeys(tmuxTarget, `cd ${worktreePath}`, true);

  // 啟動 CLI agent
  const cliCmd = cli_args ? `${cli_type} ${cli_args}` : cli_type;
  await sendKeys(tmuxTarget, cliCmd, true);

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

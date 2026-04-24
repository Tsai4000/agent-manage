import { z } from "zod";
import { getAgent, deleteAgent } from "../registry.js";
import { killPane } from "../tmux.js";
import { removeWorktree } from "../worktree.js";
import type { Config } from "../types.js";

const KillAgentSchema = z.object({
  agent_id: z.string().describe("Agent ID to kill"),
  remove_worktree: z
    .boolean()
    .optional()
    .default(true)
    .describe("Whether to remove the git worktree (default true)"),
  force: z
    .boolean()
    .optional()
    .default(false)
    .describe("Force kill even if some steps fail"),
});

export async function killAgent(args: unknown, config: Config) {
  const { agent_id, remove_worktree, force } = KillAgentSchema.parse(args);
  const agent = await getAgent(config.registryPath, agent_id);

  let killedPane = false;
  let removedWorktree = false;
  const errors: string[] = [];

  // 關閉 tmux pane
  try {
    await killPane(agent.tmux_target);
    killedPane = true;
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    if (!force) throw e;
    errors.push(`kill pane: ${msg}`);
  }

  // 移除 worktree
  if (remove_worktree) {
    try {
      await removeWorktree({
        projectRoot: config.projectRoot,
        worktreePath: agent.worktree_path,
      });
      removedWorktree = true;
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      if (!force) throw e;
      errors.push(`remove worktree: ${msg}`);
    }
  }

  // 從 registry 刪除
  await deleteAgent(config.registryPath, agent_id);

  return {
    content: [
      {
        type: "text" as const,
        text: JSON.stringify(
          {
            success: true,
            agent_id,
            name: agent.name,
            killed_pane: killedPane,
            removed_worktree: removedWorktree,
            ...(errors.length > 0 ? { warnings: errors } : {}),
          },
          null,
          2
        ),
      },
    ],
  };
}

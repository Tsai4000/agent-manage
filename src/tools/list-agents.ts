import { readRegistry, writeRegistry } from "../registry.js";
import { listAllPanes } from "../tmux.js";
import type { Config, AgentStatus } from "../types.js";

export async function listAgents(_args: unknown, config: Config) {
  const [registry, panes] = await Promise.all([
    readRegistry(config.registryPath),
    listAllPanes(),
  ]);

  const paneMap = new Map(panes.map((p) => [p.target, p]));

  let running = 0;
  let stopped = 0;

  const agents = Object.entries(registry.agents).map(([id, agent]) => {
    const pane = paneMap.get(agent.tmux_target);
    let status: AgentStatus = "stopped";

    if (pane) {
      // shell 以外的程式（如 claude、gemini）視為 running
      const shellCmds = new Set(["bash", "zsh", "sh", "fish"]);
      status = shellCmds.has(pane.current_command) ? "stopped" : "running";
    }

    if (status === "running") running++;
    else stopped++;

    // 更新 registry 中的 status
    registry.agents[id].status = status;

    return {
      id,
      name: agent.name,
      tmux_target: agent.tmux_target,
      cli_type: agent.cli_type,
      status,
      branch: agent.branch,
      worktree_path: agent.worktree_path,
      pane_current_command: pane?.current_command ?? null,
      created_at: agent.created_at,
    };
  });

  // 同步更新 status 到 registry
  await writeRegistry(config.registryPath, registry).catch(() => {});

  return {
    content: [
      {
        type: "text" as const,
        text: JSON.stringify(
          { agents, total: agents.length, running, stopped },
          null,
          2
        ),
      },
    ],
  };
}

import path from "path";
import type { Config } from "./types.js";

// 補充 PATH，處理 IDE 啟動時 /opt/homebrew/bin 不在 PATH 的問題
const extraPaths = "/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin";
process.env.PATH = `${extraPaths}:${process.env.PATH ?? ""}`;

function getConfig(): Config {
  const projectRoot =
    process.env.AGENT_MANAGE_PROJECT_ROOT ?? process.cwd();

  const registryPath =
    process.env.AGENT_MANAGE_REGISTRY_PATH ??
    path.join(projectRoot, ".agent-manage", "registry.json");

  const worktreeRoot =
    process.env.AGENT_MANAGE_WORKTREE_ROOT ??
    path.join(projectRoot, ".agent-worktrees");

  const tmuxSession = process.env.AGENT_MANAGE_TMUX_SESSION ?? "agents";

  const maxPanesPerWindow = process.env.AGENT_MANAGE_MAX_PANES_PER_WINDOW
    ? parseInt(process.env.AGENT_MANAGE_MAX_PANES_PER_WINDOW, 10)
    : 4;

  return {
    projectRoot,
    registryPath,
    worktreeRoot,
    tmuxSession,
    maxPanesPerWindow,
  };
}

export const config: Config = getConfig();

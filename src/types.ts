export type CliType = "claude" | "gemini" | "copilot" | string;
export type AgentStatus = "running" | "stopped" | "unknown";

export interface AgentRecord {
  name: string;
  tmux_target: string;
  worktree_path: string;
  branch: string;
  cli_type: CliType;
  created_at: string;
  status: AgentStatus;
}

export interface Registry {
  agents: Record<string, AgentRecord>;
}

export interface TmuxPaneInfo {
  target: string;
  session: string;
  window_index: number;
  pane_index: number;
  pid: number;
  current_command: string;
  window_name: string;
}

export interface Config {
  projectRoot: string;
  registryPath: string;
  worktreeRoot: string;
  tmuxSession: string;
  maxPanesPerWindow: number;
}

export class AgentNotFoundError extends Error {
  constructor(agentId: string) {
    super(`Agent '${agentId}' not found in registry`);
    this.name = "AgentNotFoundError";
  }
}

export class TmuxError extends Error {
  constructor(message: string, public stderr: string = "") {
    super(`tmux error: ${message}${stderr ? `\n${stderr}` : ""}`);
    this.name = "TmuxError";
  }
}

export class GitWorktreeError extends Error {
  constructor(message: string, public stderr: string = "") {
    super(`Git worktree error: ${message}${stderr ? `\n${stderr}` : ""}`);
    this.name = "GitWorktreeError";
  }
}

export class NotGitRepoError extends Error {
  constructor(path: string) {
    super(
      `'${path}' is not a git repository. git worktree requires a git repo.`
    );
    this.name = "NotGitRepoError";
  }
}

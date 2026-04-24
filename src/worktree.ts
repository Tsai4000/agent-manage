import { execFile } from "child_process";
import { promisify } from "util";
import fs from "fs/promises";
import path from "path";
import { GitWorktreeError, NotGitRepoError } from "./types.js";

const execFileAsync = promisify(execFile);

async function runGit(cwd: string, args: string[]): Promise<string> {
  try {
    const { stdout } = await execFileAsync("git", ["-C", cwd, ...args]);
    return stdout;
  } catch (e: unknown) {
    const err = e as { stderr?: string; message?: string };
    throw new GitWorktreeError(
      `git ${args.join(" ")} failed`,
      err.stderr ?? err.message ?? ""
    );
  }
}

export async function isGitRepo(projectRoot: string): Promise<boolean> {
  try {
    await execFileAsync("git", ["-C", projectRoot, "rev-parse", "--git-dir"]);
    return true;
  } catch {
    return false;
  }
}

export async function branchExists(
  projectRoot: string,
  branch: string
): Promise<boolean> {
  const out = await runGit(projectRoot, ["branch", "--list", branch]);
  return out.trim().length > 0;
}

export async function createWorktree(params: {
  projectRoot: string;
  worktreePath: string;
  branch: string;
}): Promise<void> {
  const { projectRoot, worktreePath, branch } = params;

  if (!(await isGitRepo(projectRoot))) {
    throw new NotGitRepoError(projectRoot);
  }

  // 確保父目錄存在
  await fs.mkdir(path.dirname(worktreePath), { recursive: true });

  // 確認目標路徑不已存在
  try {
    await fs.access(worktreePath);
    throw new GitWorktreeError(`Worktree path already exists: ${worktreePath}`);
  } catch (e: unknown) {
    if ((e as NodeJS.ErrnoException).code !== "ENOENT") throw e;
  }

  const exists = await branchExists(projectRoot, branch);
  if (exists) {
    await runGit(projectRoot, ["worktree", "add", worktreePath, branch]);
  } else {
    await runGit(projectRoot, [
      "worktree",
      "add",
      "-b",
      branch,
      worktreePath,
    ]);
  }
}

export async function removeWorktree(params: {
  projectRoot: string;
  worktreePath: string;
}): Promise<void> {
  const { projectRoot, worktreePath } = params;

  try {
    await runGit(projectRoot, [
      "worktree",
      "remove",
      "--force",
      worktreePath,
    ]);
  } catch {
    // worktree 可能已不存在，強制清理殘留
    await fs.rm(worktreePath, { recursive: true, force: true });
    try {
      await runGit(projectRoot, ["worktree", "prune"]);
    } catch {
      // prune 失敗也忽略
    }
  }
}

import { execFile } from "child_process";
import { promisify } from "util";
import type { Config } from "../types.js";

const execFileAsync = promisify(execFile);

interface DependencyResult {
  name: string;
  installed: boolean;
  version: string | null;
  path: string | null;
}

const CHECKS = [
  { name: "tmux", cmd: "tmux", versionArgs: ["-V"] },
  { name: "git", cmd: "git", versionArgs: ["--version"] },
  { name: "node", cmd: "node", versionArgs: ["--version"] },
  { name: "claude", cmd: "claude", versionArgs: ["--version"] },
  { name: "gemini", cmd: "gemini", versionArgs: ["--version"] },
  { name: "gh (GitHub CLI)", cmd: "gh", versionArgs: ["--version"] },
];

const REQUIRED = new Set(["tmux", "git", "node"]);

export async function checkDependencies(_args: unknown, _config: Config) {
  const results: DependencyResult[] = [];

  for (const check of CHECKS) {
    let binPath: string | null = null;
    let version: string | null = null;

    try {
      const { stdout: whichOut } = await execFileAsync("which", [check.cmd]);
      binPath = whichOut.trim();
    } catch {
      results.push({ name: check.name, installed: false, version: null, path: null });
      continue;
    }

    try {
      const { stdout, stderr } = await execFileAsync(check.cmd, check.versionArgs);
      version = (stdout || stderr).trim().split("\n")[0];
    } catch (e: unknown) {
      const err = e as { stdout?: string; stderr?: string };
      version = ((err.stdout ?? "") + (err.stderr ?? "")).trim().split("\n")[0] || null;
    }

    results.push({ name: check.name, installed: true, version, path: binPath });
  }

  const warnings: string[] = [];
  let allRequiredInstalled = true;

  for (const r of results) {
    const isRequired = REQUIRED.has(r.name);
    if (isRequired && !r.installed) {
      allRequiredInstalled = false;
      warnings.push(`${r.name} is not installed (required)`);
    } else if (!r.installed) {
      warnings.push(`${r.name} is not installed`);
    }
  }

  return {
    content: [
      {
        type: "text" as const,
        text: JSON.stringify({ dependencies: results, all_required_installed: allRequiredInstalled, warnings }, null, 2),
      },
    ],
  };
}

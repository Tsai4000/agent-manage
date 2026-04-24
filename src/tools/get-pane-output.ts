import { execFile } from "child_process";
import { promisify } from "util";
import { z } from "zod";
import { getAgent } from "../registry.js";
import type { Config } from "../types.js";

const execFileAsync = promisify(execFile);

const GetPaneOutputSchema = z.object({
  agent_id: z.string().describe("Agent ID"),
  lines: z
    .number()
    .optional()
    .default(50)
    .describe("Number of history lines to capture (default 50)"),
});

export async function getPaneOutput(args: unknown, config: Config) {
  const { agent_id, lines } = GetPaneOutputSchema.parse(args);
  const agent = await getAgent(config.registryPath, agent_id);

  const { stdout } = await execFileAsync("tmux", [
    "capture-pane",
    "-t", agent.tmux_target,
    "-p",
    "-S", `-${lines}`,
  ]);

  return {
    content: [
      {
        type: "text" as const,
        text: stdout.trimEnd() || "(pane is empty)",
      },
    ],
  };
}

import { z } from "zod";
import { readRegistry, writeRegistry } from "../registry.js";
import { AgentNotFoundError } from "../types.js";
import type { Config } from "../types.js";

const UpdateRegistrySchema = z.object({
  agent_id: z.string().describe("Agent ID to update"),
  updates: z
    .object({
      name: z.string().optional(),
      status: z.enum(["running", "stopped", "unknown"]).optional(),
      tmux_target: z.string().optional(),
      worktree_path: z.string().optional(),
      branch: z.string().optional(),
      cli_type: z.string().optional(),
    })
    .describe("Fields to update (partial update)"),
});

export async function updateRegistry(args: unknown, config: Config) {
  const { agent_id, updates } = UpdateRegistrySchema.parse(args);
  const registry = await readRegistry(config.registryPath);

  if (!registry.agents[agent_id]) {
    throw new AgentNotFoundError(agent_id);
  }

  registry.agents[agent_id] = { ...registry.agents[agent_id], ...updates };
  await writeRegistry(config.registryPath, registry);

  return {
    content: [
      {
        type: "text" as const,
        text: JSON.stringify(registry.agents[agent_id], null, 2),
      },
    ],
  };
}

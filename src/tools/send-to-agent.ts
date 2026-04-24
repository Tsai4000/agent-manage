import { z } from "zod";
import { getAgent } from "../registry.js";
import { sendKeys, hasPaneAlive } from "../tmux.js";
import { AgentNotFoundError } from "../types.js";
import type { Config } from "../types.js";

const SendToAgentSchema = z.object({
  agent_id: z.string().describe("Agent ID from registry"),
  message: z.string().describe("Message or command to send"),
  press_enter: z
    .boolean()
    .optional()
    .default(true)
    .describe("Whether to press Enter after sending (default true)"),
});

export async function sendToAgent(args: unknown, config: Config) {
  const { agent_id, message, press_enter } = SendToAgentSchema.parse(args);
  const agent = await getAgent(config.registryPath, agent_id);

  if (!(await hasPaneAlive(agent.tmux_target))) {
    throw new AgentNotFoundError(
      `Pane '${agent.tmux_target}' for agent '${agent.name}' is no longer alive`
    );
  }

  await sendKeys(agent.tmux_target, message, press_enter);

  return {
    content: [
      {
        type: "text" as const,
        text: `Sent to agent '${agent.name}' (${agent.tmux_target}): ${message}`,
      },
    ],
  };
}

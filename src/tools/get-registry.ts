import { readRegistry } from "../registry.js";
import type { Config } from "../types.js";

export async function getRegistry(_args: unknown, config: Config) {
  const registry = await readRegistry(config.registryPath);
  return {
    content: [
      {
        type: "text" as const,
        text: JSON.stringify(registry, null, 2),
      },
    ],
  };
}

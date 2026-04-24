import fs from "fs/promises";
import path from "path";
import type { Registry, AgentRecord } from "./types.js";

export async function readRegistry(registryPath: string): Promise<Registry> {
  try {
    const content = await fs.readFile(registryPath, "utf-8");
    return JSON.parse(content) as Registry;
  } catch (e: unknown) {
    if ((e as NodeJS.ErrnoException).code === "ENOENT") {
      return { agents: {} };
    }
    throw e;
  }
}

export async function writeRegistry(
  registryPath: string,
  data: Registry
): Promise<void> {
  await fs.mkdir(path.dirname(registryPath), { recursive: true });
  await fs.writeFile(registryPath, JSON.stringify(data, null, 2), "utf-8");
}

export async function getAgent(
  registryPath: string,
  agentId: string
): Promise<AgentRecord> {
  const registry = await readRegistry(registryPath);
  const agent = registry.agents[agentId];
  if (!agent) {
    const { AgentNotFoundError } = await import("./types.js");
    throw new AgentNotFoundError(agentId);
  }
  return agent;
}

export async function setAgent(
  registryPath: string,
  agentId: string,
  record: AgentRecord
): Promise<void> {
  const registry = await readRegistry(registryPath);
  registry.agents[agentId] = record;
  await writeRegistry(registryPath, registry);
}

export async function deleteAgent(
  registryPath: string,
  agentId: string
): Promise<void> {
  const registry = await readRegistry(registryPath);
  delete registry.agents[agentId];
  await writeRegistry(registryPath, registry);
}

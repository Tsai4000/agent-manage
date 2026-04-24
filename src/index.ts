import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import { config } from "./config.js";
import { listAgents } from "./tools/list-agents.js";
import { sendToAgent } from "./tools/send-to-agent.js";
import { createAgent } from "./tools/create-agent.js";
import { killAgent } from "./tools/kill-agent.js";
import { getRegistry } from "./tools/get-registry.js";
import { updateRegistry } from "./tools/update-registry.js";
import { checkDependencies } from "./tools/check-dependencies.js";

const TOOLS = [
  {
    name: "list_agents",
    description: "列出所有 agent 及其 tmux pane 對應資訊與執行狀態",
    inputSchema: { type: "object" as const, properties: {}, required: [] },
    handler: listAgents,
  },
  {
    name: "send_to_agent",
    description: "透過 tmux send-keys 傳送訊息或指令給指定 agent",
    inputSchema: {
      type: "object" as const,
      properties: {
        agent_id: { type: "string", description: "Agent ID（來自 registry）" },
        message: { type: "string", description: "要傳送的訊息或指令" },
        press_enter: {
          type: "boolean",
          description: "傳送後是否按下 Enter（預設 true）",
        },
      },
      required: ["agent_id", "message"],
    },
    handler: sendToAgent,
  },
  {
    name: "create_agent",
    description:
      "建立新 git worktree、分配 tmux pane，並啟動指定 CLI agent（claude/gemini/copilot 等）",
    inputSchema: {
      type: "object" as const,
      properties: {
        name: {
          type: "string",
          description: "Agent 名稱（只允許英數字、連字號、底線）",
        },
        branch: {
          type: "string",
          description: "Git branch 名稱（預設：agent/<name>）",
        },
        cli_type: {
          type: "string",
          description: "要啟動的 CLI agent 指令（如 claude、gemini）",
        },
        cli_args: { type: "string", description: "CLI 的額外參數" },
        session: {
          type: "string",
          description: "tmux session 名稱（覆寫設定預設值）",
        },
      },
      required: ["name", "cli_type"],
    },
    handler: createAgent,
  },
  {
    name: "kill_agent",
    description: "關閉指定 agent 的 tmux pane、移除 worktree 並清除 registry 記錄",
    inputSchema: {
      type: "object" as const,
      properties: {
        agent_id: { type: "string", description: "要關閉的 Agent ID" },
        remove_worktree: {
          type: "boolean",
          description: "是否移除 git worktree（預設 true）",
        },
        force: {
          type: "boolean",
          description: "強制執行，忽略部分步驟失敗（預設 false）",
        },
      },
      required: ["agent_id"],
    },
    handler: killAgent,
  },
  {
    name: "get_registry",
    description: "讀取完整的 agent registry JSON",
    inputSchema: { type: "object" as const, properties: {}, required: [] },
    handler: getRegistry,
  },
  {
    name: "update_registry",
    description: "更新 registry 中指定 agent 的欄位（部分更新）",
    inputSchema: {
      type: "object" as const,
      properties: {
        agent_id: { type: "string", description: "要更新的 Agent ID" },
        updates: {
          type: "object",
          description: "要更新的欄位（部分更新，未提供的欄位不變）",
          properties: {
            name: { type: "string" },
            status: { type: "string", enum: ["running", "stopped", "unknown"] },
            tmux_target: { type: "string" },
            worktree_path: { type: "string" },
            branch: { type: "string" },
            cli_type: { type: "string" },
          },
        },
      },
      required: ["agent_id", "updates"],
    },
    handler: updateRegistry,
  },
  {
    name: "check_dependencies",
    description: "檢查 tmux、git、node、claude、gemini、gh 等必要工具是否已安裝",
    inputSchema: { type: "object" as const, properties: {}, required: [] },
    handler: checkDependencies,
  },
];

const server = new Server(
  { name: "agent-manage", version: "1.0.0" },
  { capabilities: { tools: {} } }
);

server.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: TOOLS.map(({ name, description, inputSchema }) => ({
    name,
    description,
    inputSchema,
  })),
}));

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const tool = TOOLS.find((t) => t.name === request.params.name);
  if (!tool) {
    return {
      isError: true,
      content: [
        { type: "text" as const, text: `Unknown tool: ${request.params.name}` },
      ],
    };
  }
  try {
    return await tool.handler(request.params.arguments ?? {}, config);
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    return {
      isError: true,
      content: [{ type: "text" as const, text: msg }],
    };
  }
});

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  process.stderr.write("agent-manage MCP server started\n");
  process.stderr.write(
    `  project root: ${config.projectRoot}\n`
  );
  process.stderr.write(
    `  registry: ${config.registryPath}\n`
  );
  process.stderr.write(
    `  worktree root: ${config.worktreeRoot}\n`
  );
  process.stderr.write(
    `  tmux session: ${config.tmuxSession} (max ${config.maxPanesPerWindow} panes/window)\n`
  );
}

main().catch((e: unknown) => {
  const msg = e instanceof Error ? e.message : String(e);
  process.stderr.write(`Fatal: ${msg}\n`);
  process.exit(1);
});

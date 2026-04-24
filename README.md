# agent-manage

透過 tmux 管理多個 AI CLI Agent 的 MCP Server。每個 agent 擁有獨立的 tmux pane 與 git worktree。

## Tools

| Tool | 說明 |
|------|------|
| `list_agents` | 列出所有 agent 及其 tmux pane 資訊與執行狀態 |
| `send_to_agent` | 傳送訊息或指令到指定 agent 的 pane |
| `create_agent` | 建立 worktree + tmux pane + 啟動 CLI agent |
| `kill_agent` | 關閉 agent pane、移除 worktree、清除 registry |
| `get_registry` | 讀取完整的 agent registry JSON |
| `update_registry` | 部分更新 registry 中的 agent 記錄 |
| `check_dependencies` | 檢查 tmux、git、node、claude、gemini、gh 是否已安裝 |

## 快速開始

安裝與設定請參考 [INSTALLATION.md](./INSTALLATION.md)。

## 設定

在各專案的 `.mcp.json` 中透過環境變數設定：

```
AGENT_MANAGE_PROJECT_ROOT         — 專案根目錄（必須是 git repo）
AGENT_MANAGE_REGISTRY_PATH        — registry JSON 路徑
AGENT_MANAGE_WORKTREE_ROOT        — worktree 存放目錄
AGENT_MANAGE_TMUX_SESSION         — tmux session 名稱（預設：agents）
AGENT_MANAGE_MAX_PANES_PER_WINDOW — 每個 window 最大 pane 數（預設：4）
```

## 使用範例

```
# 建立一個新 agent，處理 feature branch
create_agent { name: "auth-refactor", cli_type: "claude" }

# 列出所有執行中的 agent
list_agents

# 傳送指令給指定 agent
send_to_agent { agent_id: "<uuid>", message: "implement the login endpoint" }

# 關閉 agent 並清理
kill_agent { agent_id: "<uuid>" }
```

## 視窗佈局

Pane 自動以 2×(N/2) 格狀排列（N = `MAX_PANES_PER_WINDOW`，預設 4）：

```
┌─────────┬─────────┐
│ agent 1 │ agent 2 │
├─────────┼─────────┤
│ agent 3 │ agent 4 │
└─────────┴─────────┘
```

- N 為奇數時自動取最近偶數（例如 5 → 4）
- 同一 window 填滿後，自動在同一 session 開新 window 繼續排列

## 查看 Agent 視窗

**iTerm2（推薦）**：使用原生 tmux 整合，每個 pane 渲染為獨立 iTerm2 視窗，支援滑鼠操作：

```bash
tmux -CC attach -t agents
```

**一般終端機**：

```bash
tmux attach -t agents
```

> `agents` 為預設 session 名稱，若有自訂 `AGENT_MANAGE_TMUX_SESSION` 請替換。
> 呼叫 `list_agents` 時，回傳結果會自動包含對應的 attach 指令。

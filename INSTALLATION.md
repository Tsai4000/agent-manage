# agent-manage MCP Server — 安裝指引

本文件供 AI 助手讀取，用於協助使用者在專案中安裝與設定 `agent-manage` MCP Server。

---

## 系統需求

| 需求 | 最低版本 | 確認指令 |
|------|---------|---------|
| macOS 或 Linux | — | — |
| tmux | 3.0+ | `tmux -V` |
| git | 2.17+（需支援 worktree） | `git --version` |
| Node.js | 18.0+ | `node --version` |
| npm | 8.0+ | `npm --version` |

**選用 CLI Agent**（依需求安裝）：
- Claude：`npm install -g @anthropic-ai/claude-code` 或 `brew install claude`
- Gemini：參考 Google AI Studio CLI 文件
- GitHub Copilot CLI：`npm install -g @githubnext/github-copilot-cli`

---

## 建置步驟

```bash
# 1. 將 agent-manage 放到固定位置（例如 ~/tools/agent-manage）
cd ~/tools/agent-manage

# 2. 安裝相依套件
npm install

# 3. 編譯 TypeScript
npm run build

# 4. 確認編譯結果
ls dist/index.js   # 此檔案應存在
```

---

## 加入至專案

在**專案根目錄**建立或更新 `.mcp.json`：

```json
{
  "mcpServers": {
    "agent-manage": {
      "command": "node",
      "args": ["/agent-manage 的絕對路徑/dist/index.js"],
      "env": {
        "AGENT_MANAGE_PROJECT_ROOT": "/你的專案絕對路徑"
      }
    }
  }
}
```

**注意**：兩個路徑都必須是絕對路徑。`AGENT_MANAGE_PROJECT_ROOT` 必須指向一個 git 儲存庫（`create_agent` 的 worktree 功能需要）。

---

## 環境變數

所有變數皆為選填，預設值以 `AGENT_MANAGE_PROJECT_ROOT` 為基準。

| 變數 | 預設值 | 說明 |
|------|--------|------|
| `AGENT_MANAGE_PROJECT_ROOT` | 伺服器啟動時的 `process.cwd()` | 專案根目錄，建議為 git repo |
| `AGENT_MANAGE_REGISTRY_PATH` | `{PROJECT_ROOT}/.agent-manage/registry.json` | Agent registry JSON 檔案路徑 |
| `AGENT_MANAGE_WORKTREE_ROOT` | `{PROJECT_ROOT}/.agent-worktrees` | git worktree 的存放目錄 |
| `AGENT_MANAGE_TMUX_SESSION` | `agents` | 預設 tmux session 名稱 |
| `AGENT_MANAGE_MAX_PANES_PER_WINDOW` | `4` | 每個 window 的最大 pane 數，超過則開新 window |

### 完整設定範例

```json
{
  "mcpServers": {
    "agent-manage": {
      "command": "node",
      "args": ["/Users/yourname/tools/agent-manage/dist/index.js"],
      "env": {
        "AGENT_MANAGE_PROJECT_ROOT": "/Users/yourname/projects/my-app",
        "AGENT_MANAGE_REGISTRY_PATH": "/Users/yourname/projects/my-app/.agent-manage/registry.json",
        "AGENT_MANAGE_WORKTREE_ROOT": "/Users/yourname/projects/my-app/.agent-worktrees",
        "AGENT_MANAGE_TMUX_SESSION": "my-app-agents",
        "AGENT_MANAGE_MAX_PANES_PER_WINDOW": "4"
      }
    }
  }
}
```

---

## 驗證安裝

設定好 `.mcp.json` 後，請 AI 執行：

```
請使用 check_dependencies 確認 agent-manage 的環境是否就緒。
```

此 tool 會逐一檢查 tmux、git、node，以及選用的 CLI agent（claude、gemini、gh）。

---

## .gitignore 建議

在專案的 `.gitignore` 加入以下兩行：

```
.agent-manage/
.agent-worktrees/
```

---

## 常見問題

### `tmux: command not found`

MCP Server 由 IDE 或 Claude Desktop 啟動時，PATH 可能不包含 tmux 的安裝路徑。伺服器已自動補入 `/opt/homebrew/bin:/usr/local/bin`，若 tmux 裝在其他位置，請手動指定：

```json
"env": {
  "PATH": "/自訂路徑:/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin"
}
```

### `create_agent` 失敗，顯示「not a git repository」

`AGENT_MANAGE_PROJECT_ROOT` 必須指向含有 `.git` 資料夾的目錄。若尚未初始化，請執行 `git init`。

### Registry 檔案不存在

Registry 檔案會在第一次寫入時自動建立，無需手動設定。

### tmux 重啟後 pane target 失效

tmux 重啟後，舊的 pane target 會失效。可用 `update_registry` 更新 `tmux_target`，或以 `kill_agent`（設 `force: true`）清除舊記錄後重新建立。

#!/bin/bash
# 偵測新 worktree 建立，自動 symlink 未追蹤的必要檔案

PREV_HEAD="$1"
BRANCH_CHECKOUT="$3"
NULL_SHA="0000000000000000000000000000000000000000"

# 只在「分支 checkout」且「前一個 HEAD 為空」時觸發（即全新 worktree）
[[ "$BRANCH_CHECKOUT" != "1" ]] && exit 0
[[ "$PREV_HEAD" != "$NULL_SHA" ]] && exit 0

MAIN_WORKTREE=$(git worktree list --porcelain | awk '/^worktree / { print $2; exit }')
CURRENT_WORKTREE=$(git rev-parse --show-toplevel)

# 當前就是 main worktree，跳過
[[ "$MAIN_WORKTREE" == "$CURRENT_WORKTREE" ]] && exit 0

echo "[post-checkout] 偵測到新 worktree，開始 symlink 必要檔案..."

FILES_TO_LINK=(
  ".env"
)

for file in "${FILES_TO_LINK[@]}"; do
  src="$MAIN_WORKTREE/$file"
  dst="$CURRENT_WORKTREE/$file"

  if [[ -f "$src" ]]; then
    ln -sf "$src" "$dst"
    echo "  Linked: $file -> $src"
  else
    echo "  Skip (not found): $file"
  fi
done

echo "[post-checkout] 完成！"

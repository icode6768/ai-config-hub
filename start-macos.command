#!/bin/zsh
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")" && pwd)"
WEBUI_DIR="$ROOT_DIR/webui"
cd "$ROOT_DIR"
export USB_LOBSTER_ROOT="$ROOT_DIR"
export DSH_HOME="$ROOT_DIR/.dsh"
mkdir -p "$DSH_HOME"
export HERMES_HOME="$ROOT_DIR/.hermes"
mkdir -p "$HERMES_HOME"
export PORT=8787
export NO_OPEN_BROWSER=0

# --- 临时屏蔽 ~/.npmrc 的 prefix/globalconfig ---
# NVM 加载时扫描 $HOME/.npmrc，发现 prefix= 就拒绝加载 (nvm.sh:3087)
# 我们已经用 NPM_CONFIG_PREFIX 接管了 npm 前缀，所以用户 .npmrc 里的 prefix 行在本次激活期间没有意义
# 退出时（trap）自动还原，不修改用户配置
if [ -f "$HOME/.npmrc" ] && grep -qE '^(prefix|globalconfig) *=' "$HOME/.npmrc" 2>/dev/null; then
  _USER_NPMRC_BAK="$HOME/.npmrc.lobster.bak.$$"
  cp "$HOME/.npmrc" "$_USER_NPMRC_BAK"
  grep -vE '^(prefix|globalconfig) *=' "$HOME/.npmrc" > "$HOME/.npmrc.lobster.tmp"
  mv "$HOME/.npmrc.lobster.tmp" "$HOME/.npmrc"
  trap 'mv "$_USER_NPMRC_BAK" "$HOME/.npmrc" 2>/dev/null || true; rm -f "$HOME/.npmrc.lobster.tmp"' EXIT INT TERM
  export _USER_NPMRC_BAK
fi

source "$ROOT_DIR/runtime/macos/scripts/activate.sh"

node "$WEBUI_DIR/scripts/launch-portable.mjs"
# 注意：不能用 `exec` —— 会替换当前 shell 进程，trap 不会触发，.npmrc 还原失败

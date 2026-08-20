#!/usr/bin/env bash
# 检查 npm 全局包是否都在 runtime 目录内
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# 运行时根目录在 scripts/ 上一级
RUNTIME_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
NPM_GLOBAL_DIR="$RUNTIME_DIR/npm-global"
NODE_BIN="$RUNTIME_DIR/nvm/versions/node/$(ls "$RUNTIME_DIR/nvm/versions/node/" 2>/dev/null | sort -V | tail -1)/bin"

export PATH="$RUNTIME_DIR/bin:$NPM_GLOBAL_DIR/bin:$NODE_BIN:$PATH"
export NPM_CONFIG_PREFIX="$NPM_GLOBAL_DIR"

GREEN='\033[0;32m'; RED='\033[0;31m'; YELLOW='\033[1;33m'; RESET='\033[0m'

echo ""
echo "=== npm 全局前缀 ==="
echo "  $(npm config get prefix)"
echo ""

echo "=== npm-global/bin 里的所有命令 ==="
if [ -d "$NPM_GLOBAL_DIR/bin" ]; then
  ls -la "$NPM_GLOBAL_DIR/bin/" | grep -v "^total\|^d" | while read -r line; do
    echo "  $line"
  done
else
  echo "  (目录不存在)"
fi
echo ""

echo "=== 全局已安装的包 ==="
npm list -g --depth=0 2>/dev/null
echo ""

echo "=== 关键命令路径检查 ==="
for cmd in openclaw clawdhub claude node npm; do
  path=$(command -v "$cmd" 2>/dev/null)
  if [ -z "$path" ]; then
    printf "${RED}  ❌ %-12s (未找到)${RESET}\n" "$cmd"
  elif echo "$path" | grep -q "$RUNTIME_DIR"; then
    printf "${GREEN}  ✅ %-12s → %s${RESET}\n" "$cmd" "$path"
  else
    printf "${YELLOW}  ⚠️  %-12s → %s (不在 runtime 目录)${RESET}\n" "$cmd" "$path"
  fi
done
echo ""

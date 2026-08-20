#!/usr/bin/env bash
# =============================================================================
# 在 runtime/macos/bin/ 创建自定位 wrapper 脚本（替代绝对路径软链接）
#
# 核心优势：wrapper 脚本用相对路径定位自身 → 无论挂到哪个路径都能工作
#   软链接：node → /Users/apple/.../nvm/versions/node/v24/bin/node  ❌ 换路径就断
#   wrapper：运行时自己找 nvm 目录                                   ✅ 永远有效
#
# 用法: bash link-node.sh [指定版本号，如 v24.14.1]
#       不指定版本则自动选最新已安装版本
# =============================================================================
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# 运行时根目录在 scripts/ 上一级
RUNTIME_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
NVM_DIR="$RUNTIME_DIR/nvm"
BIN_DIR="$RUNTIME_DIR/bin"
VERSIONS_DIR="$NVM_DIR/versions/node"

if [ ! -d "$VERSIONS_DIR" ]; then
  echo "❌ nvm 未安装，请先运行: bash install-node.sh"
  exit 1
fi

# ── 确定目标版本 ──────────────────────────────────────────────────────────────
if [ $# -gt 0 ]; then
  NODE_VERSION="$1"
  [[ "$NODE_VERSION" != v* ]] && NODE_VERSION="v$NODE_VERSION"
else
  # 优先读 nvm default alias，否则取最新版
  NODE_VERSION=""
  ALIAS_FILE="$NVM_DIR/alias/default"
  if [ -f "$ALIAS_FILE" ]; then
    ALIAS=$(cat "$ALIAS_FILE")
    [ -f "$NVM_DIR/alias/$ALIAS" ] && ALIAS=$(cat "$NVM_DIR/alias/$ALIAS")
    NODE_VERSION=$(ls "$VERSIONS_DIR" 2>/dev/null | grep "^${ALIAS%\.*}" | sort -V | tail -1 || true)
  fi
  [ -z "$NODE_VERSION" ] && NODE_VERSION=$(ls "$VERSIONS_DIR" | sort -V | tail -1)
fi

if [ ! -d "$VERSIONS_DIR/$NODE_VERSION/bin" ]; then
  echo "❌ 找不到版本: $NODE_VERSION"
  echo "   已安装: $(ls "$VERSIONS_DIR" | tr '\n' ' ')"
  exit 1
fi

mkdir -p "$BIN_DIR"

echo "🔧 创建自定位 wrapper 脚本（可移植，无绝对路径）"
echo "   目标版本: $NODE_VERSION"
echo ""

# ── 生成 wrapper 函数 ─────────────────────────────────────────────────────────
# wrapper 脚本用 dirname 相对定位，适用于任意挂载路径
make_wrapper() {
  local name="$1"        # 命令名，如 node
  local rel_path="$2"    # 相对 RUNTIME_DIR 的路径，如 nvm/versions/node/VVER/bin/node
  local dst="$BIN_DIR/$name"

  # 先删除旧文件或软链接，避免 cat > 顺着软链接覆写 nvm 真实二进制
  rm -f "$dst"

  # rel_path 里用 VVER 占位，运行时替换为实际最新版本
  cat > "$dst" << 'WRAPPER_EOF'
#!/usr/bin/env bash
# 自定位 wrapper — 无绝对路径，换挂载点也能用
_R="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
_VER="$(ls "$_R/nvm/versions/node/" 2>/dev/null | sort -V | tail -1)"
WRAPPER_EOF

  # 写入实际的 exec 行（把 VVER 替换为变量展开）
  echo "exec \"\$_R/$rel_path\" \"\$@\"" \
    | sed "s|$NODE_VERSION|\$_VER|g" >> "$dst"

  chmod +x "$dst"
}

# node / npm / npx / corepack
for cmd in node npm npx corepack; do
  src_rel="nvm/versions/node/$NODE_VERSION/bin/$cmd"
  if [ -f "$RUNTIME_DIR/$src_rel" ]; then
    make_wrapper "$cmd" "$src_rel"
    printf "   ✅ %-10s (wrapper)\n" "$cmd"
  else
    printf "   ⏭️  %-10s (未找到，跳过)\n" "$cmd"
  fi
done

echo ""
echo "✅ 完成！wrapper 脚本使用相对路径，U盘移动后仍然有效。"
echo ""
echo "验证:"
echo "  export PATH=\"$BIN_DIR:\$PATH\""
echo "  which node && node -v"

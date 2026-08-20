#!/usr/bin/env bash
# =============================================================================
# 安装 NVM + Node.js 到当前 runtime 目录
# 用法: bash install-node.sh [node版本，默认 lts/*]
#        bash install-node.sh 20
#        bash install-node.sh 22
# =============================================================================
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# 运行时根目录在 scripts/ 上一级
RUNTIME_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
NVM_DIR="$RUNTIME_DIR/nvm"
NODE_VERSION="${1:-lts/*}"

echo "=== 安装 NVM + Node.js $NODE_VERSION 到: $NVM_DIR ==="
echo ""

# --- 安装 NVM ---
if [ -f "$NVM_DIR/nvm.sh" ]; then
  # 用 bash -c + 2>/dev/null 隐藏 ~/.npmrc prefix 冲突警告（nvm 仍正常工作）
  NVM_VER=$(bash -c "unset NPM_CONFIG_PREFIX; export NVM_DIR='$NVM_DIR'; . '$NVM_DIR/nvm.sh' 2>/dev/null; nvm --version" 2>/dev/null || echo "unknown")
  echo "✅ NVM 已存在，版本: $NVM_VER"
else
  echo "📦 正在安装 NVM..."
  mkdir -p "$NVM_DIR"

  NVM_LATEST_TAG=$(curl -s https://api.github.com/repos/nvm-sh/nvm/releases/latest \
    | grep '"tag_name"' | head -1 | sed 's/.*"v\([^"]*\)".*/\1/')
  NVM_LATEST_TAG="${NVM_LATEST_TAG:-0.40.1}"

  echo "   NVM 版本: v$NVM_LATEST_TAG"
  curl -o- "https://raw.githubusercontent.com/nvm-sh/nvm/v${NVM_LATEST_TAG}/install.sh" \
    | NVM_DIR="$NVM_DIR" PROFILE=/dev/null bash

  echo "✅ NVM 安装完成"
fi

# --- 检测并修复被破坏的 node 二进制 ---
echo ""
echo "🔍 检查已安装的 node 二进制是否完好..."
FOUND_CORRUPT=0
if [ -d "$NVM_DIR/versions/node" ]; then
  for ver_dir in "$NVM_DIR/versions/node"/*/; do
    [ -d "$ver_dir" ] || continue
    node_bin="$ver_dir/bin/node"
    if [ -f "$node_bin" ] && file "$node_bin" 2>/dev/null | grep -q "shell script"; then
      VER_NAME=$(basename "$ver_dir")
      echo "   ⚠️  $VER_NAME/bin/node 是 shell script（已损坏），删除后重装"
      rm -rf "$ver_dir"
      FOUND_CORRUPT=1
    fi
  done
fi
[ "$FOUND_CORRUPT" -eq 0 ] && echo "   ✅ 二进制完好"
echo ""

# --- 安装 / 重装 Node.js ---
# 用 bash -c 执行，避免 zsh 对 lts/* 做 glob 展开；
# 2>/dev/null 隐藏 ~/.npmrc prefix 冲突警告
echo "📦 正在安装 Node.js $NODE_VERSION..."
bash -c "
  export NVM_DIR='$NVM_DIR'
  unset NPM_CONFIG_PREFIX
  . '$NVM_DIR/nvm.sh' 2>/dev/null
  nvm install '$NODE_VERSION'
  nvm use '$NODE_VERSION'
  nvm alias default '$NODE_VERSION'
  echo 'Node: '\$(node --version)
  echo 'npm:  '\$(npm --version)
"

# 解除 macOS 隔离属性
echo ""
echo "🔓 解除 macOS Gatekeeper 隔离..."
xattr -rd com.apple.quarantine "$NVM_DIR" 2>/dev/null || true

# --- 安装常用全局包（直接用 nvm node 的 npm，临时 unset prefix）---
echo ""
echo "📦 安装常用全局包 (pnpm, yarn)..."
bash -c "
  export NVM_DIR='$NVM_DIR'
  unset NPM_CONFIG_PREFIX
  . '$NVM_DIR/nvm.sh' 2>/dev/null
  npm install -g pnpm yarn --silent
  echo '   pnpm: '\$(pnpm --version)
  echo '   yarn: '\$(yarn --version)
"

# --- 生成可移植 wrapper 脚本 ---
echo ""
echo "🔧 生成 runtime/macos/bin/ wrapper 脚本..."
bash "$SCRIPT_DIR/link-node.sh"

echo ""
echo "✅ Node.js 安装完成，激活环境: source \"$SCRIPT_DIR/activate.sh\""

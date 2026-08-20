#!/usr/bin/env bash
# =============================================================================
# 一键安装所有运行时组件
# 用法: bash setup-all.sh
# =============================================================================
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# 运行时根目录在 scripts/ 上一级
RUNTIME_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"

echo "╔══════════════════════════════════════════════════╗"
echo "║     龙虾面板 · 便携运行时 一键安装               ║"
echo "║     目标目录: $RUNTIME_DIR"
echo "╚══════════════════════════════════════════════════╝"
echo ""

# 确认
read -rp "确认安装到上述目录？[y/N] " confirm
if [[ ! "$confirm" =~ ^[yY]$ ]]; then
  echo "已取消"
  exit 0
fi

echo ""

# 检查 Xcode Command Line Tools
if ! xcode-select -p &>/dev/null; then
  echo "❌ 需要 Xcode Command Line Tools，正在触发安装..."
  xcode-select --install
  echo "请安装完 Xcode CLT 后重新运行此脚本。"
  exit 1
fi

# 创建目录结构
mkdir -p "$RUNTIME_DIR"/{homebrew,nvm,pyenv,bin,npm-global}

# Step 1: Homebrew
echo "━━━ Step 1/3: 安装 Homebrew ━━━"
bash "$SCRIPT_DIR/install-homebrew.sh"
echo ""

# Step 2: Node.js
echo "━━━ Step 2/3: 安装 Node.js (LTS) ━━━"
bash "$SCRIPT_DIR/install-node.sh" "lts/*"
echo ""

# Step 3: Python
echo "━━━ Step 3/3: 安装 Python 3.11 ━━━"
bash "$SCRIPT_DIR/install-python.sh" "3.11.9"
echo ""

# Step 4: 创建可移植 wrapper 脚本（必须在 Node.js 安装后执行）
echo "━━━ Step 4/4: 创建 runtime/macos/bin/ 可移植 wrapper ━━━"
bash "$SCRIPT_DIR/link-node.sh"
echo ""

echo "╔══════════════════════════════════════════════════╗"
echo "║     ✅ 所有组件安装完成！                        ║"
echo "╚══════════════════════════════════════════════════╝"
echo ""
echo "验证安装:"
echo "  bash \"$SCRIPT_DIR/check.sh\""
echo ""
echo "使用方法:"
echo "  source \"$SCRIPT_DIR/activate.sh\""
echo ""
echo "之后每次打开终端，运行上述命令激活环境即可。"
echo "可以将其加入 ~/.zshrc 或 ~/.bashrc（不推荐，会影响系统环境）。"

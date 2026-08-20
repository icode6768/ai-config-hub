#!/usr/bin/env bash
# =============================================================================
# 安装 Homebrew 到当前 runtime 目录（自定位，不影响系统 Homebrew）
# 用法: bash install-homebrew.sh
# =============================================================================
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# 运行时根目录在 scripts/ 上一级
RUNTIME_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
HOMEBREW_DIR="$RUNTIME_DIR/homebrew"

echo "=== 安装 Homebrew 到: $HOMEBREW_DIR ==="
echo ""

# 检查是否已安装
if [ -f "$HOMEBREW_DIR/bin/brew" ]; then
  echo "✅ Homebrew 已存在，跳过安装"
  echo "   版本: $("$HOMEBREW_DIR/bin/brew" --version | head -1)"
  exit 0
fi

# 检查 git 是否可用（用系统自带的 git）
if ! command -v git &>/dev/null; then
  echo "❌ 需要 git，请先安装 Xcode Command Line Tools:"
  echo "   xcode-select --install"
  exit 1
fi

echo "📦 正在 clone Homebrew..."
mkdir -p "$HOMEBREW_DIR"
git clone --depth=1 https://github.com/Homebrew/brew.git "$HOMEBREW_DIR"

echo ""
echo "📦 正在获取 Homebrew-core tap..."
mkdir -p "$HOMEBREW_DIR/Library/Taps/homebrew"
git clone --depth=1 \
  https://github.com/Homebrew/homebrew-core.git \
  "$HOMEBREW_DIR/Library/Taps/homebrew/homebrew-core"

# 解除 macOS 隔离属性（外置设备必须）
echo ""
echo "🔓 解除 macOS Gatekeeper 隔离..."
xattr -rd com.apple.quarantine "$HOMEBREW_DIR" 2>/dev/null || true

# 激活并更新
eval "$("$HOMEBREW_DIR/bin/brew" shellenv)"
export HOMEBREW_NO_AUTO_UPDATE=1
export HOMEBREW_NO_ANALYTICS=1

echo ""
echo "✅ Homebrew 安装完成"
echo "   版本: $(brew --version | head -1)"
echo ""
echo "⚠️  注意: 此 Homebrew 与系统路径隔离，安装包时会从源码编译（较慢）。"
echo "   激活: source \"$SCRIPT_DIR/activate.sh\""


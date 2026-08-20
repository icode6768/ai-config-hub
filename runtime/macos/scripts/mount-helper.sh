#!/usr/bin/env bash
# =============================================================================
# U盘/外置设备挂载助手
# 插入设备后，无论挂载到哪个 /Volumes/xxx 路径，此脚本都能自动定位并激活。
#
# 使用方法（将此命令加入 ~/.zshrc）:
#   alias lobster-env='source "$(ls -d /Volumes/*/龙虾面板/runtime/activate.sh 2>/dev/null | head -1)"'
#
# 或者直接运行此脚本:
#   bash /Volumes/YourDrive/龙虾面板/runtime/mount-helper.sh
# =============================================================================

# 自动定位此文件所在目录
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# 运行时根目录在 scripts/ 上一级
RUNTIME_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"

echo "📍 找到运行时目录: $RUNTIME_DIR"

# 解除整个目录的 macOS 隔离属性（外置设备每次挂载后建议执行）
echo "🔓 解除 Gatekeeper 隔离（可能需要密码）..."
sudo xattr -rd com.apple.quarantine "$RUNTIME_DIR" 2>/dev/null || \
  xattr -rd com.apple.quarantine "$RUNTIME_DIR" 2>/dev/null || true

# 激活环境
# shellcheck source=./activate.sh
source "$SCRIPT_DIR/activate.sh"

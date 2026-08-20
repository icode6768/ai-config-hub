#!/usr/bin/env bash
# =============================================================================
# 龙虾面板 · 便携环境启动器 (macOS)
#
# 运行此脚本 → 打开一个已激活环境的交互式 shell
# 用法:
#   bash start-env.sh
#   ./start-env.sh     (需先 chmod +x)
#
# 双击打开: 在 Finder 中右键 → 打开方式 → Terminal.app
#           或将此文件扩展名改为 .command（macOS 双击即运行）
# =============================================================================

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# 运行时根目录在 scripts/ 上一级
RUNTIME_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"

# 切换到运行时目录
cd "$RUNTIME_DIR" || exit 1

# macOS 默认 shell 是 zsh（Catalina+），老版本可能是 bash
TARGET_SHELL="${SHELL:-/bin/zsh}"

echo "🦞 龙虾面板 · 便携运行环境 (macOS)"
echo "   运行时目录: $RUNTIME_DIR"
echo "   启动 shell: $TARGET_SHELL"
echo ""

# 外置设备首次启动时建议解除 Gatekeeper 隔离
if [[ "$RUNTIME_DIR" == /Volumes/* ]]; then
  echo "🔓 检测到外置设备，尝试解除 Gatekeeper 隔离..."
  xattr -rd com.apple.quarantine "$RUNTIME_DIR" 2>/dev/null || \
    echo "   (若提示权限不足，可手动: sudo xattr -rd com.apple.quarantine \"$RUNTIME_DIR\")"
  echo ""
fi

# 启动子 shell，在 rcfile 里 source activate.sh
# 这样交互式 shell 会保留所有环境变量
SHELL_NAME="$(basename "$TARGET_SHELL")"

case "$SHELL_NAME" in
  zsh)
    # zsh 不支持 --rcfile，用 ZDOTDIR 技巧
    TMP_ZDOT="$(mktemp -d -t lobster-zdot)"
    cat > "$TMP_ZDOT/.zshrc" << ZRC_EOF
# 先加载用户原 zshrc（保留用户配置）
[ -f "\$HOME/.zshrc" ] && source "\$HOME/.zshrc"
# 再加载便携运行时激活脚本
source '$SCRIPT_DIR/activate.sh'
# 在提示符前加标记
export PS1="%{\$fg_bold[cyan]%}(lobster)%{\$reset_color%} \$PS1"
ZRC_EOF
    trap 'rm -rf "$TMP_ZDOT"' EXIT
    ZDOTDIR="$TMP_ZDOT" exec "$TARGET_SHELL" -i
    ;;
  bash)
    exec "$TARGET_SHELL" --rcfile <(echo "
      [ -f /etc/bashrc ] && . /etc/bashrc
      [ -f \"\$HOME/.bashrc\" ] && . \"\$HOME/.bashrc\"
      [ -f \"\$HOME/.bash_profile\" ] && . \"\$HOME/.bash_profile\"
      source '$SCRIPT_DIR/activate.sh'
      export PS1='(lobster) \$PS1'
    ") -i
    ;;
  *)
    echo "⚠️  当前 shell ($TARGET_SHELL) 不支持自动激活。"
    echo "    请在子 shell 中手动运行: source $SCRIPT_DIR/activate.sh"
    exec "$TARGET_SHELL" -i
    ;;
esac

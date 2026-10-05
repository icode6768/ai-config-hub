#!/usr/bin/env bash
# =============================================================================
# 龙虾面板 · 运行环境激活脚本
# 用法: source activate.sh
#
# 特点: 自定位 —— 无论此目录挂载在任何路径（本地/U盘/外置硬盘），
#       脚本都能找到自身位置并正确设置所有环境变量。
# =============================================================================

# --- 获取脚本自身所在目录（自定位核心）---
# 脚本在 macos/scripts/ 下，运行时根目录在上一级 (macos/)
if [ -n "${BASH_SOURCE[0]-}" ]; then
  _SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
elif [ -n "${ZSH_VERSION}" ]; then
  _SCRIPT_DIR="$(cd "$(dirname "${(%):-%x}")" && pwd)"
else
  echo "[activate] 警告: 无法自动定位，请手动设置 _SCRIPT_DIR"
  return 1 2>/dev/null || exit 1
fi

_RUNTIME_DIR="$(cd "$_SCRIPT_DIR/.." && pwd)"

export PORTABLE_RUNTIME_DIR="$_RUNTIME_DIR"

# --- 路径定义 ---
NVM_DIR="$_RUNTIME_DIR/nvm"
PYENV_ROOT="$_RUNTIME_DIR/pyenv"
MISE_DATA_DIR="$_RUNTIME_DIR/mise"
# npm-global 必须放在 nvm/ 子树下：NVM 在加载时检查 NPM_CONFIG_PREFIX
# 是否在 NVM_DIR 内（nvm.sh:3038），否则直接 nvm deactivate 并退出。
NPM_GLOBAL_DIR="$_RUNTIME_DIR/nvm/npm-global"

export NVM_DIR PYENV_ROOT MISE_DATA_DIR NPM_GLOBAL_DIR

# --- npm 全局安装目录重定向到 runtime（覆盖 ~/.npmrc 的 prefix 设置）---
# 必须放在 nvm.sh 加载后；但 NVM 只读不写 NPM_CONFIG_PREFIX，所以可以安全覆盖
export NPM_CONFIG_PREFIX="$NPM_GLOBAL_DIR"
mkdir -p "$NPM_GLOBAL_DIR/bin"

# --- Corepack 镜像（独立于 npm registry，不走 ~/.npmrc）---
# Corepack 下载 pnpm/yarn 时直接连 registry.npmjs.org，国内连通性差
# 通过 COREPACK_NPM_REGISTRY 强制走镜像；与用户 .npmrc 的 registry 保持一致
COREPACK_REGISTRY_DEFAULT="https://registry.npmmirror.com"
export COREPACK_NPM_REGISTRY="${COREPACK_NPM_REGISTRY:-$COREPACK_REGISTRY_DEFAULT}"

# --- 1. NVM (Node.js 版本管理) ---
if [ -f "$NVM_DIR/nvm.sh" ]; then
  export NVM_DIR
  # shellcheck source=/dev/null
  \. "$NVM_DIR/nvm.sh"
  # 自动加载 .nvmrc（如果存在）
  [ -f ".nvmrc" ] && nvm use --silent 2>/dev/null || true
fi

# --- 2. pyenv (Python 版本管理) ---
if [ -d "$PYENV_ROOT/bin" ]; then
  export PYENV_ROOT
  export PATH="$PYENV_ROOT/bin:$PATH"
  if command -v pyenv &>/dev/null; then
    eval "$(pyenv init -)"
    eval "$(pyenv virtualenv-init - 2>/dev/null)" || true
  fi
fi

# --- 4. 本地 bin 目录 + npm 全局 bin（优先级最高）---
export PATH="$_RUNTIME_DIR/bin:$NPM_GLOBAL_DIR/bin:$PATH"

# Load the portable project's API key into this process only. It is never
# printed and the obsolete variable is explicitly cleared.
# (Delegated to load-creds.sh — same helper also used by deepseek harness launchers.)
source "$_SCRIPT_DIR/load-creds.sh"

# 保留对 scripts/ 目录的引用（安装脚本位置）
export PORTABLE_SCRIPTS_DIR="$_SCRIPT_DIR"

# --- 状态报告 ---
echo "✅ 龙虾面板运行环境已激活"
echo "   📍 运行时根目录: $_RUNTIME_DIR"

_print_version() {
  local name="$1" cmd="$2"
  local ver
  if ver=$(eval "$cmd" 2>/dev/null); then
    printf "   %-10s %s\n" "$name" "$ver"
  else
    printf "   %-10s (未安装)\n" "$name"
  fi
}

_print_version "node"      "node --version"
_print_version "npm"       "npm --version"
_print_version "openclaw"  "openclaw --version 2>/dev/null || openclaw -v 2>/dev/null"
_print_version "python3"   "python3 --version"
_print_version "pip3"      "pip3 --version | awk '{print \$2}'"
echo ""

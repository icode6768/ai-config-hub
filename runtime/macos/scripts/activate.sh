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
if [ -n "${BASH_SOURCE[0]}" ]; then
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
HOMEBREW_DIR="$_RUNTIME_DIR/homebrew"
NVM_DIR="$_RUNTIME_DIR/nvm"
PYENV_ROOT="$_RUNTIME_DIR/pyenv"
MISE_DATA_DIR="$_RUNTIME_DIR/mise"
NPM_GLOBAL_DIR="$_RUNTIME_DIR/npm-global"

export HOMEBREW_DIR NVM_DIR PYENV_ROOT MISE_DATA_DIR NPM_GLOBAL_DIR

# --- npm 全局安装目录重定向到 runtime（覆盖 ~/.npmrc 的 prefix 设置）---
# 使用环境变量而非修改 ~/.npmrc，对 nvm 友好且不影响系统 npm
export NPM_CONFIG_PREFIX="$NPM_GLOBAL_DIR"
mkdir -p "$NPM_GLOBAL_DIR/bin"

# --- 1. Homebrew ---
if [ -f "$HOMEBREW_DIR/bin/brew" ]; then
  eval "$("$HOMEBREW_DIR/bin/brew" shellenv)"
  export HOMEBREW_NO_AUTO_UPDATE=1
  export HOMEBREW_NO_ANALYTICS=1
fi

# --- 2. NVM (Node.js 版本管理) ---
if [ -f "$NVM_DIR/nvm.sh" ]; then
  export NVM_DIR
  # shellcheck source=/dev/null
  \. "$NVM_DIR/nvm.sh"
  # 自动加载 .nvmrc（如果存在）
  [ -f ".nvmrc" ] && nvm use --silent 2>/dev/null || true
fi

# --- 3. pyenv (Python 版本管理) ---
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
unset DONGCHUANGAI_KEY
unset DONGCHUANGAI_API_KEY
_PROJECT_ROOT="$(cd "$_RUNTIME_DIR/../.." && pwd)"
if command -v node >/dev/null 2>&1 && [ -f "$_PROJECT_ROOT/config.yaml" ] && [ -d "$_PROJECT_ROOT/webui/node_modules/yaml" ]; then
  DONGCHUANGAI_API_KEY="$(node -e "const fs=require('fs');const YAML=require(process.argv[1]);const c=YAML.parse(fs.readFileSync(process.argv[2],'utf8'));process.stdout.write(String(c?.global?.api?.apiKey??''))" "$_PROJECT_ROOT/webui/node_modules/yaml" "$_PROJECT_ROOT/config.yaml")"
  export DONGCHUANGAI_API_KEY
fi

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

_print_version "brew"      "brew --version | head -1"
_print_version "node"      "node --version"
_print_version "npm"       "npm --version"
_print_version "openclaw"  "openclaw --version 2>/dev/null || openclaw -v 2>/dev/null"
_print_version "python3"   "python3 --version"
_print_version "pip3"      "pip3 --version | awk '{print \$2}'"
echo ""

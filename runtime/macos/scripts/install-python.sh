#!/usr/bin/env bash
# =============================================================================
# 安装 pyenv + Python 到当前 runtime 目录
# 用法: bash install-python.sh [python版本，默认 3.11.9]
#        bash install-python.sh 3.12.3
#        bash install-python.sh 3.10.14 3.11.9   # 同时安装多个版本
# =============================================================================
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# 运行时根目录在 scripts/ 上一级
RUNTIME_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
PYENV_ROOT="$RUNTIME_DIR/pyenv"

# 要安装的 Python 版本列表（默认 3.11.9）
if [ $# -gt 0 ]; then
  PY_VERSIONS=("$@")
else
  PY_VERSIONS=("3.11.9")
fi

echo "=== 安装 pyenv + Python ${PY_VERSIONS[*]} 到: $PYENV_ROOT ==="
echo ""

# --- 检查编译依赖 ---
echo "🔍 检查编译依赖..."
MISSING_DEPS=()

# Xcode Command Line Tools（提供 gcc、make 等）
if ! xcode-select -p &>/dev/null; then
  echo "❌ 缺少 Xcode Command Line Tools，请先运行:"
  echo "   xcode-select --install"
  exit 1
fi

# 检查可选的本地 Homebrew（优先用便携 Homebrew）
BREW_BIN=""
if [ -f "$RUNTIME_DIR/homebrew/bin/brew" ]; then
  BREW_BIN="$RUNTIME_DIR/homebrew/bin/brew"
  eval "$("$BREW_BIN" shellenv)" 2>/dev/null || true
elif command -v brew &>/dev/null; then
  BREW_BIN="$(command -v brew)"
fi

# 安装 Python 编译依赖（通过可用的 Homebrew）
if [ -n "$BREW_BIN" ]; then
  echo "   使用 Homebrew: $BREW_BIN"
  BREW_DEPS=(openssl readline sqlite3 xz zlib tcl-tk)
  for dep in "${BREW_DEPS[@]}"; do
    if ! "$BREW_BIN" list "$dep" &>/dev/null; then
      echo "   安装编译依赖: $dep"
      "$BREW_BIN" install "$dep" || echo "   ⚠️  $dep 安装失败，Python 某些功能可能受限"
    fi
  done
else
  echo "   ⚠️  未找到 Homebrew，Python 某些可选模块可能无法编译"
  echo "      建议先运行: bash install-homebrew.sh"
fi

# --- 安装 pyenv ---
echo ""
if [ -d "$PYENV_ROOT/.git" ]; then
  echo "✅ pyenv 已存在，更新中..."
  git -C "$PYENV_ROOT" pull --quiet origin master
  PYENV_VERSION="$(git -C "$PYENV_ROOT" describe --tags --abbrev=0 2>/dev/null || echo 'latest')"
else
  echo "📦 正在安装 pyenv..."
  git clone --depth=1 https://github.com/pyenv/pyenv.git "$PYENV_ROOT"
  PYENV_VERSION="$(git -C "$PYENV_ROOT" describe --tags --abbrev=0 2>/dev/null || echo 'latest')"
fi

# 编译 pyenv 的动态加速模块（可选，加快 shell 初始化）
(cd "$PYENV_ROOT" && src/configure && make -C src 2>/dev/null) || true

# 安装 pyenv-virtualenv 插件
VIRTUALENV_DIR="$PYENV_ROOT/plugins/pyenv-virtualenv"
if [ ! -d "$VIRTUALENV_DIR" ]; then
  echo "📦 安装 pyenv-virtualenv 插件..."
  git clone --depth=1 https://github.com/pyenv/pyenv-virtualenv.git "$VIRTUALENV_DIR"
fi

echo "✅ pyenv $PYENV_VERSION 安装完成"

# --- 设置 pyenv 环境 ---
export PYENV_ROOT
export PATH="$PYENV_ROOT/bin:$PATH"
eval "$(pyenv init -)"

# --- 安装 Python 版本 ---
for PY_VERSION in "${PY_VERSIONS[@]}"; do
  echo ""
  echo "📦 安装 Python $PY_VERSION..."

  if pyenv versions --bare | grep -q "^${PY_VERSION}$"; then
    echo "   ✅ Python $PY_VERSION 已安装，跳过"
    continue
  fi

  # 设置编译参数（链接 Homebrew 的 openssl 和 readline）
  if [ -n "$BREW_BIN" ]; then
    BREW_PREFIX="$("$BREW_BIN" --prefix)"
    CONFIGURE_OPTS=""
    LDFLAGS="-L$BREW_PREFIX/lib"
    CPPFLAGS="-I$BREW_PREFIX/include"
    export CONFIGURE_OPTS LDFLAGS CPPFLAGS
  fi

  PYTHON_CONFIGURE_OPTS="--enable-optimizations --with-lto" \
    pyenv install "$PY_VERSION"

  echo "   ✅ Python $PY_VERSION 安装完成"
done

# --- 设置默认全局版本 ---
DEFAULT_VERSION="${PY_VERSIONS[0]}"
pyenv global "$DEFAULT_VERSION"

# 解除 macOS 隔离属性
echo ""
echo "🔓 解除 macOS Gatekeeper 隔离..."
xattr -rd com.apple.quarantine "$PYENV_ROOT" 2>/dev/null || true

# --- 安装常用 pip 包 ---
echo ""
echo "📦 安装常用包 (pip, virtualenv, pipenv)..."
pyenv exec pip install --upgrade pip --quiet
pyenv exec pip install virtualenv pipenv --quiet

echo ""
echo "✅ Python 安装完成"
for PY_VERSION in "${PY_VERSIONS[@]}"; do
  if pyenv versions --bare | grep -q "^${PY_VERSION}$"; then
    echo "   Python $PY_VERSION: $(PYENV_VERSION=$PY_VERSION pyenv exec python --version)"
  fi
done
echo ""
echo "激活环境: source \"$SCRIPT_DIR/activate.sh\""

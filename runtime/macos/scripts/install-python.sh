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

# Xcode Command Line Tools（提供 gcc、make 等）
if ! xcode-select -p &>/dev/null; then
  echo "❌ 缺少 Xcode Command Line Tools，请先运行:"
  echo "   xcode-select --install"
  exit 1
fi
echo "   ✅ Xcode Command Line Tools 已就绪"

# 不再通过 Homebrew 安装编译依赖；pyenv 会使用 macOS 自带的 SDK 库
# 若需要完整的 ssl/tcl-tk 支持，可手动安装 Homebrew 后再补装对应 formulae

# --- Python 源镜像（DNS 不通 python.org 时使用）---
# 默认清华 TUNA，国内可达；可运行时覆盖：
#   PYTHON_BUILD_MIRROR_URL=https://your-mirror bash install-python.sh
#
# 工作原理：python-build 默认会拼 `${MIRROR}/<sha256>`，
# 对国内按版本号组织的镜像无效，需要同时设置 SKIP_CHECKSUM 走 sed 重写路径。
# 下载完成后仍会校验 sha256（python-build line 603 的 verify_checksum），安全。
PYTHON_BUILD_MIRROR_URL_DEFAULT="https://mirrors.tuna.tsinghua.edu.cn/python"
export PYTHON_BUILD_MIRROR_URL="${PYTHON_BUILD_MIRROR_URL:-$PYTHON_BUILD_MIRROR_URL_DEFAULT}"
export PYTHON_BUILD_MIRROR_URL_SKIP_CHECKSUM=1
echo "   Python 源镜像: $PYTHON_BUILD_MIRROR_URL"

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

  # 让 pyenv 使用 macOS SDK 自带的 openssl/readline/sqlite 等
  # 3 次重试 + 指数退避（2s/4s/8s），规避瞬时网络抖动
  MAX_RETRY=3
  ATTEMPT=0
  while [ $ATTEMPT -lt $MAX_RETRY ]; do
    ATTEMPT=$((ATTEMPT + 1))
    # if 是 set -e 的安全上下文，pyenv install 失败不会立即退出
    if PYTHON_CONFIGURE_OPTS="--enable-optimizations --with-lto" \
        pyenv install "$PY_VERSION"; then
      break
    fi
    if [ $ATTEMPT -lt $MAX_RETRY ]; then
      WAIT=$((2 ** ATTEMPT))   # 2, 4, 8
      echo "   ⚠️  安装失败，${WAIT}s 后重试 (第 $ATTEMPT/$MAX_RETRY 次)..."
      sleep "$WAIT"
    else
      echo "   ❌ 已重试 $MAX_RETRY 次仍失败"
      echo "      检查网络: ping www.python.org"
      echo "      切换镜像: PYTHON_BUILD_MIRROR_URL=https://mirrors.aliyun.com/python/ftp/python bash install-python.sh"
      exit 1
    fi
  done

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

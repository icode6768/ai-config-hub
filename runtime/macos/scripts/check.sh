#!/usr/bin/env bash
# =============================================================================
# 运行时环境检查脚本
# 用法: bash check.sh
# =============================================================================

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# 运行时根目录在 scripts/ 上一级
RUNTIME_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"

# 颜色
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
BOLD='\033[1m'
RESET='\033[0m'

ok()   { printf "  ${GREEN}✅ %-20s${RESET} %s\n" "$1" "$2"; }
fail() { printf "  ${RED}❌ %-20s${RESET} %s\n" "$1" "$2"; }
warn() { printf "  ${YELLOW}⚠️  %-20s${RESET} %s\n" "$1" "$2"; }
info() { printf "  ${CYAN}ℹ️  %-20s${RESET} %s\n" "$1" "$2"; }

PASS=0
FAIL=0

check() {
  local label="$1"
  local cmd="$2"
  local expected_hint="${3:-}"
  local result
  if result=$(eval "$cmd" 2>/dev/null) && [ -n "$result" ]; then
    ok "$label" "$result"
    ((PASS++))
  else
    fail "$label" "${expected_hint:-未找到或执行失败}"
    ((FAIL++))
  fi
}

echo ""
echo -e "${BOLD}╔══════════════════════════════════════════════╗${RESET}"
echo -e "${BOLD}║     龙虾面板 · 运行时环境检查                ║${RESET}"
echo -e "${BOLD}╚══════════════════════════════════════════════╝${RESET}"
echo ""
info "运行时目录" "$RUNTIME_DIR"
echo ""

# ─── 先激活环境 ───
NVM_DIR="$RUNTIME_DIR/nvm"
PYENV_ROOT="$RUNTIME_DIR/pyenv"

[ -f "$NVM_DIR/nvm.sh" ]         && export NVM_DIR && . "$NVM_DIR/nvm.sh" 2>/dev/null
[ -d "$PYENV_ROOT/bin" ]         && export PYENV_ROOT && export PATH="$PYENV_ROOT/bin:$PATH" && eval "$(pyenv init - 2>/dev/null)"

# ─── 1. 目录结构 ───
echo -e "${BOLD}【目录结构】${RESET}"
for dir in nvm pyenv bin nvm/npm-global; do
  if [ -d "$RUNTIME_DIR/$dir" ]; then
    SIZE=$(du -sh "$RUNTIME_DIR/$dir" 2>/dev/null | cut -f1)
    ok "$dir/" "$SIZE"
    ((PASS++))
  else
    fail "$dir/" "目录不存在，尚未安装"
    ((FAIL++))
  fi
done
echo ""

# ─── 2. Node.js ───
echo -e "${BOLD}【Node.js / NVM】${RESET}"
check "nvm 可执行"     "nvm --version"                         "运行 bash install-node.sh"
check "node 可执行"    "node --version"                        "运行: nvm install lts/*"
check "npm 可执行"     "npm --version"                         "随 node 一起安装"
check "pnpm 可执行"    "pnpm --version"                        "运行: npm install -g pnpm"
# 验证 node 路径在 runtime 目录内
if command -v node &>/dev/null; then
  NODE_PATH=$(command -v node)
  if echo "$NODE_PATH" | grep -q "$RUNTIME_DIR"; then
    ok "node 路径隔离" "$NODE_PATH"
    ((PASS++))
  else
    warn "node 路径隔离" "当前 node 来自系统: $NODE_PATH（而非 runtime 目录）"
  fi
fi
# 列出已安装的 Node 版本
if command -v nvm &>/dev/null; then
  NVM_VERSIONS=$(nvm ls --no-colors 2>/dev/null | grep -E "v[0-9]" | tr '\n' ' ')
  info "已安装 Node 版本" "${NVM_VERSIONS:-（无）}"
fi
echo ""

# ─── 3. Python / pyenv ───
echo -e "${BOLD}【Python / pyenv】${RESET}"
check "pyenv 可执行"   "pyenv --version"                       "运行 bash install-python.sh"
check "python3 可执行" "python3 --version"                     "运行: pyenv install 3.11.9"
check "pip3 可执行"    "pip3 --version | awk '{print \$1,\$2}'" "随 python 一起安装"
# 验证 python 路径在 runtime 目录内
if command -v python3 &>/dev/null; then
  PY_PATH=$(command -v python3)
  if echo "$PY_PATH" | grep -q "$RUNTIME_DIR"; then
    ok "python 路径隔离" "$PY_PATH"
    ((PASS++))
  else
    warn "python 路径隔离" "当前 python3 来自系统: $PY_PATH（而非 runtime 目录）"
  fi
fi
# 列出已安装的 Python 版本
if command -v pyenv &>/dev/null; then
  PY_VERSIONS=$(pyenv versions --bare 2>/dev/null | tr '\n' '  ')
  info "已安装 Python 版本" "${PY_VERSIONS:-（无）}"
fi
echo ""

# ─── 4. 功能验证 ───
echo -e "${BOLD}【功能验证】${RESET}"

# Node.js 运行一段代码
if command -v node &>/dev/null; then
  RESULT=$(node -e "console.log('Node OK: ' + process.version + ' ' + process.arch)" 2>/dev/null)
  if [ -n "$RESULT" ]; then
    ok "node 执行测试" "$RESULT"
    ((PASS++))
  else
    fail "node 执行测试" "node -e 执行失败"
    ((FAIL++))
  fi
fi

# Python 运行一段代码
if command -v python3 &>/dev/null; then
  RESULT=$(python3 -c "import sys; print(f'Python OK: {sys.version.split()[0]} {sys.platform}')" 2>/dev/null)
  if [ -n "$RESULT" ]; then
    ok "python3 执行测试" "$RESULT"
    ((PASS++))
  else
    fail "python3 执行测试" "python3 -c 执行失败"
    ((FAIL++))
  fi
fi

# Python pip 可用
if command -v python3 &>/dev/null; then
  RESULT=$(python3 -m pip --version 2>/dev/null | awk '{print $1,$2}')
  if [ -n "$RESULT" ]; then
    ok "pip 模块测试" "$RESULT"
    ((PASS++))
  else
    fail "pip 模块测试" "python3 -m pip 不可用"
    ((FAIL++))
  fi
fi

# npm 安装测试包
if command -v npm &>/dev/null; then
  RESULT=$(node -e "require('path'); console.log('node modules: OK')" 2>/dev/null)
  if [ -n "$RESULT" ]; then
    ok "npm 模块测试" "$RESULT"
    ((PASS++))
  else
    fail "npm 模块测试" "node require 失败"
    ((FAIL++))
  fi
fi
echo ""

# ─── 5. 路径隔离总结 ───
echo -e "${BOLD}【路径总览】${RESET}"
for cmd in node npm python3 pip3 pyenv; do
  if PATH_RESULT=$(command -v "$cmd" 2>/dev/null); then
    printf "  %-10s → %s\n" "$cmd" "$PATH_RESULT"
  else
    printf "  %-10s → (未找到)\n" "$cmd"
  fi
done
echo ""

# ─── 总结 ───
TOTAL=$((PASS + FAIL))
echo -e "${BOLD}╔══════════════════════════════════════════════╗${RESET}"
if [ "$FAIL" -eq 0 ]; then
  echo -e "${BOLD}║  ${GREEN}✅ 全部通过！$PASS/$TOTAL 项检查OK${RESET}${BOLD}                  ║${RESET}"
else
  echo -e "${BOLD}║  ${RED}❌ $FAIL 项失败${RESET}${BOLD}，$PASS/$TOTAL 项通过                   ║${RESET}"
fi
echo -e "${BOLD}╚══════════════════════════════════════════════╝${RESET}"

if [ "$FAIL" -gt 0 ]; then
  echo ""
  echo -e "${YELLOW}修复建议:${RESET}"
  echo "  1. 确认已运行对应安装脚本（install-node.sh / install-python.sh）"
  echo "  2. 如果路径不在 runtime 目录，先激活环境: source activate.sh，再重新运行 check.sh"
  echo "  3. macOS 外置设备隔离问题: xattr -rd com.apple.quarantine \"$RUNTIME_DIR\""
fi
echo ""

#!/usr/bin/env bash
# =============================================================================
# 龙虾面板 · 凭据加载 helper（macOS）
# 读取项目级配置，导出 DONGCHUANGAI_API_KEY / OPENCLAW_* 等 env
# 被以下脚本 source:
#   - activate.sh
#   - .dsh/launch-deepseek-harness-macos.command
#   - .dsh/deepseek-harness/scripts/launch-dsh-web.command
#
# 特性：自定位项目根目录（向上找 config.yaml），
#       不依赖外部工具（grep/python3 即可，macOS 自带）
# =============================================================================

# 自定位项目根目录：向上找 config.yaml
_lobster_root() {
  local dir="${1:-$PWD}"
  while [ "$dir" != "/" ]; do
    if [ -f "$dir/config.yaml" ]; then
      echo "$dir"
      return 0
    fi
    dir="$(dirname "$dir")"
  done
  return 1
}

_ROOT="$(_lobster_root "${1:-$PWD}" 2>/dev/null || true)"
if [ -z "$_ROOT" ]; then
  return 0 2>/dev/null || exit 0
fi

# --- DONGCHUANGAI_API_KEY（从 config.yaml 的 global.api.apiKey 读）---
# 旧名清理（这个仓库以前用 DONGCHUANGAI_KEY，已废弃）
unset DONGCHUANGAI_KEY

if [ -z "${DONGCHUANGAI_API_KEY:-}" ] && [ -f "$_ROOT/config.yaml" ]; then
  # config.yaml 顶层缩进 2 空格，apiKey 形如: "  apiKey: sk-xxx"
  _KEY="$(grep -E "^[[:space:]]+apiKey:" "$_ROOT/config.yaml" \
    | head -1 \
    | sed -E 's/^[[:space:]]+apiKey:[[:space:]]*//; s/^["'"'"']//; s/["'"'"']$//')"
  if [ -n "$_KEY" ]; then
    export DONGCHUANGAI_API_KEY="$_KEY"
  fi
fi

# DeepSeek Harness 的 deepseek-official 路由固定读取这个变量。
# 与面板共享同一份 global.api.apiKey，避免不同启动入口出现凭据不一致。
if [ -n "${DONGCHUANGAI_API_KEY:-}" ]; then
  export DEEPSEEK_API_KEY="$DONGCHUANGAI_API_KEY"
fi

# --- OPENCLAW_*（从 .openclaw/state/openclaw.json 读）---
_OC_JSON="$_ROOT/.openclaw/state/openclaw.json"
if [ -f "$_OC_JSON" ]; then
  export OPENCLAW_HOME="$_ROOT/.openclaw"
  export OPENCLAW_STATE_DIR="$_ROOT/.openclaw/state"
  export OPENCLAW_CONFIG_PATH="$_OC_JSON"

  if [ -z "${OPENCLAW_GATEWAY_TOKEN:-}" ]; then
    # JSON5 允许 key 不带引号（token: 'xxx' 或 "token": "xxx" 都兼容）
    _TOK="$(grep -E '^\s*(["]?token["]?)\s*:[[:space:]]*["'"'"']' "$_OC_JSON" \
      | head -1 \
      | sed -E "s/^[[:space:]]*[\"']?token[\"']?[[:space:]]*:[[:space:]]*[\"']//; s/[\"'],?$//")"
    [ -n "$_TOK" ] && export OPENCLAW_GATEWAY_TOKEN="$_TOK"
  fi

  if [ -z "${OPENCLAW_GATEWAY_PORT:-}" ]; then
    _PORT="$(grep -E '^\s*(["]?port["]?)\s*:[[:space:]]*[0-9]' "$_OC_JSON" \
      | head -1 \
      | sed -E 's/.*:[[:space:]]*([0-9]+).*/\1/')"
    [ -n "$_PORT" ] && export OPENCLAW_GATEWAY_PORT="$_PORT"
  fi
fi

#!/bin/zsh
set -u

root="$(cd "$(dirname "$0")" && pwd)"
export DSH_HOME="$root"
export DSH_WEB_PORT="${DSH_WEB_PORT:-3080}"
launcher="$root/deepseek-harness/scripts/launch-dsh-web.command"

# 兜底注入凭据（双击本脚本时绕过 dev server 链路，
# 不 source activate.sh；llm-pi-ai 会因为找不到 DONGCHUANGAI_API_KEY 而报错）
_project_root="$(cd "$root/.." 2>/dev/null && pwd)"
if [[ -f "$_project_root/runtime/macos/scripts/load-creds.sh" ]]; then
  source "$_project_root/runtime/macos/scripts/load-creds.sh"
fi
unset _project_root

if [[ ! -f "$launcher" ]]; then
  print -u2 "[ERROR] DeepSeek Harness launcher not found: $launcher"
  print -u2 'Place this file beside the deepseek-harness folder.'
  read -r '?Press Enter to close...'
  exit 1
fi

exec zsh "$launcher" "$@"

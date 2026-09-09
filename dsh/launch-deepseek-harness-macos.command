#!/bin/zsh
set -u

root="$(cd "$(dirname "$0")" && pwd)"
export DSH_HOME="$root"
export DSH_WEB_PORT="${DSH_WEB_PORT:-3080}"
project="$root/deepseek-harness"
launcher="$project/apps/cli/lib/bin.js"
runtime="$(cd "$root/.." && pwd)/runtime/macos"
export PATH="$runtime/bin:$runtime/nvm/npm-global/bin:$PATH"

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

cd "$project" || exit 1
exec "$runtime/bin/node" "$launcher" web --port "$DSH_WEB_PORT" "$@"

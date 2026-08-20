#!/bin/zsh
set -u

root="$(cd "$(dirname "$0")" && pwd)"
export DSH_HOME="$root"
export DSH_WEB_PORT="${DSH_WEB_PORT:-3080}"
launcher="$root/deepseek-harness/scripts/launch-dsh-web.command"

if [[ ! -f "$launcher" ]]; then
  print -u2 "[ERROR] DeepSeek Harness launcher not found: $launcher"
  print -u2 'Place this file beside the deepseek-harness folder.'
  read -r '?Press Enter to close...'
  exit 1
fi

exec zsh "$launcher" "$@"

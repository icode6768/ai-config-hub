#!/bin/zsh
set -u

root="$(cd "$(dirname "$0")" && pwd)"
export DSH_HOME="$root"
export DSH_WEB_PORT="${DSH_WEB_PORT:-3080}"
project="$root/deepseek-harness"
launcher="$project/apps/cli/lib/bin.js"
runtime="$(cd "$root/.." && pwd)/runtime/macos"
node_bin="$runtime/bin/node"
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

if [[ ! -f "$project/node_modules/@deepseek-ai/dsh-app-boot/package.json" ]]; then
  print "[DeepSeek Harness] dependencies missing; installing..."
  workspace_file="$project/pnpm-workspace.yaml"
  created_workspace=0
  if [[ ! -f "$workspace_file" ]]; then
    print -r -- 'packages:' > "$workspace_file"
    print -r -- '  - "vendor/*"' >> "$workspace_file"
    print -r -- '  - "packages/*/*"' >> "$workspace_file"
    print -r -- '  - "native/landlock-run"' >> "$workspace_file"
    print -r -- '  - "native/landlock-run/packages/*"' >> "$workspace_file"
    print -r -- '  - "apps/*"' >> "$workspace_file"
    print -r -- '  - "website"' >> "$workspace_file"
    created_workspace=1
  fi
  install_ok=0
  if command -v pnpm >/dev/null 2>&1; then
    pnpm install --prod --frozen-lockfile=false && install_ok=1
  elif command -v corepack >/dev/null 2>&1; then
    corepack pnpm install --prod --frozen-lockfile=false && install_ok=1
  fi
  (( created_workspace )) && rm -f "$workspace_file"
  if (( ! install_ok )); then
    print -u2 '[ERROR] Failed to install DeepSeek Harness dependencies (pnpm/corepack unavailable or install failed).'
    exit 1
  fi
fi
if [[ ! -f "$project/node_modules/@deepseek-ai/dsh-app-boot/package.json" ]]; then
  print -u2 '[ERROR] DeepSeek Harness dependencies are still incomplete after installation.'
  exit 1
fi
exec "$node_bin" "$launcher" web --port "$DSH_WEB_PORT" "$@"

#!/bin/zsh
set -u

root="$(cd "$(dirname "$0")/.." && pwd)"
dsh_home="$(cd "$root/.." && pwd)"
export DSH_HOME="$dsh_home"
runtime_root="$(cd "$root/../../runtime" 2>/dev/null && pwd || true)"
log_file="$(mktemp -t dsh-web).log"
child=""

cleanup() {
  if [[ -n "$child" ]] && kill -0 "$child" 2>/dev/null; then
    kill -- -"$child" 2>/dev/null || kill "$child" 2>/dev/null || true
  fi
  rm -f "$log_file"
}
trap cleanup EXIT INT TERM

if [[ -d "$runtime_root/node/versions" ]]; then
  for node_path in "$runtime_root"/node/versions/*/bin/node; do
    if [[ -x "$node_path" ]]; then
      portable_node_dir="${node_path%/bin/node}"
      export PATH="$portable_node_dir:$runtime_root/npm-global:$runtime_root/bin:$PATH"
    fi
  done
fi

# macOS 布局：runtime/macos/nvm/versions/node/...
# 上面的 Windows 布局分支在 macOS 上不会触发，需要单独处理
if [[ -d "$runtime_root/macos/nvm/versions/node" ]]; then
  _macos_node_dir="$(ls -d "$runtime_root"/macos/nvm/versions/node/*/bin 2>/dev/null | sort -V | tail -1)"
  if [[ -x "$_macos_node_dir/node" ]]; then
    export PATH="$_macos_node_dir:$runtime_root/macos/nvm/npm-global/bin:$runtime_root/macos/bin:$PATH"
    unset _macos_node_dir
  fi
fi

# 注入凭据（必须早于 pnpm dsh web 启动，因为 llm-pi-ai 在请求时才读 env）
# $root = <project>/.dsh/deepseek-harness，所以 project_root = $root/../..
_project_root="$(cd "$root/../.." 2>/dev/null && pwd)"
if [[ -f "$_project_root/runtime/macos/scripts/load-creds.sh" ]]; then
  source "$_project_root/runtime/macos/scripts/load-creds.sh"
fi
unset _project_root

cd "$root"
if ! command -v node >/dev/null 2>&1; then print -u2 'Node.js is not installed or is not on PATH.'; exit 1; fi
pnpm_bin="$(command -v pnpm || true)"
if [[ -z "$pnpm_bin" && -x "$runtime_root/macos/nvm/npm-global/bin/pnpm" ]]; then pnpm_bin="$runtime_root/macos/nvm/npm-global/bin/pnpm"; fi
if [[ -z "$pnpm_bin" ]]; then print -u2 'pnpm is not installed or is not on PATH.'; exit 1; fi

modules_marker="$root/node_modules/.modules.yaml"
pnpm_store="$root/node_modules/.pnpm"
tsx_bin="$root/node_modules/.bin/tsx"
needs_install=0
if [[ ! -f "$modules_marker" || ! -d "$pnpm_store" || ! -x "$tsx_bin" || "$root/package.json" -nt "$modules_marker" || "$root/pnpm-lock.yaml" -nt "$modules_marker" ]]; then
  needs_install=1
fi
if (( needs_install )); then
  print "Dependencies are missing or stale. Installing them now..."
  "$pnpm_bin" install --frozen-lockfile || { status=$?; print -u2 "pnpm install failed with exit code $status."; exit "$status"; }
else
  print 'Dependencies are already installed.'
fi

if [[ ! -f "$root/apps/cli/lib/bin.js" || ! -f "$root/apps/web/dist/index.html" ]]; then
  print 'Build artifacts are missing. Building DeepSeek Harness now...'
  "$pnpm_bin" run build || { status=$?; print -u2 "pnpm run build failed with exit code $status."; exit "$status"; }
else
  print 'Build artifacts are already present.'
fi

fallback_root="$dsh_home/profiles/node_modules"
fallback_dsh="$fallback_root/@deepseek-ai/dsh"
if [[ -d "$fallback_dsh" && ! -L "$fallback_dsh" ]]; then
  print 'Repairing the extracted profile fallback directory...'
  rm -rf "$fallback_root"
fi

if [[ -n "${DSH_WEB_PORT:-}" ]]; then
  "$pnpm_bin" dsh web --port "$DSH_WEB_PORT" >"$log_file" 2>&1 &
else
  "$pnpm_bin" dsh web >"$log_file" 2>&1 &
fi
child=$!

url=''
for _ in {1..120}; do
  [[ -s "$log_file" ]] && url="$(sed -nE 's/.*dsh web: (http:\/\/[^[:space:]]+).*/\1/p' "$log_file" | tail -n 1)"
  [[ -n "$url" ]] && break
  kill -0 "$child" 2>/dev/null || break
  sleep 0.25
done

if [[ -n "$url" ]]; then open "$url"; print "DeepSeek Harness Web: $url"; fi
tail -f "$log_file" &
tailer=$!
wait "$child"
status=$?
kill "$tailer" 2>/dev/null || true
exit "$status"

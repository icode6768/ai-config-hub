#!/bin/zsh
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")" && pwd)"
WEBUI_DIR="$ROOT_DIR/webui"
cd "$ROOT_DIR"
export USB_LOBSTER_ROOT="$ROOT_DIR"
export DSH_HOME="$ROOT_DIR/.dsh"
mkdir -p "$DSH_HOME"
export HERMES_HOME="$ROOT_DIR/.hermes"
mkdir -p "$HERMES_HOME"
export PORT=8787
export NO_OPEN_BROWSER=0

source "$ROOT_DIR/runtime/macos/scripts/activate.sh"

if [[ ! -x "$WEBUI_DIR/node_modules/.bin/tsx" ]]; then
  npm --prefix "$WEBUI_DIR" install --no-audit --no-fund
fi
if [[ ! -f "$WEBUI_DIR/dist/index.html" ]]; then
  npm --prefix "$WEBUI_DIR" run build
fi

if command -v npm >/dev/null 2>&1; then
  exec npm --prefix "$WEBUI_DIR" run dev
fi

cd "$WEBUI_DIR"
exec node --import tsx server/index.ts

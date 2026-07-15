#!/bin/bash
# Arya AI — One-command startup
# Usage: ./start.sh [--prod]
# Requires: /Users/vkm/Desktop/Finos/.venv (already exists with all deps)

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
VENV="$SCRIPT_DIR/../../.venv"
PYTHON="$VENV/bin/python"
UVICORN="$VENV/bin/uvicorn"

# Load .env if it exists
if [ -f "$SCRIPT_DIR/.env" ]; then
  export $(grep -v '^#' "$SCRIPT_DIR/.env" | xargs)
fi

PORT="${ARYA_PORT:-7475}"
HOST="${ARYA_HOST:-0.0.0.0}"

# WeasyPrint (PDF reports) needs Pango, a Homebrew library — but Homebrew on
# Apple Silicon doesn't put /opt/homebrew/lib on the default dynamic-linker
# search path for a non-Homebrew Python (this venv). Without this, PDF export
# fails with "cannot load library libgobject-2.0-0" on the first request.
export DYLD_LIBRARY_PATH="/opt/homebrew/lib:${DYLD_LIBRARY_PATH:-}"

echo ""
echo "  ╔═══════════════════════════════════╗"
echo "  ║     Arya AI — Starting up         ║"
echo "  ║     Port: $PORT                     ║"
echo "  ║     Docs: http://localhost:$PORT/docs  ║"
echo "  ╚═══════════════════════════════════╝"
echo ""

cd "$SCRIPT_DIR"

if [ "$1" == "--prod" ]; then
  echo "▶ Production mode (no reload)"
  "$UVICORN" server:app --host "$HOST" --port "$PORT" --workers 2 --log-level info
else
  echo "▶ Dev mode (auto-reload on file change)"
  "$UVICORN" server:app --host "$HOST" --port "$PORT" --reload --log-level info
fi

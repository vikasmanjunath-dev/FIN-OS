#!/usr/bin/env bash
# FIN-OS Voice AI — Production Launch Script
# Usage: ./run.sh [setup|start|stop|restart]
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
VENV_DIR="$SCRIPT_DIR/.venv"
OLLAMA_MODEL="qwen2.5:3b"
LOG_FILE="$SCRIPT_DIR/agent.log"

RED='\033[0;31m'; GRN='\033[0;32m'; YLW='\033[0;33m'; CYN='\033[0;36m'; NC='\033[0m'
info()    { echo -e "${CYN}[INFO]${NC} $*"; }
success() { echo -e "${GRN}[OK]${NC}   $*"; }
warn()    { echo -e "${YLW}[WARN]${NC} $*"; }
error()   { echo -e "${RED}[ERR]${NC}  $*"; exit 1; }

# ── Kill anything on our ports + any stale agent/server process ───────────────
stop() {
  info "Stopping FIN-OS..."
  # Kill by process name — works regardless of PID files
  pkill -f "agent\.py"      2>/dev/null || true
  pkill -f "http\.server.*8080" 2>/dev/null || true
  # Belt-and-suspenders: also kill by port
  lsof -ti:8765 2>/dev/null | xargs kill -9 2>/dev/null || true
  lsof -ti:8080 2>/dev/null | xargs kill -9 2>/dev/null || true
  rm -f "$SCRIPT_DIR/.agent.pid" "$SCRIPT_DIR/.server.pid"
  sleep 1
  success "Stopped"
}

# ── System dependency check ───────────────────────────────────────────────────
check_deps() {
  info "Checking dependencies..."
  command -v python3 >/dev/null 2>&1 || error "Python 3.10+ required"
  command -v ollama  >/dev/null 2>&1 || error "Ollama not found. Install: curl -fsSL https://ollama.com/install.sh | sh"
  command -v ffmpeg  >/dev/null 2>&1 || warn  "ffmpeg not found — voice input won't work. Run: brew install ffmpeg"
  success "Dependencies OK"
}

# ── Virtual env + packages ────────────────────────────────────────────────────
setup_venv() {
  info "Setting up Python virtual environment..."
  python3 -m venv "$VENV_DIR"
  source "$VENV_DIR/bin/activate"
  pip install --upgrade pip -q
  pip install -r "$SCRIPT_DIR/requirements.txt" -q
  success "Python environment ready"
}

# ── Pull model ────────────────────────────────────────────────────────────────
pull_model() {
  info "Checking Ollama model ($OLLAMA_MODEL)..."
  if ollama list 2>/dev/null | grep -q "$OLLAMA_MODEL"; then
    success "$OLLAMA_MODEL already pulled"
  else
    info "Pulling $OLLAMA_MODEL..."
    ollama pull "$OLLAMA_MODEL"
    success "$OLLAMA_MODEL ready"
  fi
}

# ── Start ─────────────────────────────────────────────────────────────────────
start() {
  # Activate venv
  if [[ -d "$VENV_DIR" ]]; then
    source "$VENV_DIR/bin/activate"
  else
    error "Virtual env not found. Run: ./run.sh setup"
  fi

  # Make sure Ollama is running
  if ! pgrep -x ollama >/dev/null 2>&1; then
    info "Starting Ollama server..."
    ollama serve &>/dev/null &
    sleep 2
  fi

  # Double-check ports are free before binding
  if lsof -ti:8765 &>/dev/null; then
    warn "Port 8765 still in use — force-killing..."
    lsof -ti:8765 | xargs kill -9 2>/dev/null || true
    sleep 1
  fi
  if lsof -ti:8080 &>/dev/null; then
    warn "Port 8080 still in use — force-killing..."
    lsof -ti:8080 | xargs kill -9 2>/dev/null || true
    sleep 1
  fi

  info "Starting FIN-OS agent on ws://localhost:8765..."
  python3 "$SCRIPT_DIR/agent.py" > "$LOG_FILE" 2>&1 &
  AGENT_PID=$!
  echo "$AGENT_PID" > "$SCRIPT_DIR/.agent.pid"

  info "Serving frontend on http://localhost:8080..."
  python3 -m http.server 8080 --directory "$SCRIPT_DIR" &>/dev/null &
  echo $! > "$SCRIPT_DIR/.server.pid"

  # Wait for agent to be ready (up to 30s)
  info "Waiting for agent to initialise..."
  for i in $(seq 1 30); do
    if grep -q "Ready" "$LOG_FILE" 2>/dev/null; then
      break
    fi
    if ! kill -0 "$AGENT_PID" 2>/dev/null; then
      error "Agent crashed on startup. Check: cat $LOG_FILE"
    fi
    sleep 1
  done

  if ! kill -0 "$AGENT_PID" 2>/dev/null; then
    error "Agent failed to start. Check: cat $LOG_FILE"
  fi

  success "FIN-OS is live!"
  echo ""
  echo -e "  🌐  Open:   ${CYN}http://localhost:8080${NC}"
  echo -e "  🔌  WS:     ${CYN}ws://localhost:8765${NC}"
  echo -e "  🧠  LLM:    ${CYN}$OLLAMA_MODEL${NC}"
  echo -e "  🎙   STT:   ${CYN}Whisper tiny${NC}"
  echo -e "  🔊  TTS:    ${CYN}Edge Neural (en-IN / hi-IN)${NC}"
  echo -e "  📋  Logs:   ${CYN}tail -f $LOG_FILE${NC}"
  echo ""
  echo "Press Ctrl+C to stop."
  wait "$AGENT_PID"
}

# ── Main ──────────────────────────────────────────────────────────────────────
case "${1:-start}" in
  setup)
    check_deps
    setup_venv
    pull_model
    success "Setup complete! Run: ./run.sh start"
    ;;
  start)
    start
    ;;
  stop)
    stop
    ;;
  restart)
    stop
    start
    ;;
  logs)
    tail -f "$LOG_FILE"
    ;;
  *)
    echo "Usage: $0 [setup|start|stop|restart|logs]"
    ;;
esac

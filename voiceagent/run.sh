#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────────────────
# FIN-OS Voice AI Agent — Setup & Launch Script
# Usage: ./run.sh [setup|start|deps]
# ─────────────────────────────────────────────────────────────────────────────
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
VENV_DIR="$SCRIPT_DIR/.venv"
PIPER_DIR="$SCRIPT_DIR/piper"
PIPER_BIN="$PIPER_DIR/piper"
VOICE_MODEL="en_US-lessac-medium"
VOICE_URL="https://huggingface.co/rhasspy/piper-voices/resolve/v1.0.0/en/en_US/lessac/medium/en_US-lessac-medium.onnx"
VOICE_CFG="https://huggingface.co/rhasspy/piper-voices/resolve/v1.0.0/en/en_US/lessac/medium/en_US-lessac-medium.onnx.json"

RED='\033[0;31m'; GRN='\033[0;32m'; YLW='\033[0;33m'; CYN='\033[0;36m'; NC='\033[0m'
info()    { echo -e "${CYN}[INFO]${NC} $*"; }
success() { echo -e "${GRN}[OK]${NC}   $*"; }
warn()    { echo -e "${YLW}[WARN]${NC} $*"; }
error()   { echo -e "${RED}[ERR]${NC}  $*"; exit 1; }

# ── Check System Dependencies ─────────────────────────────────────────────────
check_deps() {
  info "Checking system dependencies..."

  command -v python3 >/dev/null 2>&1 || error "Python 3.10+ required"
  command -v pip3    >/dev/null 2>&1 || error "pip3 required"
  command -v ollama  >/dev/null 2>&1 || error "Ollama not found. Install: curl -fsSL https://ollama.com/install.sh | sh"

  PYTHON_VER=$(python3 -c "import sys; print(f'{sys.version_info.major}.{sys.version_info.minor}')")
  info "Python version: $PYTHON_VER"

  # Check PortAudio for PyAudio
  if ! python3 -c "import pyaudio" 2>/dev/null; then
    warn "PyAudio not installed. Installing system lib..."
    if command -v apt-get >/dev/null 2>&1; then
      sudo apt-get install -y portaudio19-dev python3-pyaudio 2>/dev/null || true
    elif command -v brew >/dev/null 2>&1; then
      brew install portaudio 2>/dev/null || true
    fi
  fi

  success "System deps OK"
}

# ── Python Virtual Env ────────────────────────────────────────────────────────
setup_venv() {
  info "Setting up Python virtual environment..."
  python3 -m venv "$VENV_DIR"
  # shellcheck disable=SC1091
  source "$VENV_DIR/bin/activate"
  pip install --upgrade pip -q
  pip install -r "$SCRIPT_DIR/requirements.txt" -q
  success "Python env ready"
}

# ── Pull Ollama Model ─────────────────────────────────────────────────────────
pull_model() {
  info "Checking Ollama model (llama3.1)..."
  if ollama list 2>/dev/null | grep -q "llama3.1"; then
    success "llama3.1 already pulled"
  else
    info "Pulling llama3.1 (this may take a while)..."
    ollama pull llama3.1
    success "llama3.1 ready"
  fi
}

# ── Install Piper TTS ─────────────────────────────────────────────────────────
setup_piper() {
  info "Setting up Piper TTS..."
  mkdir -p "$PIPER_DIR"

  # Detect platform
  ARCH=$(uname -m)
  OS=$(uname -s | tr '[:upper:]' '[:lower:]')

  if [[ "$OS" == "linux" && "$ARCH" == "x86_64" ]]; then
    PIPER_RELEASE="piper_linux_x86_64.tar.gz"
  elif [[ "$OS" == "linux" && "$ARCH" == "aarch64" ]]; then
    PIPER_RELEASE="piper_linux_aarch64.tar.gz"
  elif [[ "$OS" == "darwin" ]]; then
    PIPER_RELEASE="piper_macos_x64.tar.gz"
  else
    warn "Unknown platform. Download Piper manually from https://github.com/rhasspy/piper/releases"
    return
  fi

  if [[ ! -f "$PIPER_BIN" ]]; then
    PIPER_URL="https://github.com/rhasspy/piper/releases/latest/download/$PIPER_RELEASE"
    info "Downloading Piper from $PIPER_URL..."
    curl -L "$PIPER_URL" | tar -xz -C "$PIPER_DIR" --strip-components=1
    chmod +x "$PIPER_BIN"
    success "Piper binary ready"
  else
    success "Piper binary already exists"
  fi

  # Download voice model
  VOICE_FILE="$PIPER_DIR/$VOICE_MODEL.onnx"
  if [[ ! -f "$VOICE_FILE" ]]; then
    info "Downloading voice model: $VOICE_MODEL..."
    curl -L "$VOICE_URL"     -o "$VOICE_FILE"
    curl -L "$VOICE_CFG"     -o "$VOICE_FILE.json"
    success "Voice model downloaded"
  else
    success "Voice model already exists"
  fi
}

# ── Patch agent.py with Piper path ────────────────────────────────────────────
patch_config() {
  info "Patching agent.py with Piper path..."
  sed -i "s|PIPER_BIN.*=.*\"piper\"|PIPER_BIN    = \"$PIPER_BIN\"|" "$SCRIPT_DIR/agent.py"
  sed -i "s|PIPER_VOICE.*=.*\"en_US-lessac-medium\"|PIPER_VOICE  = \"$PIPER_DIR/$VOICE_MODEL\"|" "$SCRIPT_DIR/agent.py"
  success "Config patched"
}

# ── Start Servers ─────────────────────────────────────────────────────────────
start() {
  info "Starting FIN-OS Voice AI Agent..."

  # Activate venv
  if [[ -d "$VENV_DIR" ]]; then
    # shellcheck disable=SC1091
    source "$VENV_DIR/bin/activate"
  fi

  # Ensure Ollama is running
  if ! pgrep -x ollama >/dev/null 2>&1; then
    info "Starting Ollama server..."
    ollama serve &>/dev/null &
    sleep 2
  fi

  # Start WebSocket agent
  info "WebSocket agent starting on ws://localhost:8765"
  python3 "$SCRIPT_DIR/agent.py" &
  AGENT_PID=$!
  echo "$AGENT_PID" > "$SCRIPT_DIR/.agent.pid"

  # Serve frontend
  info "Serving frontend on http://localhost:8080"
  python3 -m http.server 8080 --directory "$SCRIPT_DIR" &>/dev/null &
  echo $! > "$SCRIPT_DIR/.server.pid"

  success "FIN-OS is running!"
  echo ""
  echo -e "  🌐 Open: ${CYN}http://localhost:8080${NC}"
  echo -e "  🔌 WS:   ${CYN}ws://localhost:8765${NC}"
  echo ""
  echo "Press Ctrl+C to stop."
  wait $AGENT_PID
}

stop() {
  info "Stopping agents..."
  [[ -f "$SCRIPT_DIR/.agent.pid" ]]  && kill "$(cat "$SCRIPT_DIR/.agent.pid")"  2>/dev/null; rm -f "$SCRIPT_DIR/.agent.pid"
  [[ -f "$SCRIPT_DIR/.server.pid" ]] && kill "$(cat "$SCRIPT_DIR/.server.pid")" 2>/dev/null; rm -f "$SCRIPT_DIR/.server.pid"
  success "Stopped"
}

# ── Main ──────────────────────────────────────────────────────────────────────
case "${1:-start}" in
  setup)
    check_deps
    setup_venv
    pull_model
    setup_piper
    patch_config
    success "Setup complete! Run: ./run.sh start"
    ;;
  start)
    start
    ;;
  stop)
    stop
    ;;
  deps)
    check_deps
    setup_venv
    ;;
  *)
    echo "Usage: $0 [setup|start|stop|deps]"
    ;;
esac

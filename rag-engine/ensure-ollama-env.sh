#!/bin/zsh
# Makes the running `ollama serve` carry the settings this stack was designed around
# (docs/RAG_HARDWARE.md): OLLAMA_NUM_PARALLEL=2 so the embed model and the generation model are not
# serialised, and OLLAMA_KEEP_ALIVE so models are not reloaded between questions.
#
# Why a script: Ollama here runs as a Homebrew launchd service (~/Library/LaunchAgents/sh.brew.ollama.plist).
# Exporting variables in a shell never reaches it, and `brew services restart ollama` REGENERATES that plist
# from Homebrew's template, wiping hand edits (found Oct 17 2026; the variables had been documented as
# "critical" since Phase 1 but were never active). This script is idempotent: it only touches launchd
# when the running process is missing a setting, and it uses launchctl directly so brew does not regenerate.
#
# KEEP_ALIVE is 30m rather than -1 on purpose: this 24 GB Mac swaps heavily and pinning 6 GB of models forever
# makes that worse. Set KEEP_ALIVE=-1 below if you want them pinned.
NUM_PARALLEL=2
KEEP_ALIVE=30m
PLIST="$HOME/Library/LaunchAgents/sh.brew.ollama.plist"
[ -f "$PLIST" ] || { echo "ensure-ollama-env: $PLIST not found (Ollama not run via brew services); skipping"; exit 0; }

pid=$(pgrep -f "ollama serve" | head -1)
if [ -n "$pid" ]; then
  env_now=$(ps eww -p "$pid" | tr ' ' '\n')
  if echo "$env_now" | grep -q "^OLLAMA_NUM_PARALLEL=$NUM_PARALLEL$" && echo "$env_now" | grep -q "^OLLAMA_KEEP_ALIVE=$KEEP_ALIVE$"; then
    echo "ensure-ollama-env: already applied"; exit 0
  fi
fi

python3 - "$PLIST" "$NUM_PARALLEL" "$KEEP_ALIVE" <<'PY'
import plistlib, sys
p, np_, ka = sys.argv[1:4]
d = plistlib.load(open(p, "rb"))
d.setdefault("EnvironmentVariables", {}).update({"OLLAMA_NUM_PARALLEL": np_, "OLLAMA_KEEP_ALIVE": ka})
plistlib.dump(d, open(p, "wb"))
PY
launchctl bootout "gui/$(id -u)" "$PLIST" 2>/dev/null
launchctl bootstrap "gui/$(id -u)" "$PLIST"
for i in $(seq 1 30); do curl -s http://localhost:11434/api/tags >/dev/null && break; sleep 1; done
echo "ensure-ollama-env: applied NUM_PARALLEL=$NUM_PARALLEL KEEP_ALIVE=$KEEP_ALIVE and reloaded Ollama"

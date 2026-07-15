#!/bin/zsh
# FIN-OS RAG Stack — M5 24GB startup script (Phase 1)
# Run: chmod +x start-all.sh && ./start-all.sh
set -e

export PYTORCH_ENABLE_MPS_FALLBACK=1
export OLLAMA_NUM_PARALLEL=2
export OLLAMA_KEEP_ALIVE="-1"

echo "[1/4] Checking Ollama..."
if ! curl -s http://localhost:11434/api/tags > /dev/null; then
  open -a Ollama
  until curl -s http://localhost:11434/api/tags > /dev/null; do sleep 1; done
fi
echo "      ✓ Ollama up"

echo "[2/4] Checking Qdrant (binary at ~/qdrant-bin)..."
if ! curl -s http://localhost:6333/healthz > /dev/null; then
  cd ~/qdrant-bin
  nohup ./qdrant --config-path config.yaml > qdrant.log 2>&1 &
  disown
  cd - > /dev/null
  until curl -s http://localhost:6333/healthz > /dev/null; do sleep 1; done
fi
echo "      ✓ Qdrant up"

echo "[3/4] Checking Redis..."
brew services start redis 2>/dev/null || true
until redis-cli ping > /dev/null 2>&1; do sleep 1; done
echo "      ✓ Redis up"

echo "[4/5] Starting rag-engine on port 7476..."
cd "$(dirname "$0")"
source .venv/bin/activate
nohup uvicorn server:app --host 127.0.0.1 --port 7476 --log-level info > server.log 2>&1 &
disown

echo "[5/5] Starting ingestion worker (Phase 6 — async ingestion, see jobs.py)..."
# --worker-class SimpleWorker: NOT optional on macOS. RQ's default Worker forks a
# subprocess per job; jobs.py transitively imports torch (via ingestion.pii ->
# presidio -> spaCy -> thinc -> torch), and once anything has touched
# Metal/MPS's Objective-C runtime state, fork() crashes the child with SIGABRT
# ("may have been in progress in another thread when fork() was called").
# Confirmed by hitting this crash for real before adding the flag. SimpleWorker
# runs jobs in the same process instead of forking — no per-job isolation, but
# fine for a handful of solo-dev ingestion jobs.
nohup rq worker rag-ingestion --worker-class rq.worker.SimpleWorker --url "redis://localhost:6379" > worker.log 2>&1 &
disown

sleep 3
echo "✓ RAG stack running — http://localhost:7476/api/health"
curl -s http://localhost:7476/api/health && echo

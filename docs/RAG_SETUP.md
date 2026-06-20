# FIN-OS RAG — Local Setup Guide

> Version: 1.0 | Date: June 20, 2026
> Target: Apple M5, 24 GB unified memory, 1 TB SSD. No Docker required.

This guide gets the full RAG stack running from scratch, in order. Follow sequentially — each step depends on the previous one.

---

## Prerequisites

```bash
python3 --version      # need 3.10+
ollama --version        # need latest — install if missing

# Install everything via Homebrew
brew install ollama qdrant redis
```

If Ollama is already running for the existing voice agent / Arya backend, skip the install — just confirm models below are pulled.

---

## 1. Pull Required Models

```bash
ollama pull qwen3:14b           # primary generation, ~8.5 GB
ollama pull qwen3:8b            # utility/fast tasks, ~4.7 GB
ollama pull mxbai-embed-large   # primary embedding, ~670 MB
ollama pull nomic-embed-text    # fallback embedding, ~274 MB

ollama list   # confirm all 4 are present
```

---

## 2. Set Required Environment Variables

Add to `~/.zshrc` (persists across terminal sessions):

```bash
echo 'export PYTORCH_ENABLE_MPS_FALLBACK=1' >> ~/.zshrc
echo 'export OLLAMA_NUM_PARALLEL=2' >> ~/.zshrc
echo 'export OLLAMA_KEEP_ALIVE="-1"' >> ~/.zshrc
source ~/.zshrc
```

Restart any running `ollama serve` process after setting these so they take effect.

---

## 3. Start Qdrant

```bash
brew services start qdrant
curl http://localhost:6333/healthz   # expect: {"title":"qdrant - vector search engine", ...}
```

Qdrant persists data to `~/Library/Application Support/qdrant/` by default — no extra config needed for a single-machine setup.

---

## 4. Start Redis

```bash
brew services start redis
redis-cli ping   # expect: PONG
```

---

## 5. Create the `rag-engine` Project

```bash
cd "Initial Deployment"
mkdir -p rag-engine/{ingestion,embedding,storage,retrieval,generation,evaluation}
cd rag-engine

python3 -m venv .venv
source .venv/bin/activate
```

`requirements.txt`:
```
fastapi
uvicorn[standard]
llama-index
llama-index-vector-stores-qdrant
qdrant-client
sentence-transformers
torch
bm25s
presidio-analyzer
presidio-anonymizer
pymupdf
pdfminer.six
easyocr
beautifulsoup4
pandas
openpyxl
python-docx
apscheduler
redis
supabase
ragas
prometheus-client
langdetect
```

```bash
pip install -r requirements.txt
```

> **MPS note for `sentence-transformers`/`torch`:** Apple Silicon wheels include MPS support by default via `pip install torch` (no special index needed as of current PyTorch releases). Verify with:
> ```bash
> python3 -c "import torch; print(torch.backends.mps.is_available())"   # expect: True
> ```

---

## 6. Supabase Schema Migration

Run the SQL from [RAG_KNOWLEDGE_BASE.md](RAG_KNOWLEDGE_BASE.md) §3 (`rag_documents`, `rag_feedback` tables + RLS policies) against the existing FIN-OS Supabase project via the SQL editor, or save as `rag-engine/schema.sql` and apply:

```bash
psql "$SUPABASE_DB_URL" -f schema.sql
```

Reuses the existing Supabase project (`oeapcyucnduhwpgxfknb`) — no new project needed.

---

## 7. Create the Qdrant Collection

```bash
python3 -c "
from qdrant_client import QdrantClient
from qdrant_client.models import Distance, VectorParams

client = QdrantClient(host='localhost', port=6333)
client.create_collection(
    collection_name='finos_chunks',
    vectors_config=VectorParams(size=1024, distance=Distance.COSINE),
)
print('Collection created:', client.get_collection('finos_chunks'))
"
```

---

## 8. First Index Run — FIN-OS Pages

Once `rag-engine/server.py` is implemented (Phase 1, see [RAG_PHASES.md](RAG_PHASES.md)):

```bash
uvicorn server:app --host 127.0.0.1 --port 7476 &
curl -X POST http://localhost:7476/api/ingest/finos-pages
```

Expected: `{"pages_processed": 96, "chunks_created": ~5000, "duration_sec": ~45}`

---

## 9. Verify End-to-End

```bash
curl -X POST http://localhost:7476/api/query \
  -H "Content-Type: application/json" \
  -d '{"query": "What is the FIRE number calculation in FIN-OS?", "stream": false}'
```

Should return an answer citing FIN-OS's own `learn-*` content with `[SOURCE_N]` tags.

---

## 10. Auto-Start on Login (launchd)

Create `~/Library/LaunchAgents/com.finos.rag-engine.plist`:

```xml
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key>
  <string>com.finos.rag-engine</string>
  <key>ProgramArguments</key>
  <array>
    <string>/bin/zsh</string>
    <string>-c</string>
    <string>cd "/Users/vkm/Desktop/Finos/Initial Deployment/rag-engine" && ./start-all.sh</string>
  </array>
  <key>RunAtLoad</key>
  <true/>
  <key>StandardOutPath</key>
  <string>/tmp/finos-rag-engine.log</string>
  <key>StandardErrorPath</key>
  <string>/tmp/finos-rag-engine.error.log</string>
</dict>
</plist>
```

```bash
launchctl load ~/Library/LaunchAgents/com.finos.rag-engine.plist
```

---

## Troubleshooting

| Symptom | Fix |
|---|---|
| `ollama pull` hangs | Check internet; M5 download speed should pull qwen3:14b (~8.5GB) in a few minutes on broadband |
| `torch.backends.mps.is_available()` returns `False` | Update macOS to latest; confirm Python is arm64 native (`python3 -c "import platform; print(platform.machine())"` should print `arm64`, not `x86_64` under Rosetta) |
| Qdrant healthz fails | `brew services list` — confirm it's running; check `brew services info qdrant` for log path |
| Port 7476 already in use | `lsof -i :7476` to find the conflicting process; this port should be unused by any existing FIN-OS service per [RAG_HARDWARE.md](RAG_HARDWARE.md) §5 |
| High latency on first query after idle | `OLLAMA_KEEP_ALIVE` not exported in the shell that started `ollama serve` — restart Ollama after confirming `echo $OLLAMA_KEEP_ALIVE` prints `-1` |

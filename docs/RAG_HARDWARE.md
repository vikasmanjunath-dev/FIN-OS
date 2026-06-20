# FIN-OS RAG — Hardware Plan (Apple M5, 24 GB, 1 TB)

> Version: 1.0 | Date: June 20, 2026
> Target machine: MacBook with Apple M5 · 24 GB unified memory · 1 TB SSD

---

## 1. Unified Memory Model

M5's unified memory architecture (UMA) means CPU, GPU (Metal), and Neural Engine all draw from the same 24 GB pool — there is no separate VRAM to budget. Every model below runs GPU-accelerated through Metal without any manual configuration beyond environment variables.

---

## 2. RAM Allocation (steady-state, all services running)

| Component | Mechanism | RAM |
|---|---|---|
| macOS + background apps | — | ~4.5 GB |
| `qwen3:14b` Q4_K_M | Ollama, Metal GPU layers | 8.5 GB |
| `mxbai-embed-large` | Ollama, Metal | 1.2 GB |
| `BGE-reranker-v2-m3` | PyTorch MPS | 0.8 GB |
| Qdrant | Local binary, index in RAM | 1.8 GB |
| Redis | Query cache | 1.0 GB |
| FastAPI ×2 (`rag-engine` + `arya-ai`) + LlamaIndex | Python processes | 1.2 GB |
| **Subtotal** | | **~19 GB** |
| **Free headroom (always available)** | | **≥ 5 GB** |

**Rule:** never let steady-state usage exceed ~19 GB. The 5 GB headroom keeps macOS from triggering page compression or swap. The one scenario that pressures this is running `qwen3:14b` generation concurrently with a large batch-ingestion job — solved by queuing ingestion through the Redis/RQ worker (see [RAG_PIPELINE.md](RAG_PIPELINE.md)) so it never runs at the same priority as live queries.

**Critical rule — never load two 14B+ models simultaneously.** `qwen3:8b` (4.7 GB) handles all utility tasks (query rewrite, HyDE, sub-question decomposition) so `qwen3:14b` is only invoked for final answer generation.

---

## 3. Storage Budget (1 TB SSD)

| Category | Items | Size |
|---|---|---|
| **AI models (Ollama + pip)** | qwen3:14b (8.5 GB), qwen3:8b (4.7 GB), mxbai-embed-large (670 MB), nomic-embed-text fallback (274 MB), BGE-reranker-v2-m3 (590 MB) | **~14.7 GB** |
| **Vector + index store** | Qdrant at 1M chunks × 1024-dim (~4.1 GB), SQLite FTS5 (~800 MB), Redis dump (~200 MB), metadata SQLite (~100 MB) | **~5.2 GB** |
| **Raw documents** | SEBI circulars 2015–2026 (~3 GB), RBI directions (~500 MB), AMFI fact sheets (~2 GB), news archive 6mo (~1 GB), FIN-OS exported HTML (~50 MB) | **~6.5 GB** |
| **Project + Python envs** | FIN-OS deployment (~500 MB), existing venvs (~3 GB), new rag-engine venv (~800 MB), user uploads (~1–5 GB), logs (~200 MB) | **~5.5 GB** |
| **Total** | | **~32 GB** |
| **Free after install** | | **~968 GB** |

Even tripling the knowledge base (3 years of news, full NSE annual report archive, complete AMFI history) keeps total disk under 150 GB — no storage risk on a 1 TB drive.

Qdrant uses memory-mapped storage for segments that exceed configured RAM limits — on M5's SSD (≥5 GB/s sequential read) this is effectively transparent, with cold-start index load under 2 seconds.

---

## 4. Performance Targets

### Embedding throughput
| Task | Throughput |
|---|---|
| `mxbai-embed-large` (Ollama, Metal, batch 32) | ~1,500 chunks/sec |
| FIN-OS 96 pages, cold index | ~45 sec |
| 1,000 SEBI PDFs (~50K chunks) | ~35 min |
| Single user doc (~200 chunks) | ~8 sec |
| Daily news RSS re-index | ~2 min |

### Query latency (P50 / P95)
| Stage | Latency |
|---|---|
| Query embed | <5 ms / 10 ms |
| Qdrant HNSW search (1M vectors) | <10 ms / 25 ms |
| SQLite BM25 search | <5 ms / 15 ms |
| Reranker (40 → 8) | ~120 ms / 200 ms |
| Redis cache hit | <2 ms |
| **Total retrieval (cache miss)** | **~150 ms / 280 ms** |

### Generation speed (Metal)
| Metric | Value |
|---|---|
| `qwen3:14b` prefill | ~2,500 tok/s |
| `qwen3:14b` decode | ~50 tok/s |
| Time to first token (TTFT) | ~400 ms |
| 200-token answer, full generation | ~4 sec |
| `qwen3:8b` decode (utility tasks) | ~90 tok/s |

### End-to-end RAG latency
| Query type | Latency |
|---|---|
| Cache hit (repeat query) | <50 ms |
| Simple question | 1.5 – 2.5 sec |
| Complex multi-hop (3 sub-questions) | 3.5 – 5 sec |
| User-document question (first time) | 2 – 3 sec |
| Voice → RAG → TTS | ~4 sec |
| **Target P95** | **≤ 3 sec** |

Streaming makes perceived latency near-zero: first token at ~400 ms, and `qwen3:14b`'s ~50 tok/s decode rate exceeds average reading speed (~350 tok/min), so the model is never the bottleneck once streaming starts.

---

## 5. Service Map

| Port | Service | Role | Memory |
|---|---|---|---|
| 11434 | Ollama | LLM + embedding server (Metal) | 8.5–10 GB |
| 6333 | Qdrant | Vector DB, REST + gRPC | ~1.8 GB |
| 6379 | Redis | Query cache | ~200 MB |
| **7476** | **rag-engine** | **NEW** — FastAPI, all RAG endpoints | ~500 MB |
| 7475 | arya-ai | Existing Arya backend, calls rag-engine over HTTP | ~400 MB |
| 8765 | voice-agent | Existing WebSocket voice agent | ~300 MB |
| 8000 | chatbot/brain | Existing QFT chatbot, unaffected | ~300 MB |

No port conflicts. No Docker — Qdrant (`brew install qdrant`), Redis (`brew install redis`), Ollama (official installer) all run as native Apple Silicon binaries or launchd agents.

---

## 6. Environment Variables (required)

```bash
export PYTORCH_ENABLE_MPS_FALLBACK=1   # sentence-transformers MPS safety net (reranker)
export OLLAMA_NUM_PARALLEL=2           # concurrent Ollama requests (main gen + HyDE/rewrite)
export OLLAMA_KEEP_ALIVE="-1"          # keep models loaded permanently — no cold-start reload
```

`OLLAMA_KEEP_ALIVE=-1` is the single most important setting: by default Ollama unloads a model after 5 minutes idle. Reloading `qwen3:14b` costs ~3 seconds. With `keep_alive=-1` it stays resident in unified memory for the life of the session.

---

## 7. Startup Script

`rag-engine/start-all.sh`:

```bash
#!/bin/zsh
# FIN-OS RAG Stack — M5 24GB startup script
set -e
export PYTORCH_ENABLE_MPS_FALLBACK=1
export OLLAMA_NUM_PARALLEL=2
export OLLAMA_KEEP_ALIVE="-1"

echo "[1/5] Checking Ollama..."
brew services start ollama 2>/dev/null || true
until curl -s http://localhost:11434/api/tags > /dev/null; do sleep 1; done

echo "[2/5] Pre-loading models into GPU..."
ollama run qwen3:14b "" --nowordwrap &
ollama run mxbai-embed-large "" &
wait

echo "[3/5] Starting Qdrant..."
brew services start qdrant 2>/dev/null || true
until curl -s http://localhost:6333/healthz > /dev/null; do sleep 1; done

echo "[4/5] Starting Redis..."
brew services start redis 2>/dev/null || true

echo "[5/5] Starting rag-engine on port 7476..."
cd "$(dirname $0)"
source .venv/bin/activate
uvicorn server:app --host 127.0.0.1 --port 7476 --workers 2 --loop uvloop --log-level info &

echo "✓ RAG stack running — http://localhost:7476/docs"
```

Run once: `chmod +x rag-engine/start-all.sh`. Add to login items or a launchd plist for auto-start (see [RAG_SETUP.md](RAG_SETUP.md) §6).

---

## 8. Failure Modes & Headroom Checks

| Symptom | Cause | Fix |
|---|---|---|
| Swap usage > 0 | Headroom breached, likely 2 large models loaded at once | Check `ollama ps`; ensure only 14b OR 8b active per request, not both held concurrently beyond a few seconds |
| TTFT > 1s consistently | `OLLAMA_KEEP_ALIVE` not set, model reloading every request | Verify env var is exported in the shell that launched `ollama serve` |
| Qdrant slow on cold start | Index larger than available mmap cache | Increase `qdrant`'s `optimizers.memmap_threshold` or accept ~2s cold load — it's one-time per restart |
| Ingestion stalls live queries | Batch embedding job competing for Ollama's single embedding queue | Route ingestion embedding calls through a lower-priority Redis/RQ worker, cap concurrency to 1 |

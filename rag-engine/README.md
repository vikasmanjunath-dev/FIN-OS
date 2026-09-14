# FIN-OS RAG Engine

> FastAPI · Qdrant · BM25 · Redis · sentence-transformers  
> **Port:** 7476 | **Version:** Phase 2 | **Updated:** July 2026

Retrieval-Augmented Generation engine that lets Arya answer questions about FIN-OS's own content (page text, calculators, documentation) rather than relying purely on the LLM's training data.

Full documentation: [`docs/RAG_PIPELINE.md`](../docs/RAG_PIPELINE.md) | [`docs/RAG_API.md`](../docs/RAG_API.md) | [`docs/RAG_SETUP.md`](../docs/RAG_SETUP.md)

---

## Folder Structure

```
rag-engine/
├── server.py           ← FastAPI server (entry point, port 7476)
├── config.py           ← All settings (env vars + defaults)
├── jobs.py             ← RQ background job definitions (ingestion worker)
├── metrics.py          ← Prometheus metrics
├── schema.sql          ← SQLite FTS5 + Qdrant schema notes
├── start-all.sh        ← One-command startup (Redis + Qdrant + worker + server)
├── requirements.txt    ← Python dependencies
│
├── ingestion/
│   ├── loaders.py      ← PDF + HTML text extraction
│   ├── chunker.py      ← Recursive text splitter (512 tokens, 64 overlap)
│   └── pii.py          ← PII scrubber (removes names, Aadhaar, PAN, phone)
│
├── embedding/
│   └── encoder.py      ← sentence-transformers: all-MiniLM-L6-v2 (384-dim)
│
├── storage/
│   ├── qdrant_store.py ← Qdrant vector DB operations (upsert, search, delete)
│   ├── sqlite_fts.py   ← BM25 full-text search (SQLite FTS5)
│   ├── redis_cache.py  ← Query result cache (5-min TTL)
│   └── auth.py         ← Supabase session-token verification
│
├── retrieval/
│   └── hybrid.py       ← RRF fusion: dense (Qdrant) + sparse (BM25) results
│
├── generation/
│   └── streamer.py     ← Ollama streaming generator with citations
│
└── evaluation/
    └── metrics.py      ← Retrieval quality benchmarks (MRR, NDCG, Hit@K)
```

---

## Architecture: Hybrid RAG

```
User query
    ↓
Query cache check (Redis, 5-min TTL)  →  cache hit → return immediately
    ↓
Parallel retrieval
  ├── Dense: Qdrant cosine similarity (all-MiniLM-L6-v2, top-20)
  └── Sparse: SQLite FTS5 BM25 (top-20)
    ↓
RRF fusion (Reciprocal Rank Fusion)
  → Merges both ranked lists into unified top-10
    ↓
Reranking (cross-encoder, if enabled)
    ↓
Ollama streaming generation
  → System prompt + retrieved chunks + citations
    ↓
SSE token stream → browser
    ↓
Cache result (Redis)
```

---

## API Endpoints

| Method | Path | Description |
|---|---|---|
| GET | `/api/health` | Server + Qdrant + Redis status |
| POST | `/api/ingest/finos-pages` | Crawl and ingest all 96 FIN-OS HTML pages |
| POST | `/api/ingest/sebi-circulars` | Crawl SEBI circular listing, ingest PDFs |
| POST | `/api/ingest/rbi-notifications` | Crawl RBI notification listing, ingest PDFs |
| POST | `/api/ingest/irdai-circulars` | Crawl IRDAI circular listing, ingest PDFs (added July 2026) |
| POST | `/api/ingest/pfrda-circulars` | Crawl PFRDA circular listing via detail pages (added July 2026) |
| POST | `/api/ingest/news` | Fetch latest articles from 5 financial RSS feeds (added July 2026) |
| POST | `/api/upload` | Ingest a single uploaded PDF or HTML file (user namespace) |
| GET | `/api/ingest/status/{job_id}` | Check background ingestion job status |
| POST | `/api/retrieve` | Hybrid retrieve + rerank, no generation (for Arya main chat) |
| POST | `/api/search` | Raw vector search (no generation) |
| POST | `/api/query` | Full RAG: retrieve + generate with citations; pass `session_id` for multi-turn memory |
| POST | `/api/feedback` | Record thumbs-up/down on a RAG answer; stored 30 days in Redis |
| GET | `/api/feedback/summary` | Aggregate approval rate + 20 most-recent feedback entries |
| GET | `/api/metrics` | Prometheus metrics |

### POST /api/query

```json
{
  "query": "What is the difference between ELSS and PPF?",
  "top_k": 5,
  "stream": true
}
```

Response (SSE):
```
data: {"delta": "ELSS (Equity Linked Savings Scheme)"}
data: {"delta": " has a 3-year lock-in"}
...
data: {"citations": [{"source": "html/learn-mf.html", "chunk": "..."}]}
data: [DONE]
```

---

## Ingestion Pipeline

**Trigger:** `POST /api/ingest/finos-pages` enqueues a background RQ job.

```
Fetch all 96 HTML pages (parallel, httpx)
    ↓
Extract text (BeautifulSoup, strip nav/scripts)
    ↓
PII scrub (names, Aadhaar, PAN, phone numbers removed)
    ↓
Chunk (512 tokens, 64 token overlap, recursive splitter)
    ↓
Embed (all-MiniLM-L6-v2, batch=64)
    ↓
Upsert to Qdrant (384-dim vectors, content_hash deduplicated)
    ↓
Index in SQLite FTS5 (BM25 sparse index)
```

Total ingestion time for all 96 pages: ~3-5 minutes on CPU.

---

## Setup

### Prerequisites

```bash
# Qdrant (vector database)
docker run -p 6333:6333 qdrant/qdrant

# Redis (query cache + job queue)
brew install redis && redis-server
# or: docker run -p 6379:6379 redis:alpine
```

### Python environment

```bash
cd rag-engine
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
```

### Environment variables

```bash
SUPABASE_URL=https://oeapcyucnduhwpgxfknb.supabase.co
SUPABASE_ANON_KEY=eyJ...
OLLAMA_BASE_URL=http://localhost:11434
OLLAMA_MODEL=qwen3:8b
QDRANT_HOST=localhost
QDRANT_PORT=6333
REDIS_HOST=localhost
REDIS_PORT=6379
EMBED_MODEL=sentence-transformers/all-MiniLM-L6-v2
```

### Start everything

```bash
# Option 1 — one command
./start-all.sh

# Option 2 — manually
redis-server &
# (Qdrant already running in Docker)
rq worker rag-ingestion &          # background ingestion worker
uvicorn server:app --port 7476 --reload
```

---

## Phases

| Phase | Status | Capabilities |
|---|---|---|
| Phase 1 | ✅ Done | `/api/health`, `/api/ingest/finos-pages`, `/api/search` (raw vector) |
| Phase 2 | ✅ Done | Hybrid retrieval (dense + BM25 via RRF), reranking, streaming generation, citations, query cache |
| Phase 3 | ✅ Done | User document upload, namespace auth, HyDE, multi-hop, SEBI + RBI crawlers |
| Phase 4 | ✅ Done | Arya integration (`rag_query`, `rag_search_regulations` tools + main chat injection) |
| Phase 5 | ✅ Done | Faithfulness guard, namespace pytest, Prometheus metrics, 10-question benchmark (90%) |
| Phase 6 | ✅ Done | Cold-start model warmup, async RQ ingestion for all batch endpoints |
| Phase 7 | ✅ Done | IRDAI + PFRDA crawlers, News RSS ingestion (5 feeds), 100-question benchmark (July 2026) |
| Phase 8 | ✅ Done | Automated scheduler (APScheduler), conversation memory (Redis TTL 2h), LLM-as-judge eval (qwen3:8b), feedback loop (POST /api/feedback), citation source cards in Arya UI (July 2026) |

See [`docs/RAG_PHASES.md`](../docs/RAG_PHASES.md) for the full roadmap.

---

## Dependencies

```
fastapi, uvicorn            — API server
qdrant-client               — Vector database client
sentence-transformers       — Embedding model (all-MiniLM-L6-v2)
redis, rq                   — Job queue + query cache
httpx                       — Async HTTP (crawling FIN-OS pages)
beautifulsoup4              — HTML text extraction
pdfplumber                  — PDF text extraction
ollama / httpx              — LLM streaming (Ollama)
prometheus-client           — /metrics export
supabase                    — Auth token verification
```

# FIN-OS RAG Engine

> FastAPI · Qdrant · BM25 · Redis · sentence-transformers  
> **Port:** 7476 | **Updated:** October 15 2026 (code is the authority; see the "Oct 15 2026 health pass" row under Phases)

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
│   ├── chunker.py      ← Sentence-aware splitter; sizes per doc_type in config.CHUNK_SIZES (finos_page 350 tokens / 70 overlap) + 1,200-char hard cap
│   └── pii.py          ← PII scrubber (removes names, Aadhaar, PAN, phone)
│
├── embedding/
│   └── encoder.py      ← Ollama /api/embed: mxbai-embed-large (1024-dim), batches of 32
│
├── storage/
│   ├── qdrant_store.py ← Qdrant vector DB operations (upsert, search, delete)
│   ├── sqlite_fts.py   ← BM25 full-text search (SQLite FTS5)
│   ├── redis_cache.py  ← Query result cache (1-hour TTL; key = query + user + kb_version + PIPELINE_VERSION)
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
Query cache check (Redis, 1-hour TTL)  →  cache hit → return immediately
    ↓
Parallel retrieval
  ├── Dense: Qdrant cosine similarity (mxbai-embed-large, top-10)
  └── Sparse: SQLite FTS5 BM25 (top-10)
    ↓
RRF fusion (Reciprocal Rank Fusion)
  → Merges both ranked lists (k=60)
    ↓
Reranking (BAAI/bge-reranker-v2-m3 on MPS, top-3 kept)
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
| POST | `/api/ingest/finos-pages` | Re-index every FIN-OS HTML page (123 files as of Oct 15 2026) |
| POST | `/api/ingest/sebi-circulars` | Crawl SEBI circular listing, ingest PDFs |
| POST | `/api/ingest/rbi-notifications` | Crawl RBI notification listing, ingest PDFs |
| POST | `/api/ingest/irdai-circulars` | Crawl IRDAI circular listing, ingest PDFs (added July 2026) |
| POST | `/api/ingest/pfrda-circulars` | Crawl PFRDA circular listing via detail pages (added July 2026) |
| POST | `/api/ingest/news` | Fetch latest articles from financial RSS feeds (added July 2026) |
| POST | `/api/ingest/nse-filings`, `/api/ingest/bse-filings` | NSE / BSE corporate announcements (headline text, not PDFs) |
| GET | `/api/amfi/nav` | Live AMFI NAV lookup by fund name (flat-file lookup, not chunked RAG) |
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
Read every html/*.html (BeautifulSoup, split at h2/h3 sections)
    ↓
PII scrub (presidio; PAN / Aadhaar / phone patterns, score_threshold 0.5)
    ↓
Chunk (350 tokens / 70 overlap for finos_page; 1,200-char hard cap)
    ↓
Embed (mxbai-embed-large via Ollama, batch 32, 1024-dim)
    ↓
Upsert to Qdrant (content_hash stored; full re-index deletes finos_page first)
    ↓
Index in SQLite FTS5 (BM25 sparse index, same point ids)
```

Measured Oct 15 2026: 123 pages → 346 chunks in 18 s (Ollama warm). Pages whose body is
rendered by JavaScript (the tracker / calculator pages) contribute only their static header text.

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
EMBED_MODEL=mxbai-embed-large   # set in config.py; 1024-dim
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
| Oct 15 2026 health pass | ✅ Done | Stack restarted; 123 pages re-indexed (297 → 346 chunks); `/api/search` + `/api/retrieve` 422 bug fixed (prometheus-client 0.25 decorator vs postponed annotations) with a regression test; query-aware context window replaces "first 500 chars"; pipeline version in cache key; worker restart loop; 12 new-page + 41 personalized benchmark questions (`evaluation/benchmark_personal.py`) |

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

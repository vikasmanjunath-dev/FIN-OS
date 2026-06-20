# FIN-OS RAG — API Reference

> Version: 1.0 | Date: June 20, 2026
> Server: `rag-engine/server.py` (FastAPI, HTTP **:7476**) — local only, not deployed to Vercel

---

## Server Configuration

| Parameter | Value |
|---|---|
| Port | **7476** |
| Protocol | HTTP (plain, localhost only) |
| Workers | 2 (uvicorn `--workers 2`) |
| Generation model | `qwen3:14b` |
| Utility model | `qwen3:8b` |
| Embedding model | `mxbai-embed-large` |
| Default top-k (post-rerank) | 8 |
| Default temperature | 0.1 |
| Auth | Bearer token from Supabase session (forwarded from frontend) |

---

## `POST /api/query`

Full RAG pipeline: rewrite → HyDE → hybrid retrieve → rerank → generate. Streaming via SSE.

```bash
curl -N -X POST http://localhost:7476/api/query \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer <supabase_jwt>" \
  -d '{
    "query": "Can I claim both home loan interest and HRA in the same year?",
    "user_id": "a1b2c3d4-...",
    "filters": { "finance_category": "tax" },
    "stream": true
  }'
```

**Streamed response (SSE):**
```
event: token
data: {"text": "Yes, "}

event: token
data: {"text": "if you meet specific conditions"}

...

event: citations
data: {"sources": [
  {"id": "SOURCE_1", "doc_title": "Income Tax Act — Section 24(b)", "page": 12, "doc_id": "..."},
  {"id": "SOURCE_2", "doc_title": "CBDT Circular 08/2024", "page": 3, "doc_id": "..."}
]}

event: faithfulness
data: {"flagged_sentences": []}

event: done
data: {}
```

| Field | Type | Description |
|---|---|---|
| `query` | string | User's natural-language question |
| `user_id` | string \| null | Required for private namespace access; null = public-only |
| `filters` | object | Optional pre-filters: `finance_category`, `doc_type`, `date_from`, `date_to` |
| `stream` | bool | If false, returns a single JSON response instead of SSE |

---

## `POST /api/query` (non-streaming)

Same endpoint, `"stream": false`:

```json
{
  "answer": "Yes, if you meet specific conditions [SOURCE_1]. The home loan must be for a self-occupied or let-out property, and HRA requires you to be a salaried tenant [SOURCE_2]...",
  "citations": [
    {"id": "SOURCE_1", "doc_title": "Income Tax Act — Section 24(b)", "page": 12},
    {"id": "SOURCE_2", "doc_title": "CBDT Circular 08/2024", "page": 3}
  ],
  "flagged_sentences": [],
  "latency_ms": 2140,
  "retrieval_count": 8,
  "cache_hit": false
}
```

---

## `POST /api/upload`

Uploads and ingests a user document into the private namespace.

```bash
curl -X POST http://localhost:7476/api/upload \
  -H "Authorization: Bearer <supabase_jwt>" \
  -F "file=@form16_2025.pdf" \
  -F "doc_type=user_doc" \
  -F "finance_category=tax"
```

**Response:**
```json
{
  "doc_id": "e5f6...",
  "status": "ingested",
  "chunks_created": 18,
  "pii_redactions": 4,
  "namespace": "user:a1b2c3d4-..."
}
```

| Field | Type | Description |
|---|---|---|
| `file` | multipart | PDF, DOCX, CSV, or Excel |
| `doc_type` | string | Always `user_doc` for this endpoint |
| `finance_category` | string | Optional hint to improve retrieval routing |

Synchronous for files <5MB (typical ITR/Form16 size); returns immediately with chunk count. Larger files return `"status": "queued"` and ingest via the Redis/RQ background worker — poll `/api/upload/status/{doc_id}`.

---

## `GET /api/upload/status/{doc_id}`

```bash
curl http://localhost:7476/api/upload/status/e5f6...
```

```json
{ "doc_id": "e5f6...", "status": "ingested", "chunks_created": 42 }
```

`status` values: `queued` | `processing` | `ingested` | `failed`.

---

## `POST /api/search-regulations`

Targeted search restricted to `doc_type=regulation`, skips HyDE (regulatory queries are usually already precise).

```bash
curl -X POST http://localhost:7476/api/search-regulations \
  -H "Content-Type: application/json" \
  -d '{
    "topic": "mutual fund expense ratio cap",
    "authority": "SEBI",
    "date_from": "2023-01-01"
  }'
```

```json
{
  "results": [
    {
      "doc_title": "SEBI Circular SEBI/HO/IMD/IMD-I/DOF3/P/CIR/2023/...",
      "date": "2023-06-15",
      "excerpt": "Total Expense Ratio (TER) for mutual fund schemes shall not exceed...",
      "is_current": true,
      "doc_id": "..."
    }
  ],
  "superseded_versions_found": 1
}
```

`superseded_versions_found > 0` signals that older circulars on the same topic exist — the conflict-detection layer (see [RAG_PIPELINE.md](RAG_PIPELINE.md) Layer 6) surfaces this automatically.

---

## `POST /api/explain`

Explains a specific passage from a user's own uploaded document (used by Arya's `rag_explain_statement` tool).

```bash
curl -X POST http://localhost:7476/api/explain \
  -H "Authorization: Bearer <supabase_jwt>" \
  -d '{
    "doc_id": "e5f6...",
    "text_snippet": "Tax on total income after rebate under section 87A"
  }'
```

```json
{
  "explanation": "Section 87A gives you a rebate (not a deduction) of up to ₹25,000 if your taxable income is below ₹7L under the new regime [SOURCE_1]...",
  "citations": [{"id": "SOURCE_1", "doc_title": "Income Tax Act — Section 87A"}]
}
```

---

## `POST /api/feedback`

```bash
curl -X POST http://localhost:7476/api/feedback \
  -H "Authorization: Bearer <supabase_jwt>" \
  -d '{
    "query": "...",
    "answer": "...",
    "chunk_ids": ["..."],
    "rating": -1,
    "rating_note": "The tax slab cited is for the old regime, I'm on the new regime"
  }'
```

Writes to `rag_feedback` (see [RAG_KNOWLEDGE_BASE.md](RAG_KNOWLEDGE_BASE.md) §3). Used in weekly evaluation review — see [RAG_EVALUATION.md](RAG_EVALUATION.md).

---

## `POST /api/ingest/finos-pages`

Admin/manual trigger — re-indexes all 96 FIN-OS HTML pages. Run after content edits or deploys.

```bash
curl -X POST http://localhost:7476/api/ingest/finos-pages
```

```json
{ "pages_processed": 96, "chunks_created": 5142, "duration_sec": 47 }
```

---

## `GET /api/health`

```bash
curl http://localhost:7476/api/health
```

```json
{
  "status": "ok",
  "ollama": "up",
  "qdrant": "up",
  "redis": "up",
  "models_loaded": ["qwen3:14b", "qwen3:8b", "mxbai-embed-large"],
  "collection_size": 142318
}
```

Used by `start-all.sh` readiness checks and by `arya-ai`'s circuit breaker before routing a query to RAG.

---

## `GET /api/metrics`

Prometheus-format metrics endpoint (latency histograms, cache hit rate, ingestion success rate). See [RAG_EVALUATION.md](RAG_EVALUATION.md) §4 for the Grafana dashboard built on this.

---

## Error Responses

All endpoints return this shape on failure:

```json
{
  "error": "namespace_violation",
  "message": "user_id required for queries requesting private document access",
  "status_code": 403
}
```

| `error` code | Meaning |
|---|---|
| `namespace_violation` | Attempted access to a private namespace without valid auth |
| `model_unavailable` | Ollama unreachable, no cloud fallback eligible (private namespace query) |
| `ingestion_failed` | Document parsing/OCR failed |
| `rate_limited` | Too many concurrent requests for available Ollama capacity |

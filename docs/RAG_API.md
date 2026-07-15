# FIN-OS RAG — API Reference

> Version: 1.8 | Date: June 21, 2026 (Phase 6: all three batch ingest endpoints are now async — they return `{"job_id","status":"queued"}` immediately instead of blocking; new `GET /api/ingest/status/{job_id}` polls results; `GET /api/health` gained `ingest_workers_running`)
> Server: `rag-engine/server.py` (FastAPI, HTTP **:7476**) — local only, not deployed to Vercel

---

## Server Configuration

| Parameter | Value |
|---|---|
| Port | **7476** |
| Protocol | HTTP (plain, localhost only) |
| Workers | 1 (default uvicorn — single process, confirmed via `ps aux`; the `--workers 2` mentioned in [RAG_SETUP.md](RAG_SETUP.md)'s start script is not currently used in practice) |
| Generation model | **`qwen3:8b`** (changed from `qwen3:14b` in Phase 2 — see [RAG_MODELS.md](RAG_MODELS.md)) |
| Utility model | `qwen3:8b` — used by `retrieval/hyde.py` (HyDE) and `retrieval/multi_hop.py` (sub-question decomposition), both Phase 3, both opt-in per-request (`use_hyde`/`multi_hop`) |
| Embedding model | `mxbai-embed-large` |
| Default top-k (post-rerank) | **3** (reduced from 8 — see [RAG_HARDWARE.md](RAG_HARDWARE.md) §4) |
| Default temperature | 0.1 |
| `num_predict` cap | 120 tokens (added in Phase 2 — output length is the dominant controllable latency lever on this hardware) |
| Auth | **✅ Built (Phase 3).** Any request claiming a `user_id` must carry `Authorization: Bearer <supabase_access_token>`. Verified against Supabase's `/auth/v1/user` REST endpoint (not local JWT decoding — no signing secret needed). Wired into `/api/query`, `/api/search`, `/api/retrieve`, and `/api/upload`. Public-only requests (`user_id: null`) need no auth. Real negative tests pass (missing token, garbage token both → `403 namespace_violation`); positive-path (a real valid user) verified only down to the storage layer — see [RAG_PHASES.md](RAG_PHASES.md) Phase 3 for the honest caveat on why. |
| CORS | **✅ Built (Phase 4).** `CORSMiddleware`, `allow_origins=["*"]` — mirrors the existing dev-open config already used by `arya-ai/server.py` (port 7475). Needed because `js/arya-sidebar-panel.js` calls this server directly from the browser. Verified via real preflight + cross-origin POST from a live page. |

---

## ✅ `POST /api/query` — BUILT, verified

Hybrid retrieve (dense+BM25 via RRF) → rerank → generate. Streaming via SSE. **Query rewrite and HyDE auto-routing are not implemented** — HyDE exists but is opt-in via `use_hyde` (Phase 3), not automatic. Auth **is** checked now (Phase 3) — see Server Configuration above; this line previously (incorrectly, after Phase 3 shipped) said otherwise.

```bash
curl -N -X POST http://localhost:7476/api/query \
  -H "Content-Type: application/json" \
  -d '{
    "query": "How is insurance cover calculated in FIN-OS?",
    "user_id": null,
    "stream": true
  }'
```

**Streamed response (SSE) — actual captured output:**
```
event: token
data: {"text": "The"}

event: token
data: {"text": " FIN-OS"}

... (tokens continue) ...

event: citations
data: {"sources": [{"id": "SOURCE_1", "doc_title": "FIN•OS | Shield Protocol (Insurance)", "doc_type": "finos_page", "page_key": "learn-insurance", "source_path": "/Users/vkm/.../html/learn-insurance.html"}]}

event: faithfulness
data: {"flagged_sentences": []}

event: done
data: {}
```

Note: citation objects carry `doc_type`, `page_key`, `source_path` — **not** `page` (a page number) or `doc_id` (no document registry exists yet — see the Supabase gap in [RAG_PHASES.md](RAG_PHASES.md) Phase 1). `event: faithfulness` is now built (Phase 5) — see [RAG_PHASES.md](RAG_PHASES.md) Phase 5 for an important honest caveat: the NLI model behind this is measurably unreliable on Indian regulatory/financial text specifically (confirmed via direct comparison against the same model's confident, correct behavior on simple everyday sentences), so treat non-empty `flagged_sentences` as a noisy signal worth a human glance, not proof the answer is wrong.

| Field | Type | Implemented? | Description |
|---|---|---|---|
| `query` | string | ✅ | User's natural-language question |
| `user_id` | string \| null | ✅ (filter only, unauthenticated) | Restricts retrieval to `public` + `user:{user_id}` namespace — but anyone can pass any value, see Auth gap |
| `top_k` | int | ✅ | Default 3 (was 8) |
| `stream` | bool | ✅ | If false, returns a single JSON response |
| `doc_type` | string \| null | ✅ Built (Phase 4) | e.g. `"regulation"` — restricts retrieval to that doc_type only. Replaces the originally-planned generic `filters` object (`finance_category`/`date_from`/`date_to` still not built) — added specifically so Arya's `rag_search_regulations` tool is a genuine filter, not a same-results rename of `rag_query` |
| `use_hyde` | bool | ✅ Built (Phase 3) | Default `false`. +4-7s; measured no ranking improvement at this corpus size — see [RAG_PHASES.md](RAG_PHASES.md) Phase 3 |
| `multi_hop` | bool | ✅ Built (Phase 3) | Default `false`. +2-5s even for simple questions; genuinely helps compound questions (verified) — response includes a `sub_questions` field when it actually decomposed the query |

---

## ✅ `POST /api/query` (non-streaming) — BUILT, verified

```json
{
  "answer": "In FIN-OS, insurance cover is calculated using the formula: Cover = (Annual Income × 20) + Total Debt [SOURCE_1].",
  "citations": [
    {"id": "SOURCE_1", "doc_title": "FIN•OS | Shield Protocol (Insurance)", "doc_type": "finos_page", "page_key": "learn-insurance", "source_path": "/Users/vkm/.../html/learn-insurance.html"}
  ],
  "flagged_sentences": [],
  "latency_ms": 6975,
  "retrieval_count": 3,
  "cache_hit": false,
  "sub_questions": null
}
```
`flagged_sentences` (Phase 5, built) — non-empty entries look like `{"sentence": "...", "cited_sources": ["SOURCE_1"], "label": "neutral", "score": 4.25}`. See the honest reliability caveat in [RAG_PHASES.md](RAG_PHASES.md) Phase 5 before treating a non-empty list as proof of a hallucination.
This is real captured output, not a mockup. `latency_ms` of 6-8 seconds for a cache miss is the honest measured baseline on this hardware — see [RAG_HARDWARE.md](RAG_HARDWARE.md) §4. Repeat queries return in <5ms with `"cache_hit": true`.

---

## ✅ `POST /api/retrieve` — BUILT, verified (Phase 4)

Hybrid retrieve + rerank with **no generation step** — returns ranked chunks only. Built specifically for `js/arya-sidebar-panel.js`'s main Chat tab, which makes its own single Ollama call per message and doesn't need a second one; see [RAG_INTEGRATION.md](RAG_INTEGRATION.md) §2 for why this differs from the original plan (which assumed every RAG touchpoint would call `/api/query`).

```bash
curl -X POST http://localhost:7476/api/retrieve \
  -H "Content-Type: application/json" \
  -d '{"query": "What is the Kisan Credit Card scheme?", "top_k": 2, "stream": false}'
```

**Real captured response:**
```json
{
  "query": "What is the Kisan Credit Card scheme?",
  "chunks": [
    {
      "text": "...issues the Directions hereinafter specified. Chapter I: Preliminary...",
      "doc_title": "Reserve Bank of India [Commercial Banks - Kisan Credit Card (KCC) Scheme] Directions, 2026",
      "doc_type": "regulation",
      "source": "https://rbidocs.rbi.org.in/rdocs/notification/PDFs/402MD09973277BFE449CC8E21A0C9634191F2.PDF"
    }
  ]
}
```

Same auth and `doc_type` filtering as `/api/query` (reuses `_retrieve_and_rerank`). **Verified live from a real browser** via CORS — confirmed in the network tab as `POST http://localhost:7476/api/retrieve → 200 OK` triggered by `arya-sidebar-panel.js`'s `fetchRagContext()`.

---

## ✅ `POST /api/upload` — BUILT (Phase 3)

Accepts PDF, TXT, MD, or HTML. Requires a verified Supabase session token matching `user_id` — no anonymous uploads. Runs the strict PII scrub pass (see [RAG_SECURITY.md](RAG_SECURITY.md) §3), chunks at the `user_doc` size config (150 tokens, smaller than other sources — tighter precision for personal data), embeds, and dual-writes into Qdrant + SQLite FTS5 under `namespace: user:{uuid}`.

```bash
curl -X POST http://localhost:7476/api/upload \
  -H "Authorization: Bearer <supabase_access_token>" \
  -F "file=@form16_2025.pdf" \
  -F "user_id=<your-uuid>" \
  -F "finance_category=tax"
```

**Real captured response** (tested via direct pipeline call, not yet via a live HTTP token — see [RAG_PHASES.md](RAG_PHASES.md) Phase 3 caveat):
```json
{
  "doc_id": "f3a8...",
  "status": "ingested",
  "chunks_created": 1,
  "pii_redactions": 1,
  "namespace": "user:aaaaaaaa-1111-1111-1111-111111111111"
}
```

**Not built:** `doc_type` is fixed to `user_doc` (not a form field — original design had it as one, simplified since this endpoint only ever serves that purpose); the `/api/upload/status/{doc_id}` polling endpoint (not needed — the current implementation is synchronous for any file size, no background queue yet); no `rag_documents` row is written (Supabase schema not migrated — see [RAG_PHASES.md](RAG_PHASES.md) Phase 1 gap).

---

## 🔜 `GET /api/upload/status/{doc_id}` — PLANNED, not built (Phase 3)

---

## 🔜 `POST /api/search-regulations` — PLANNED, not built (Phase 3)

Depends on the SEBI/RBI/AMFI crawler (Phase 3) actually having ingested regulatory documents — there's no `doc_type=regulation` content in the index yet, so this endpoint has nothing to search even once built.

---

## 🔜 `POST /api/explain` — PLANNED, not built (Phase 3)

Depends on `/api/upload` existing first (needs a `doc_id` to explain a passage from).

---

## 🔜 `POST /api/feedback` — PLANNED, not built (Phase 5)

Depends on the `rag_feedback` Supabase table, which doesn't exist yet (Phase 1 gap).

---

## ✅ `POST /api/ingest/finos-pages` — BUILT, verified — ⚠️ shape changed in Phase 6, now async

Re-indexes all FIN-OS HTML pages (`html/*.html` — 94 files; `index.html`/`login.html` not yet included) into the `public` namespace, in both Qdrant and SQLite FTS5. Idempotent — clears prior `finos_page` chunks first, so repeat calls don't duplicate.

**Phase 6 change: this now enqueues a job and returns immediately** instead of blocking the request for ~18-21s. The actual ingestion logic is unchanged, just moved to `jobs.py` and run by a separate `rq worker rag-ingestion` process — see [RAG_PHASES.md](RAG_PHASES.md) Phase 6 for why (a real macOS fork-crash bug was found and fixed along the way).

```bash
curl -X POST http://localhost:7476/api/ingest/finos-pages
```

**Real captured response:**
```json
{ "job_id": "d26f82b6-6a44-4568-b5fa-0dd28389cd7c", "status": "queued" }
```

Poll `GET /api/ingest/status/{job_id}` (below) for the result. **Real captured result once finished:** `{"pages_processed": 94, "chunks_created": 297, "pii_redactions": 0, "duration_sec": 21.26}` — same fields as the old synchronous response, just delivered via the status endpoint now. `chunks_created` is 297, not the originally-captured 187 — see [RAG_KNOWLEDGE_BASE.md](RAG_KNOWLEDGE_BASE.md) for why a Phase 3 chunker fix quietly changed this with zero content change.

**If this just returns `queued` forever:** check `GET /api/health`'s `ingest_workers_running` field — if it's `0`, no worker process is running to pick up the job. Start one: `rq worker rag-ingestion --worker-class rq.worker.SimpleWorker --url redis://localhost:6379` (the `--worker-class` flag is required on macOS, not optional — see [RAG_PHASES.md](RAG_PHASES.md) Phase 6).

---

## ✅ `POST /api/ingest/sebi-circulars` — BUILT, verified against the live SEBI website (Phase 3) — ⚠️ now async (Phase 6)

Crawls SEBI's circular listing, downloads each circular's embedded PDF, extracts text, chunks, embeds, and indexes into the `public` namespace as `doc_type: "regulation"`. Not a scheduled job (the original plan was APScheduler) — manual trigger, since nobody's watching to debug an unattended scheduler if the site structure changes. See `ingestion/regulatory.py` for the crawl mechanics (listing page → detail page → embedded PDF iframe → download → `load_pdf()`).

```bash
curl -X POST http://localhost:7476/api/ingest/sebi-circulars \
  -H "Content-Type: application/json" \
  -d '{"limit": 5}'
```

**Real captured response (Phase 6, async):**
```json
{ "job_id": "a87c7364-52d9-428c-8067-202e04e13c64", "status": "queued" }
```

**Real captured result, once finished (5 genuinely current circulars, originally fetched June 20, 2026 — same shape as before, now delivered via the status endpoint):**
```json
{
  "circulars_fetched": 5,
  "chunks_created": 30,
  "pii_redactions": 0,
  "duration_sec": 9.11,
  "titles": [
    "Clarification with respect to applicability of the benefit of early pay-in in Commodity Derivatives Segment",
    "Guidelines for winding up of AIFs with respect to retention of proceeds and 'Inoperative Fund' status",
    "Norms for Base Price, Price Bands, Call Auction in pre-open session and Close-out procedure for Exchange Traded Funds (ETFs)",
    "Extension of timelines for compliance with certain provisions of Circular dated January 02, 2026",
    "Ease of doing investments - Modified Norms for Nomination in Demat Accounts and Mutual Fund Folios"
  ]
}
```

**Verified end-to-end:** queried `/api/query` afterward about demat nomination norms — the answer correctly cited the real circular and stated the actual effective date (September 1, 2026) pulled from the live document, not hallucinated. **Also verified true concurrency (Phase 6):** fired this exact crawl and a real `/api/query` call simultaneously — the query completed in 12.1s, unaffected by the crawl running concurrently in the worker process.

---

## ✅ `POST /api/ingest/rbi-notifications` — BUILT, verified against the live RBI website — ⚠️ now async (Phase 6)

Crawls RBI's notification listing, downloads each notification's PDF directly (no intermediate detail page — RBI's listing rows pair a title link with a sibling PDF link), chunks, embeds, indexes as `doc_type: "regulation"`. Same async shape as the two endpoints above as of Phase 6 — returns `{"job_id", "status": "queued"}` immediately, poll `GET /api/ingest/status/{job_id}`.

```bash
curl -X POST http://localhost:7476/api/ingest/rbi-notifications \
  -H "Content-Type: application/json" \
  -d '{"limit": 4}'
```

**Real captured result, once finished:**
```json
{
  "chunks_created": 181,
  "pii_redactions": 0,
  "duration_sec": 16.09,
  "titles": [
    "Reserve Bank of India [Regional Rural Banks - Kisan Credit Card (KCC) Scheme] Directions, 2026",
    "Reserve Bank of India [Small Finance Banks - Kisan Credit Card (KCC) Scheme] Directions, 2026",
    "Reserve Bank of India [Commercial Banks - Kisan Credit Card (KCC) Scheme] Directions, 2026",
    "Reserve Bank of India [Rural Co-operative Banks - Kisan Credit Card (KCC) Scheme] Directions, 2026"
  ],
  "notifications_fetched": 4
}
```

**A real bug hit and fixed during this build (Phase 3):** the first attempt failed with a 400 from Ollama (`mxbai-embed-large`'s 512-token limit exceeded) — caused by RBI PDFs' bilingual Hindi+English headers and, separately, dense numeric tables that tokenize far worse than the chunker's word-count heuristic assumed. See [RAG_PHASES.md](RAG_PHASES.md) Phase 3 for the full root-cause writeup and the two-layer fix (`ingestion/chunker.py`'s new hard character ceiling applies globally, not just to RBI).

**Verified end-to-end:** queried about the Kisan Credit Card scheme — the answer correctly cited the real directions document and stated its actual future effective date (January 1, 2027), not hallucinated.

**AMFI not built:** investigated properly (not guessed) — AMFI's homepage/FAQ pages are genuinely JS-rendered (221KB HTML, only 17 static links, none to real content), infeasible without a headless browser. Found a better fit instead: `https://www.amfiindia.com/spages/NAVAll.txt` is a real, working flat-file NAV endpoint (1.6MB, no JS needed) — not ingested this pass since it's structured tabular data, a different shape than the document-RAG pattern.

---

## ✅ `GET /api/ingest/status/{job_id}` — BUILT, Phase 6

Polls the status of a job enqueued by any of the three ingest endpoints above.

```bash
curl http://localhost:7476/api/ingest/status/d26f82b6-6a44-4568-b5fa-0dd28389cd7c
```

**Real captured responses**, at different points in a job's life:
```json
{ "job_id": "d26f82b6-...", "status": "queued" }
{ "job_id": "d26f82b6-...", "status": "finished", "result": {"pages_processed": 94, "chunks_created": 297, "pii_redactions": 0, "duration_sec": 21.26} }
```
A failed job (e.g., the real fork-crash bug hit during this build, see [RAG_PHASES.md](RAG_PHASES.md) Phase 6) returns `{"status": "failed", "error": "..."}`. An unknown `job_id` returns `404`.

---

## ✅ `POST /api/search` — BUILT, verified (Phase 1)

Raw vector search only — no BM25, no RRF, no rerank, no generation. Mostly superseded by `/api/query` for real use; kept for debugging retrieval quality in isolation.

```bash
curl -X POST http://localhost:7476/api/search \
  -H "Content-Type: application/json" \
  -d '{"query": "XIRR formula", "top_k": 5}'
```

---

## ✅ `GET /api/health` — BUILT, verified

```bash
curl http://localhost:7476/api/health
```

**Real captured response (no `redis`/`models_loaded` fields — those aren't checked; `ingest_workers_running` added Phase 6):**
```json
{
  "status": "ok",
  "ollama": "up",
  "qdrant": "up",
  "collection_size": 534,
  "ingest_workers_running": 1
}
```
`collection_size` was `187` in earlier captures of this doc, then `508`, now `534` after a real SEBI crawl ran during Phase 6 testing — see [RAG_KNOWLEDGE_BASE.md](RAG_KNOWLEDGE_BASE.md) for the 187→508 jump (a chunking fix, zero new content) and [RAG_PHASES.md](RAG_PHASES.md) Phase 6 for the 508→534 one (genuinely new SEBI chunks). `status` becomes `"degraded"` if either `ollama` or `qdrant` is down — **`ingest_workers_running` does NOT affect `status`**, by design: a missing worker breaks ingestion, not query serving, so it's surfaced as its own field rather than degrading the whole service. Redis is still not health-checked despite being a dependency of both `/api/query`'s caching and the Phase 6 job queue — a gap worth fixing before relying on this for monitoring.

---

## ✅ `GET /api/metrics` — BUILT, verified (Phase 5)

Prometheus exposition format (`prometheus-client`). See [RAG_EVALUATION.md](RAG_EVALUATION.md) §8 for the full metric list and a real captured sample.

```bash
curl http://localhost:7476/api/metrics
```

```
# HELP rag_request_latency_seconds Latency of rag-engine endpoints, end to end
# TYPE rag_request_latency_seconds histogram
rag_request_latency_seconds_sum{endpoint="query"} 17.12339...
rag_cache_hits_total 1.0
rag_cache_misses_total 1.0
rag_ingestion_total{outcome="success",source="finos_pages"} 1.0
rag_faithfulness_flagged_sentences_total 0.0
```

No Grafana dashboard — this is the raw scrapeable endpoint only, by deliberate choice (see [RAG_PHASES.md](RAG_PHASES.md) Phase 5).

---

## Error Responses — partially accurate

The structured `{"error": "...", "message": "...", "status_code": ...}` shape described in earlier drafts of this doc **is not implemented**. Errors currently surface as FastAPI's default `HTTPException` JSON (`{"detail": "..."}`) with no custom error-code taxonomy. Building the structured error codes below (`namespace_violation`, `model_unavailable`, etc.) is part of the auth work needed before Phase 3.

| Planned `error` code | Meaning | Built? |
|---|---|---|
| `namespace_violation` | Attempted access to a private namespace without valid auth | ❌ no auth exists to violate yet |
| `model_unavailable` | Ollama unreachable, no cloud fallback eligible | ❌ no cloud fallback exists yet |
| `ingestion_failed` | Document parsing/OCR failed | ❌ |
| `rate_limited` | Too many concurrent requests | ❌ |

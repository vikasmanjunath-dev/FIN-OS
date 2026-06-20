# FIN-OS RAG — Pipeline Reference

> Version: 1.0 | Date: June 20, 2026
> Implementation target: `rag-engine/` (FastAPI, port 7476)

---

## Overview

```
1. INGESTION  →  2. CHUNKING  →  3. EMBEDDING  →  4. STORAGE  →  5. RETRIEVAL  →  6. GENERATION
```

Each layer is a separate module under `rag-engine/` so it can be tested, swapped, and scaled independently.

---

## Layer 1 — Ingestion (`ingestion/`)

### Sources
PDF, HTML, CSV, JSON, Excel, DOCX. Pulled from: SEBI/RBI/AMFI crawlers, RSS news feeds, user file uploads, Supabase tables, and FIN-OS's own 96 HTML pages.

### Loaders (`ingestion/loaders.py`)
| Format | Library | Notes |
|---|---|---|
| PDF (text) | PyMuPDF | Primary; fast, preserves layout hints |
| PDF (text, fallback) | pdfminer.six | Used if PyMuPDF fails to extract |
| PDF (scanned/Hindi-mixed) | EasyOCR (`hi`+`en`) | Triggered when extracted text < 50 chars/page |
| HTML | BeautifulSoup4 | Strips nav/footer boilerplate via tag-density heuristic |
| CSV / Excel | pandas + openpyxl | Row-aware chunking, not paragraph splitting |
| JSON | native + jsonpath | Structured docs (AMFI NAV feeds, NSE data) |
| DOCX | python-docx | Rare; used for some user-uploaded docs |

### De-duplication
SHA-256 hash of normalized content (whitespace-collapsed, lowercased) computed before parsing. Hash checked against `rag_documents.content_hash` (Supabase) — if it exists and `last_indexed_at` is newer than the source's modified date, skip entirely.

### Incremental re-ingestion
Each `rag_documents` row carries a `version` int. Daily crawl jobs (see scheduler below) re-fetch known URLs; if content hash changed, increment `version`, re-chunk, re-embed, and supersede old chunks (old chunks marked `is_current = false` rather than deleted, preserving citation history for past answers).

### PII Scrubbing (`ingestion/pii.py`)
Runs **before** any chunk is persisted:
- Library: `presidio-analyzer` + custom recognizers for PAN (`[A-Z]{5}[0-9]{4}[A-Z]`), Aadhaar (12-digit groups), bank account numbers (9–18 digit sequences near keywords "account", "a/c")
- Detected PII replaced with typed placeholders: `<PAN>`, `<AADHAAR>`, `<ACCOUNT_NO>` — preserves semantic structure for the LLM without exposing raw values
- User-uploaded documents (ITR, Form 16, bank statements) get the **strictest** scrub pass; public regulatory documents get a lighter pass (mostly irrelevant, but defensive)

### Scheduler (`ingestion/scheduler.py`)
APScheduler jobs:
| Job | Cadence | Source |
|---|---|---|
| SEBI/RBI/AMFI crawl | Daily, 3 AM local | Public regulator sites |
| News RSS ingestion | Every 2 hours | ET, Mint, Business Standard, Moneycontrol |
| FIN-OS page re-index | On deploy (manual trigger via `/api/ingest/finos-pages`) | Local HTML files |
| AMFI NAV refresh | Daily, 6 AM local | AMFI NAV API |

---

## Layer 2 — Chunking (`ingestion/chunker.py`)

### Chunk sizes by document type
| Type | Chunk size | Overlap | Strategy |
|---|---|---|---|
| Regulatory text (SEBI/RBI/IT Act) | 400 tokens | 80 tokens | Semantic (sentence-boundary aware) |
| News articles | 200 tokens | 40 tokens | Recursive character split |
| Tables (fact sheets, NAV data) | 1 row/chunk | n/a | Structured — converted to JSON-in-text |
| Calculator explainer text | 300 tokens | 60 tokens | Semantic |
| User documents (ITR, statements) | 150 tokens | 30 tokens | Smaller — tighter precision needed for personal data |
| FIN-OS HTML page content | 350 tokens | 70 tokens | Semantic, split on `<h2>`/`<h3>` boundaries first |

### Metadata schema (attached to every chunk)
```json
{
  "source_type": "regulation | news | finos_page | user_doc | market_data",
  "doc_id": "uuid",
  "page_num": 4,
  "section_title": "Section 80CCD(1B) — Additional NPS Deduction",
  "language": "en",
  "date_indexed": "2026-06-20T03:00:00Z",
  "namespace": "public | user:{uuid}",
  "finance_category": "tax | mutual_funds | banking | insurance | equity | nps",
  "regulation_ref": "IT Act Section 80CCD(1B)",
  "tags": ["nps", "tax_deduction", "fy2025-26"]
}
```

### Special handling
- **Tables** → pandas DataFrame → each row rendered as a structured text chunk (`"Fund: HDFC Flexicap | NAV: ₹1,245.67 | 1Y Return: 18.2%"`) — never paragraph-chunked, since that destroys row alignment
- **Formulae** → stored as paired chunks: LaTeX representation + plain-English equivalent (e.g., `XIRR formula` + "the rate that makes the sum of discounted cash flows zero")
- **₹ amounts** → normalized in metadata to a numeric value + unit (`{"amount": 1500000, "unit": "INR", "display": "₹15L"}`) so retrieval can filter/sort numerically while display stays in L/Cr/K format

---

## Layer 3 — Embedding (`embedding/`)

### Dense embedding (`embedding/encoder.py`)
- Primary: `mxbai-embed-large` via Ollama HTTP (`/api/embed`), 1024-dim
- Fallback: `nomic-embed-text` via Ollama, 768-dim — used for high-volume batch ingestion where speed > precision (e.g., re-indexing 6 months of news)
- Batch size: 32 chunks per call
- Finance vocabulary boost: a custom token-preservation list (`SIP`, `ELSS`, `STCG`, `LTCG`, `F&O`, `HUF`, `NRI`, `PPF`, `NPS`, `80C`, `80CCD`) prevents the tokenizer from splitting these into meaningless sub-tokens before embedding

### Sparse embedding (`embedding/bm25.py`)
- `bm25s` Python library, persisted index in SQLite FTS5
- Tokenization matches the dense model's finance vocabulary boost list, so exact-term queries (e.g., "Section 80CCD(1B)") are never lost to stemming

### Why dual (dense + sparse)
Dense embeddings capture semantic meaning ("how much tax do I save on retirement contributions") but can miss exact identifiers. Sparse/BM25 captures exact terms ("80CCD(1B)") but misses paraphrase. Combining both (Layer 5) gets both kinds of recall.

---

## Layer 4 — Storage (`storage/`)

### Tier 1 — Qdrant (`storage/qdrant_store.py`)
- Primary persistent vector store, local binary on port 6333
- Collection: `finos_chunks`, vector size 1024, distance `Cosine`, HNSW (`m=16`, `ef_construct=128`)
- Payload (Qdrant's metadata) includes `namespace` — every query pre-filters on `namespace IN ["public", "user:{uuid}"]` before the vector search runs, not after, so private chunks are never even scored

### Tier 2 — SQLite FTS5 (`storage/sqlite_fts.py`)
- BM25 keyword index, co-located file `rag_bm25.db`
- Mirrors the same `namespace` filter as Qdrant

### Tier 3 — Supabase metadata (`storage/supabase_meta.py`)
- `rag_documents` — document registry (hash, source URL, version, last_indexed_at)
- `rag_feedback` — user thumbs up/down on answers
- Raw files stored in Supabase Storage bucket `rag-docs`, signed URLs for retrieval, per-user folder isolation
- Full schema in [RAG_KNOWLEDGE_BASE.md](RAG_KNOWLEDGE_BASE.md) §3

### Tier 4 — Redis cache (`storage/redis_cache.py`)
- Key: hash of (query text + namespace + filters), value: final assembled answer + citations
- TTL: 1 hour
- Invalidated early if the underlying document set changes (re-ingestion bumps a `kb_version` counter; cache keys include it)

---

## Layer 5 — Retrieval (`retrieval/`)

This is the highest-leverage layer — it determines whether RAG actually beats a naive vector search.

### Step-by-step
1. **Query rewrite** (`retrieval/hyde.py` helper) — `qwen3:8b` expands the raw query with Indian-finance synonyms. E.g. "can I claim home loan interest" → "home loan interest deduction Section 24(b) Income Tax Act self-occupied let-out property"
2. **HyDE** (Hypothetical Document Embeddings) — `qwen3:8b` generates a plausible *answer* to the query, and that hypothetical answer (not the raw query) is embedded for the dense search. This consistently improves recall on vague/conversational questions because answer-shaped text matches document-shaped text better than question-shaped text does.
3. **Dense retrieval** — Qdrant search, top-20, namespace pre-filtered
4. **Sparse retrieval** — SQLite BM25, top-20, same namespace filter
5. **RRF fusion** (`retrieval/hybrid.py`) — Reciprocal Rank Fusion: `score(d) = Σ 1/(k + rank_i(d))` across both lists, `k=60`. Produces one ranked list of ~30 unique candidates.
6. **Reranking** (`retrieval/reranker.py`) — `BGE-reranker-v2-m3` cross-encoder scores each (query, chunk) pair directly (more accurate than embedding similarity alone), selects top-8
7. **Multi-hop expansion** (`retrieval/multi_hop.py`) — for compound questions, a `SubQuestionQueryEngine` (LlamaIndex) decomposes into 2–4 sub-questions, runs steps 1–6 independently for each, then merges evidence before generation

### Namespace routing (security-critical)
Every retrieval call requires a `user_id` (or `None` for anonymous/public-only). The filter `namespace IN ('public', 'user:{user_id}')` is applied at the Qdrant/SQLite query level — never as a post-filter on results. This guarantees a private chunk is never transmitted out of the database layer for a query it doesn't belong to.

### Pre-filters available
`doc_type`, `finance_category`, `date_from`/`date_to`, `regulation_ref` — applied before vector search via Qdrant's payload filtering, narrowing the candidate set for targeted queries (e.g., `rag_search_regulations` tool only searches `doc_type=regulation`).

---

## Layer 6 — Generation (`generation/`)

### Context assembly (`generation/assembler.py`)
Final prompt sent to `qwen3:14b`:
```
[SYSTEM] Indian finance expert persona — see prompt.py template
[USER PROFILE] Injected from window.FINOS_USER_CONTEXT (age, income band, goals, holdings)
[RETRIEVED CONTEXT] Top-8 reranked chunks, each labeled [SOURCE_1]...[SOURCE_8] with doc title + date
[CONVERSATION HISTORY] Last 6 turns from Arya's session
[USER QUERY] The current question
```

### Streaming (`generation/streamer.py`)
FastAPI `StreamingResponse` with `text/event-stream`. Frontend (`js/arya-rag-ui.js`) consumes via `EventSource`, renders tokens as they arrive.

### Citations (`generation/citations.py`)
The system prompt instructs the model to tag every factual claim with `[SOURCE_N]`. A post-processing regex extracts these tags and maps them back to the actual chunk metadata (doc title, page, URL), rendering clickable source cards beneath the answer.

### Faithfulness guard (`generation/faithfulness.py`)
After generation completes, each sentence is checked via a lightweight NLI model (`cross-encoder/nli-deberta-v3-base`, runs on MPS) against the retrieved context: is this sentence *entailed* by the cited source? Sentences that fail entailment are flagged with a ⚠️ marker in the UI rather than silently presented as fact.

### Conflict resolution
If two retrieved chunks contradict each other (e.g., an old vs. new SEBI circular on the same topic), the prompt template explicitly instructs the model to surface both, with dates, rather than silently picking one — this is enforced via a few-shot example in the system prompt.

---

## Data Flow Diagram

```
User query (text or voice)
   │
   ▼
[Layer 5.1] Query rewrite (qwen3:8b) ──┐
   │                                    │
   ▼                                    │
[Layer 5.2] HyDE hypothetical doc ──────┘
   │
   ├──────────────┬──────────────┐
   ▼              ▼              │
[Dense: Qdrant]  [Sparse: BM25]  │  (namespace pre-filtered, top-20 each)
   │              │              │
   └──────┬───────┘              │
          ▼                      │
   [RRF fusion] → ~30 candidates │
          │                      │
          ▼                      │
   [BGE reranker] → top-8 ◄──────┘
          │
          ▼
   [Context assembler] + user profile + history
          │
          ▼
   [qwen3:14b streaming generation]
          │
          ▼
   [Citation extraction] + [Faithfulness check]
          │
          ▼
   SSE stream → js/arya-rag-ui.js → rendered answer + source cards
```

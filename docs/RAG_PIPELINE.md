# FIN-OS RAG — Pipeline Reference

> Version: 1.5 | Date: June 21, 2026 — corrected several sections that had stayed frozen at "Phase 1+2"/"not yet built" framing for HyDE, multi-hop, the faithfulness guard, and the Arya frontend integration, all of which are now actually built (Phases 3-5). Also fixed an internal contradiction (§1 said RBI crawler "not built" while its own next paragraph described it as built), a wrong module path (`embedding/bm25.py` doesn't exist), and removed Supabase-dependent mechanisms (de-dup hash lookup, incremental versioning, scheduler) that reference tables that were never created.
> Implementation: `rag-engine/` (FastAPI, port 7476) — Phases 1-5 live, see [RAG_PHASES.md](RAG_PHASES.md)

---

## Overview

```
1. INGESTION  →  2. CHUNKING  →  3. EMBEDDING  →  4. STORAGE  →  5. RETRIEVAL  →  6. GENERATION
```

Each layer is a separate module under `rag-engine/` so it can be tested, swapped, and scaled independently.

---

## Layer 1 — Ingestion (`ingestion/`)

### Sources
PDF, HTML built and in production use. Pulled from: **SEBI crawler and RBI crawler (✅ both built, Phase 3 — see `ingestion/regulatory.py`)**, FIN-OS's own HTML pages, user file uploads. Corrected Oct 2026: also built since — IRDAI and PFRDA crawlers (same `regulatory.py`, `doc_type=regulation`), news RSS (`ingestion/news.py`, 5 feeds, `doc_type=news`), NSE/BSE corporate announcements (`ingestion/corporate.py`, `doc_type=corporate_filing`) and a live AMFI NAV lookup (`ingestion/amfi.py`). Current page/chunk counts are in [RAG_STATUS.md](RAG_STATUS.md). Not built: AMFI document crawler (investigated, found infeasible — JS-rendered site), Supabase tables for metadata (schema written, never applied) — see [RAG_PHASES.md](RAG_PHASES.md) Phase 3 for the full feasibility writeup.

**SEBI crawler mechanics (verified against the live site, June 20, 2026):** listing page (`https://www.sebi.gov.in/sebiweb/...`) → plain `<a href>` links to circular detail pages (no JS rendering needed) → each detail page embeds the actual circular body as a PDF inside an `<iframe src="...?file=<pdf_url>">` → download PDF → `load_pdf()`. A real circular extracted 18,125 characters of text from a 14-page PDF.

**RBI crawler mechanics (✅ also built, verified against the live site):** listing page (`https://www.rbi.org.in/Scripts/NotificationUser.aspx`) → each notification is a `<tr>` with a title link (`<a class="link2">`) and a sibling `<a>` whose href is a *direct* PDF link — no intermediate detail page needed, simpler than SEBI. 58 real notification rows matched in one fetch. Fetched 4 real "Kisan Credit Card Scheme" directions (181 chunks).

**AMFI — documents investigated, not built (corrected Oct 2026: the NAV file is now used as a live lookup, `GET /api/amfi/nav`, not indexed):** homepage/FAQ pages are genuinely JS-rendered (confirmed via raw HTML: 221KB, only 17 static `<a>` tags, none to real content) — infeasible without a headless browser. Found a better-fitting alternative instead: `https://www.amfiindia.com/spages/NAVAll.txt`, a real working flat-file NAV endpoint (1.6MB, no JS), not yet ingested since it's structured tabular data rather than prose.

### Loaders (`ingestion/loaders.py`)
| Format | Library | Status |
|---|---|---|
| PDF (text) | PyMuPDF | ✅ Built — verified against real SEBI circular PDFs (not just synthetic test files) |
| HTML | BeautifulSoup4 | ✅ Built — strips nav/footer boilerplate, verified against real FIN-OS pages |
| PDF (text, fallback) | pdfminer.six | ❌ Not built — PyMuPDF alone has been sufficient so far |
| PDF (scanned/Hindi-mixed) | EasyOCR (`hi`+`en`) | ❌ Not built |
| CSV / Excel | pandas + openpyxl | ❌ Not built |
| JSON | native + jsonpath | ❌ Not built |
| DOCX | python-docx | ❌ Not built |

### De-duplication — ✅ built in Qdrant (corrected Oct 2026; the Supabase `rag_documents` version described in earlier drafts was never built)
Each chunk payload carries a `content_hash`. The regulatory crawls (SEBI, RBI, IRDAI, PFRDA) now always skip chunks whose `content_hash` is already stored, for manual API triggers as well as scheduled runs (`jobs._ingest_regulatory_docs`; before Oct 15 2026 only scheduled runs skipped, so a manual re-crawl inserted duplicate chunks). News and the incremental FIN-OS page run use the same hash check; the manual FIN-OS page trigger instead deletes prior `finos_page` chunks and re-embeds.

### Incremental re-ingestion — 🟡 partly built
Hash-based incremental ingestion exists (`incremental=True`, used by the scheduler). Document versioning (`rag_documents.version`, `is_current` flag, "this chunk superseded that older chunk") is still not built, because it depended on the unapplied Supabase table.

### PII Scrubbing (`ingestion/pii.py`)
Runs **before** any chunk is persisted:
- Library: `presidio-analyzer` + custom recognizers for PAN (`[A-Z]{5}[0-9]{4}[A-Z]`), Aadhaar (12-digit groups), bank account numbers (9–18 digit sequences near keywords "account", "a/c")
- Detected PII replaced with typed placeholders: `<PAN>`, `<AADHAAR>`, `<ACCOUNT_NO>` — preserves semantic structure for the LLM without exposing raw values
- User-uploaded documents (ITR, Form 16, bank statements) get the **strictest** scrub pass; public regulatory documents get a lighter pass (mostly irrelevant, but defensive)

### Scheduler — ✅ built (corrected Oct 2026; this section previously said no scheduler exists)
`rag-engine/scheduler.py` (not `ingestion/scheduler.py`) runs an APScheduler `BackgroundScheduler` in IST with 6 jobs: `sched_news` every 2 hours, `sched_sebi` and `sched_rbi` Sundays 02:00, `sched_irdai` and `sched_pfrda` Sundays 02:30, `sched_finos_pages` Sundays 03:00. Job defaults are `misfire_grace_time` 6 hours, `coalesce=True`, `max_instances=1`, so a run missed while the laptop slept still fires on wake. The job list and next run times are in `GET /api/health` and [RAG_STATUS.md](RAG_STATUS.md). Ingestion endpoints (all async RQ jobs; poll `GET /api/ingest/status/{job_id}`):

| Endpoint | What it does | Trigger |
|---|---|---|
| `POST /api/ingest/finos-pages` | Re-index the FIN-OS HTML pages | Manual (full re-index) + weekly scheduled (incremental) |
| `POST /api/ingest/sebi-circulars` | Crawl SEBI circulars | Manual (`limit`) + weekly scheduled |
| `POST /api/ingest/rbi-notifications` | Crawl RBI notifications | Manual (`limit`) + weekly scheduled |
| `POST /api/ingest/irdai-circulars` | Crawl IRDAI circulars | Manual (`limit`) + weekly scheduled |
| `POST /api/ingest/pfrda-circulars` | Crawl PFRDA circulars | Manual (`limit`) + weekly scheduled |
| `POST /api/ingest/nse-filings` | NSE corporate announcements (`corporate_filing`) | Manual only |
| `POST /api/ingest/bse-filings` | BSE corporate announcements (`corporate_filing`) | Manual only |
| `POST /api/ingest/news` | 5 RSS news feeds (`news`) | Manual + every 2 hours scheduled |

AMFI NAV is not an ingestion job; it is a live lookup (`GET /api/amfi/nav`).

---

## Layer 2 — Chunking (`ingestion/chunker.py`)

**Hard character ceiling added in Phase 3 (`_MAX_CHUNK_CHARS = 1200`), found via a real failure.** The sentence-boundary chunker below has no fallback when source text has no `.!?` to split on — a real RBI PDF's dense numeric table (loan calculation worksheet, lots of "₹50,000"-style short tokens) produced a single 2013-char "sentence" that exceeded `mxbai-embed-large`'s 512-token limit despite looking small enough by the word-count heuristic. Dense tabular/numeric content tokenizes far worse than prose (measured ~3.34 chars/token worst case vs. the heuristic's assumed ~4-5). `_enforce_max_chars()` now runs as a post-processing pass after normal chunking, splitting any oversized chunk by raw character slicing — a backstop, not a replacement for sentence-aware chunking. This also fixed an unrelated issue in the same incident: RBI PDFs have bilingual Hindi+English headers, and Devanagari script alone was *also* underestimated by the same heuristic — `ingestion/regulatory.py` separately strips Devanagari lines before chunking (correct independent of the char-cap fix, since FIN-OS's corpus is English-only by convention).

### Chunk sizes by document type — this table now matches `config.CHUNK_SIZES` exactly (verified)
| `doc_type` | Chunk size | Overlap | Strategy |
|---|---|---|---|
| `regulation` (SEBI/RBI/IRDAI/PFRDA) | 400 tokens (capped at 1200 chars, see above) | 80 tokens | Sentence-boundary aware + hard char ceiling |
| `news` | 200 tokens | 40 tokens | Used by the news RSS ingestion (corrected Oct 2026; this row previously said it was unused) |
| `corporate_filing` | 200 tokens | 40 tokens | NSE/BSE announcements (added Oct 2026 to this table; matches `config.CHUNK_SIZES`) |
| `user_doc` (ITR, statements, etc.) | 150 tokens | 30 tokens | Smaller — tighter precision for personal data |
| `finos_page` | 350 tokens | 70 tokens | Same sentence-boundary chunker — **not** actually split on `<h2>`/`<h3>` boundaries first, that html-structure-aware step was planned and never built; calculator explainer text and other page content all fall under this one type, no separate handling |

**Removed from this table — never built:** a distinct row-per-table structured chunking path for fact sheets/NAV data. Tabular sources (e.g. AMFI's NAV flat-file) were investigated but not wired into ingestion at all — see [RAG_KNOWLEDGE_BASE.md](RAG_KNOWLEDGE_BASE.md) §1.

### Metadata schema — planned vs. actual payload fields
The block below was the original plan. **Real chunks carry a smaller, flatter payload** — confirmed via `storage/qdrant_store.py`'s `ensure_collection()`, which indexes exactly `["namespace", "doc_type", "finance_category", "doc_id"]` and nothing else:
```json
{
  "text": "the chunk's actual content",
  "namespace": "public | user:{uuid}",
  "doc_type": "finos_page | regulation | user_doc",
  "doc_title": "human-readable source name",
  "source_path": "or source_url for crawled regulatory docs",
  "finance_category": "optional, not consistently populated"
}
```
Fields that were planned and **don't exist on any real chunk**: `source_type` (use `doc_type` instead — different name, same idea), `page_num`, `section_title`, `language`, `date_indexed` (no such field or index — confirmed via grep, nothing sets it), `regulation_ref`, `tags`. `doc_id` is indexed but only populated for user uploads (a locally-generated UUID, not a foreign key into any table since `rag_documents` doesn't exist).

### Special handling — ❌ none of this is built
The table/formula/₹-amount special-casing below was planned and never implemented — `ingestion/chunker.py` has one chunking path (sentence-boundary packing + the char-ceiling backstop) applied uniformly regardless of content shape. Tables get chunked as prose, like everything else; there's no DataFrame conversion, no LaTeX/plain-English formula pairing, and no numeric/unit normalization of ₹ amounts anywhere in the codebase. Kept here only as a record of what was planned, in case it's worth building once a real structured-data source (e.g. AMFI's NAV flat-file) gets ingested.

---

## Layer 3 — Embedding (`embedding/`)

### Dense embedding (`embedding/encoder.py` — verified, this is the real, complete logic)
- Primary: `mxbai-embed-large` via Ollama HTTP (`/api/embed`), 1024-dim
- Batch size: 32 chunks per call
- That's it. `encoder.py` is a ~30-line plain wrapper: batch the texts, POST to Ollama, return vectors. **No finance-vocabulary token-preservation list exists** — an earlier draft of this doc described a custom tokenizer boost for terms like `SIP`/`ELSS`/`80CCD`; checked the actual file, it was never built. `nomic-embed-text` is pulled and configured as a fallback model but has no code path that actually invokes it — "fallback" describes intent, not working failover logic.

### Sparse embedding — ❌ `embedding/bm25.py` does not exist; this is not a separate embedding step at all
There is no `bm25s` package and no separate sparse-embedding module. Sparse indexing happens directly at storage time in `storage/sqlite_fts.py`, using SQLite's **native** FTS5 `bm25()` ranking function — the raw chunk text is inserted into an FTS5 virtual table (`chunks_fts`) and SQLite itself handles tokenization and ranking. No custom finance-vocabulary tokenization list exists; exact-term queries like "Section 80CCD(1B)" work because FTS5's default tokenizer treats them as matchable tokens, not because of any FIN-OS-specific preservation logic.

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

### Tier 3 — Supabase metadata — ❌ not built, `storage/supabase_meta.py` does not exist
The `rag_documents`/`rag_feedback` tables and Storage bucket described in the original plan were never created — `schema.sql` exists as a file (written Phase 3) but was never applied to the live database (no DB credentials available). There is currently no document registry, no feedback table, and no raw-file storage at all — uploaded files are parsed from a temp file that's deleted immediately after (see [RAG_SECURITY.md](RAG_SECURITY.md)). Full planned schema in [RAG_KNOWLEDGE_BASE.md](RAG_KNOWLEDGE_BASE.md) §3, clearly marked there as written-not-applied. Supabase **is** used elsewhere in the real system — for session-token verification only (`storage/auth.py`, Phase 3), a module that wasn't in this original plan at all.

### Tier 4 — Redis cache (`storage/redis_cache.py`)
- Key: hash of (query text + user/namespace + filters + `kb_version` + `config.PIPELINE_VERSION`), value: final assembled answer + citations (corrected Oct 2026: `PIPELINE_VERSION` was added to the key so a prompt or pipeline change no longer serves old answers)
- TTL: 1 hour (`_TTL_SECONDS = 3600`)
- Invalidated early if the underlying document set changes (re-ingestion bumps a `kb_version` counter; cache keys include it)

---

## Layer 5 — Retrieval (`retrieval/`)

This is the highest-leverage layer — it determines whether RAG actually beats a naive vector search.

### Step-by-step

**Built in Phase 2 (steps 3-6):**
1. **Dense retrieval** (`storage/qdrant_store.py`) — Qdrant search, top-10, namespace pre-filtered (reduced from top-20 in Phase 2 — see [RAG_HARDWARE.md](RAG_HARDWARE.md) §4 on why fewer/shorter candidates matter on this hardware)
2. **Sparse retrieval** (`storage/sqlite_fts.py`) — SQLite native FTS5 `bm25()` ranking, top-10, same namespace filter (no separate `bm25s` package needed)
3. **RRF fusion** (`retrieval/hybrid.py`) — Reciprocal Rank Fusion: `score(d) = Σ 1/(k + rank_i(d))` across both lists, `k=60`. Produces one ranked list of typically 14-20 unique candidates from 10+10 inputs.
4. **Reranking** (`retrieval/reranker.py`) — `BGE-reranker-v2-m3` cross-encoder scores each (query, chunk) pair directly, selects top-3 (reduced from top-8). `max_length=256` (reduced from 512 — real ~300-token chunks at full length measured 2.33s for just 14 pairs; halving sequence length roughly halves the cost)

**Built in Phase 3, both opt-in (not default — see docs/RAG_HARDWARE.md §4 on why):**
5. **HyDE** (`retrieval/hyde.py`) — ✅ Built. `qwen3:8b` generates a plausible *answer* to the query (not necessarily factually correct — only used to improve search), and that answer is embedded instead of the raw query for the dense leg only (sparse/BM25 still matches literal query text). Costs +4-7s. Measured: changes the candidate pool (3/18 candidates differed on a test query) but did not improve final top-3 ranking after reranking on the corpus size tested (187 chunks in June 2026; the corpus is much larger now, see RAG_STATUS.md). Opt-in via `use_hyde: true` on `/api/query`.
6. **Multi-hop expansion** (`retrieval/multi_hop.py`) — ✅ Built, direct Python (no LlamaIndex `SubQuestionQueryEngine` — dropped per design decisions in [RAG_SYSTEM.md](RAG_SYSTEM.md)). Decomposes a compound question into up to **2** sub-questions (not 2-4 as originally planned — each hop costs a full retrieve+rerank cycle), runs steps 1-4 independently for each, merges and dedupes by chunk id. Verified on a real compound question — correctly split it and found highly relevant chunks for both halves (0.969 rerank score on one). Costs +2-5s even for simple questions routed through it. Opt-in via `multi_hop: true`.

**Not built — separate "query rewrite" (synonym expansion) step:** the original plan had this as distinct from HyDE. Not implemented; HyDE covers a similar need by a different mechanism (generating answer-shaped text rather than expanding query terms).

### Namespace routing (security-critical)
Every retrieval call requires a `user_id` (or `None` for anonymous/public-only). The filter `namespace IN ('public', 'user:{user_id}')` is applied at the Qdrant/SQLite query level — never as a post-filter on results. This guarantees a private chunk is never transmitted out of the database layer for a query it doesn't belong to.

### Pre-filters available
`doc_type`, `finance_category`, `date_from`/`date_to`, `regulation_ref` — applied before vector search via Qdrant's payload filtering, narrowing the candidate set for targeted queries (e.g., `rag_search_regulations` tool only searches `doc_type=regulation`).

---

## Layer 6 — Generation (`generation/`)

### Context assembly (`generation/prompt.py` — built, Phase 2)
Final prompt sent to **`qwen3:8b`** (changed from the originally-planned `qwen3:14b` — see [RAG_MODELS.md](RAG_MODELS.md) for why):
```
[SYSTEM] Indian finance persona, citation + conciseness rules — short-form, see prompt.py
[RETRIEVED CONTEXT] Top-3 reranked chunks (reduced from top-8), each capped at 500 chars
                     chosen as the query-aware 500-char window of the chunk that best matches
                     the query terms (`select_window()`, corrected Oct 2026 — not the first 500 chars),
                     labeled [SOURCE_1]...[SOURCE_N] with doc title
[CONVERSATION HISTORY] build_prompt() accepts a history param (last 6 turns). Corrected
                        Oct 2026: it is now reachable — /api/query takes an optional
                        `session_id`, and history is loaded from Redis (2 h TTL,
                        storage/conversation.py) and appended after each answer. A request
                        without a session_id still has no history.
[USER QUERY] The current question
```
**Still not built:** `[USER PROFILE]` injection from `window.FINOS_USER_CONTEXT`. Phase 4 (Arya integration) happened and didn't add this — it built a different, simpler integration instead (direct retrieval-context injection into the main chat's existing prompt, plus the Agent tools (2 then, 6 now) — see [RAG_INTEGRATION.md](RAG_INTEGRATION.md)), bypassing `build_prompt()`'s history/profile design entirely for that path. Context size (chunk count + char cap) was deliberately trimmed in Phase 2 because prompt prefill, not decode, turned out to be the dominant latency cost on this hardware — see [RAG_HARDWARE.md](RAG_HARDWARE.md) §4.

### Streaming (`generation/streamer.py` — built, Phase 2)
FastAPI `StreamingResponse` with `text/event-stream`, verified working end-to-end. **The frontend consumer is built** (Phase 4) — but it's not the planned `js/arya-rag-ui.js`; that separate file was never created. The real integration reuses `arya-sidebar-panel.js`'s existing chat rendering for the Agent-tool path, and a plain context-injection (no streaming UI of its own) for the main-chat path. `think: false` is set on every call — qwen3 reasons-by-default and this was a real, measured bug (see [RAG_PHASES.md](RAG_PHASES.md) Phase 2). `num_predict: 120` caps output length, since decode rate (~20 tok/s, stable) makes output length the most reliable latency lever on this hardware.

### Citations (`generation/citations.py` — built, Phase 2)
The system prompt instructs the model to tag every factual claim with `[SOURCE_N]`. A post-processing regex extracts these tags and maps them back to the actual chunk metadata (doc title, page, source path) — verified producing correct citations against real FIN-OS content.

### Faithfulness guard (`generation/faithfulness.py` — ✅ built, Phase 5)
After generation completes, each *cited* sentence (one carrying a `[SOURCE_N]` tag — uncited sentences are the model's own reasoning, not checked by design) is checked via `cross-encoder/nli-deberta-v3-base` on MPS against its source chunk: is this sentence actually entailed, or a contradiction/unsupported addition? Wired into `/api/query`'s response (`flagged_sentences` field / `event: faithfulness`).

**Built, but with a measured reliability gap on this domain — not glossed over.** Verified correct on synthetic cases (faithful claim → no flag; fabricated claim → `contradiction`; unrelated claim → `neutral`) and confirmed the model is confident and correct on the simple everyday sentences it was actually trained on (SNLI/MultiNLI). But on real generated answers over Indian regulatory text, it's measurably unreliable — a genuinely-correct paraphrase of an RBI directive's effective date got flagged `neutral`, and the verdict flipped to `contradiction` when the premise was shortened to a near-verbatim match, meaning the result tracks premise framing more than actual semantic support. This is a domain mismatch in the off-the-shelf model, documented in the module's own docstring — see [RAG_PHASES.md](RAG_PHASES.md) Phase 5 for the full comparison. Treat `flagged_sentences` as a noisy review signal, not a reliable gate, until a domain-appropriate model is evaluated.

### Conflict resolution (**still not built**)
Planned: if two retrieved chunks contradict each other (e.g., an old vs. new SEBI circular), the prompt template would instruct the model to surface both with dates. Now actually testable — Phase 3 built a real regulatory corpus (SEBI circulars + RBI notifications) — but not implemented or tested this pass.

---

## Data Flow Diagram

**As actually built and verified, Phases 1-5 — this is one real diagram now, not a "built" vs. "planned" pair, because the planned additions are built:**
```
User query (text — via curl/API directly, or via Arya's sidebar chat in the browser)
   │
   ▼
[optional, opt-in only] Layer 5.1: HyDE (qwen3:8b generates a hypothetical answer,
   that gets embedded instead of the raw query for the dense leg only) — use_hyde:true
   │
   ▼
[optional, opt-in only] Layer 5.2: multi-hop decomposition (qwen3:8b splits a compound
   question into ≤2 sub-questions, each runs the full retrieve→rerank cycle
   independently, results merged/deduped) — multi_hop:true
   │
   ▼
[embed query: mxbai-embed-large]
   │
   ├──────────────┬──────────────┐
   ▼              ▼              │
[Dense: Qdrant]  [Sparse: FTS5]  │  (namespace pre-filtered at the query level, top-10 each,
   │              │              │   optional doc_type filter for e.g. regulation-only search)
   └──────┬───────┘              │
          ▼                      │
   [RRF fusion] → ~14-20 unique candidates
          │
          ▼
   [BGE reranker, max_length=256] → top-3 by default (caller can request more)
          │
          ▼
   [Context assembler] (chunks only — no conversation history, no user profile;
                         build_prompt() supports both but neither is ever populated
                         by any real caller, see Layer 6 above)
          │
          ▼
   [qwen3:8b streaming generation, think:false, num_predict:120]
          │
          ▼
   [Citation extraction] → [Faithfulness/NLI check on cited sentences]
          │                  (built, Phase 5 — but measurably unreliable on Indian
          │                   regulatory text, see Layer 6 above — treat as a hint)
          ▼
   SSE stream → either a direct API response, or Arya's sidebar chat (2 Agent tools
                call /api/query directly; the main chat tab instead calls the lighter
                /api/retrieve — no generation — and injects results into its own
                single Ollama call, to avoid a second redundant LLM call)
```

**Numbers that were planned but never matched reality, for the record:** the original plan assumed top-20+20 candidates fused to ~30, reranked to a top-8 default. The actual system uses top-10+10 fused to ~14-20, reranked to a top-3 default (top-8 remains available as a non-default override, and is `/api/search`'s separate default) — both reduced for latency, see [RAG_HARDWARE.md](RAG_HARDWARE.md) §4. "Query rewrite" as a distinct synonym-expansion step was dropped; HyDE covers a related need differently.

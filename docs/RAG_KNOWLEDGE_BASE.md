# FIN-OS RAG — Knowledge Base Reference

> Version: 1.3 | Date: June 21, 2026
> **Status:** Three of the sources below are actually ingested — FIN-OS content (94 pages, **297 chunks** as of a June 21 2026 re-ingestion, up from an originally-measured 187 — same 94 pages, no content change, see note below), SEBI circulars (30 chunks, real live data), and RBI notifications (181 chunks, real live data) — **508 chunks total**, all `public` namespace, confirmed via `GET /api/health`. AMFI is investigated but not built (their site is JS-rendered — see [RAG_PHASES.md](RAG_PHASES.md) Phase 3). Everything else below (IT Act, Finance Act, IRDAI, PFRDA, NSE/BSE, market intelligence, structured data, conversation memory, the Supabase schema in §3) is still target design, not built. User documents (§ below) are pipeline-tested but not reachable through a live authenticated upload yet (Phase 3 caveat).
>
> **Why the FIN-OS page count went from 187→297 chunks with zero content change:** `ingestion/chunker.py`'s global `_MAX_CHUNK_CHARS=1200` backstop (added Phase 3 to fix a regulatory-table embedding failure — see [RAG_PHASES.md](RAG_PHASES.md) Phase 3) applies to every chunking call, not just regulatory ingestion. FIN-OS pages were never re-ingested after that backstop shipped, so the 187 figure was already stale and nobody had re-run the endpoint to notice. Re-ingestion is idempotent (`/api/ingest/finos-pages` deletes prior `finos_page` chunks first) — this is the same 94 pages split into more, smaller chunks, not duplicate or new data. Found while testing the new Prometheus metrics endpoint (below), not from a dedicated audit — a reminder that any doc reporting a fixed-corpus chunk count can go stale silently the moment chunking logic changes, even with no new source documents.

---

## 1. Knowledge Sources

### Regulatory knowledge (`namespace: public`)
| Source | Authority | Status | Refresh |
|---|---|---|---|
| SEBI circulars & guidelines | sebi.gov.in | ✅ Built — `POST /api/ingest/sebi-circulars`, manual trigger | Manual (not actually daily/scheduled — see [RAG_PHASES.md](RAG_PHASES.md) Phase 3 for why no APScheduler job exists) |
| RBI notifications/directions | rbi.org.in | ✅ Built — `POST /api/ingest/rbi-notifications`, manual trigger | Manual |
| AMFI FAQs & fund regulations | amfiindia.com | ❌ Not built — site is JS-rendered, infeasible for the current plain-HTTP crawler | — |
| Income Tax Act sections (80C/D/E/G, 24(b), etc.) | incometaxindia.gov.in | ❌ Not built | — |
| Finance Act (annual budget) | Union Budget docs | ❌ Not built | — |
| IRDAI insurance guidelines | irdai.gov.in | ❌ Not built | — |
| PFRDA NPS circulars | pfrda.org.in | ❌ Not built | — |
| NSE/BSE listing regulations | nseindia.com / bseindia.com | ❌ Not built | — |

### Market intelligence (`namespace: public`) — ❌ none built
| Source | Refresh |
|---|---|
| MF fact sheets (all AMFI funds) | Daily |
| Annual reports (Nifty 50 companies) | Quarterly |
| Brokerage research reports | As published |
| Economic Survey excerpts | Annual |
| ET / Mint / Business Standard / Moneycontrol RSS | Every 2 hours |
| RBI monetary policy statements | Per MPC meeting |
| NSE sector/index data | Daily |

A real, working alternative was found but not wired into the document-RAG pipeline: `https://www.amfiindia.com/spages/NAVAll.txt` is a live, JS-free flat-file NAV endpoint (1.6MB, thousands of schemes) — confirmed fetchable, not ingested since it's structured tabular data, a different shape than chunked prose. See [RAG_PHASES.md](RAG_PHASES.md) Phase 3.

### FIN-OS content (`namespace: public`, static) — ✅ built
- All 94 HTML pages in `html/` (not 96 — `index.html`/`login.html` aren't included by `/api/ingest/finos-pages`)
- **Not** separately chunked: calculator explainer texts, `learn-*` modules, principles pages, DNA decoder, insight cards, focus directive library are only included insofar as their text appears within the 94 pages' rendered HTML — there's no separate extraction pass for these as distinct sources
- Re-indexed via manual `POST /api/ingest/finos-pages` trigger, not automatically on deploy

### User documents (`namespace: user:{uuid}`, private, per-user) — 🟡 pipeline built, not reachable live yet
- PDF, TXT, MD, HTML accepted via `POST /api/upload` (Phase 3) — ITR PDFs, Form 16, bank statements, etc. are all just "a PDF" to the loader, no document-type-specific parsing
- **Real limitation:** the upload pipeline (parse → strict PII scrub → chunk → embed → dual-index) is verified working via direct Python calls and the namespace isolation guarantee is verified via a real pytest (see [RAG_EVALUATION.md](RAG_EVALUATION.md) §6) — but no live authenticated HTTP upload has been exercised, since that needs a real Supabase session token that wasn't fabricated without asking. See [RAG_PHASES.md](RAG_PHASES.md) Phase 3.
- Not built: Zerodha/Kite P&L export parsing, CAS-specific parsing — these would just be ingested as generic PDF/text today, with no special structure extraction

### Structured finance data (mixed, API-sourced) — ❌ none built
- AMFI NAV history (JSON) — feasible flat-file endpoint found (see Market intelligence above), not ingested
- NSE options chain snapshots, historical Nifty 50 returns, SGB prices, tax slab tables, penalty/interest tables, DICGC limits, EPF/VPF rules — none investigated or built

### Conversation memory (`namespace: user:{uuid}`, private) — ❌ not built
- Arya's existing `arya-memory.js` episodic memory is a separate, independent system (localStorage/IndexedDB) — not wired into RAG's namespace/retrieval at all
- No RAG query/answer pairs are written back as memories
- `rag_feedback` table doesn't exist (Supabase schema not applied — Phase 1 gap)

---

## 2. Namespace Isolation Model

Every chunk carries exactly one `namespace` value:
- `public` — visible to all users and anonymous queries
- `user:{uuid}` — visible only to the authenticated user matching `{uuid}`

This is enforced at the **database query level**, not as application-layer filtering after retrieval — see [RAG_SECURITY.md](RAG_SECURITY.md) for the exact mechanism in both Qdrant and Supabase RLS.

---

## 3. Supabase Schema (new tables) — ❌ written, not applied

This exact SQL now exists as a real file, `rag-engine/schema.sql` (written during Phase 3) — but it has **not been run** against the live Supabase project. No DB password/connection string is available to run DDL programmatically, and this wasn't going to be guessed at. It's a manual step for you to run via the Supabase SQL editor whenever you want it live. See [RAG_PHASES.md](RAG_PHASES.md) Phase 1 for the full gap note.

```sql
-- Document registry — one row per source document
CREATE TABLE rag_documents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  content_hash text UNIQUE NOT NULL,
  source_url text,
  doc_type text NOT NULL,        -- 'regulation' | 'news' | 'finos_page' | 'user_doc' | 'market_data'
  finance_category text,         -- 'tax' | 'mutual_funds' | 'banking' | 'insurance' | 'equity' | 'nps'
  user_id uuid REFERENCES profiles(id),  -- NULL for public docs
  namespace text NOT NULL,       -- 'public' or 'user:{uuid}'
  version int DEFAULT 1,
  is_current boolean DEFAULT true,
  last_indexed_at timestamptz DEFAULT now(),
  created_at timestamptz DEFAULT now()
);

CREATE INDEX idx_rag_documents_hash ON rag_documents(content_hash);
CREATE INDEX idx_rag_documents_namespace ON rag_documents(namespace);

-- User feedback on RAG answers
CREATE TABLE rag_feedback (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  query text NOT NULL,
  answer text NOT NULL,
  chunk_ids text[],              -- Qdrant point IDs cited in the answer
  rating int NOT NULL,            -- 1 (thumbs up) or -1 (thumbs down)
  rating_note text,               -- optional free-text correction
  user_id uuid REFERENCES profiles(id),
  created_at timestamptz DEFAULT now()
);

CREATE INDEX idx_rag_feedback_user ON rag_feedback(user_id);

-- RLS
ALTER TABLE rag_documents ENABLE ROW LEVEL SECURITY;
CREATE POLICY "public docs visible to all, private to owner"
  ON rag_documents FOR SELECT
  USING (namespace = 'public' OR user_id = auth.uid());
CREATE POLICY "users manage own docs"
  ON rag_documents FOR ALL
  USING (user_id = auth.uid());

ALTER TABLE rag_feedback ENABLE ROW LEVEL SECURITY;
CREATE POLICY "users see own feedback"
  ON rag_feedback FOR ALL
  USING (user_id = auth.uid());
```

Raw files (PDFs etc.) are stored in Supabase Storage bucket `rag-docs`, path-namespaced as `rag-docs/{namespace}/{doc_id}.pdf`, with signed URLs generated per-request rather than public bucket access.

---

## 4. Qdrant Collection Schema — ✅ built, this is the actual code

```python
# storage/qdrant_store.py — ensure_collection(), real code not a sketch
client.create_collection(
    collection_name="finos_chunks",
    vectors_config=VectorParams(size=1024, distance=Distance.COSINE),
    hnsw_config=HnswConfigDiff(m=16, ef_construct=128),
)
for field_name in ["namespace", "doc_type", "finance_category", "doc_id"]:
    client.create_payload_index(config.COLLECTION_NAME, field_name, PayloadSchemaType.KEYWORD)
```

Real difference from an earlier draft of this doc: there's **no `date_indexed` DATETIME index** — not built. `doc_id` is indexed but only populated for `user_doc` uploads (a locally-generated `uuid.uuid4()`, **not** a foreign key into any Supabase table — `rag_documents` doesn't exist, see §3). FIN-OS pages and regulatory chunks don't have a `doc_id` at all.

---

## 5. Knowledge Base Growth — original estimates vs. actual

| Stage | Original estimate | **Actual measured** |
|---|---|---|
| Phase 1 (FIN-OS pages, original measurement) | ~5,000 chunks | **187 chunks** — FIN-OS pages are mostly interactive widgets with sparse static text, not prose; far fewer chunks than estimated |
| Phase 1 (FIN-OS pages, after Phase 3's chunker change) | — | **297 chunks**, same 94 pages — see the note in the header above; the global char-cap backstop added for regulatory content silently changed this count too |
| Phase 3 (5 SEBI circulars) | n/a (estimate was for a full backfill) | **30 chunks** |
| Phase 3 (4 RBI notifications) | n/a | **181 chunks** — RBI documents are much longer (multi-page legal directions) than SEBI circulars |
| **Current total** | — | **508 chunks** (297 + 30 + 181) |
| Phase 3 (regulatory, full backfill 2015–2026) | ~80,000 | Not attempted — only a handful of recent documents pulled per crawler run so far |
| Steady state (Year 1) | ~500,000 | Not applicable yet at this scale |

Qdrant and the storage budget in [RAG_HARDWARE.md](RAG_HARDWARE.md) are sized for 1M chunks comfortably — no re-architecture needed through Year 1. At 398 real chunks, there's no near-term scale pressure to worry about; the gap between "~80,000 estimated" and "398 actual" reflects how much regulatory backfill work remains, not a flaw in the estimate's sizing logic.

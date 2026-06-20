# FIN-OS RAG — Knowledge Base Reference

> Version: 1.0 | Date: June 20, 2026

---

## 1. Knowledge Sources

### Regulatory knowledge (`namespace: public`, auto-crawled)
| Source | Authority | Refresh |
|---|---|---|
| SEBI circulars & guidelines | sebi.gov.in | Daily |
| RBI master directions | rbi.org.in | Daily |
| AMFI FAQs & fund regulations | amfiindia.com | Daily |
| Income Tax Act sections (80C/D/E/G, 24(b), etc.) | incometaxindia.gov.in | On Finance Act update |
| Finance Act (annual budget) | Union Budget docs | Annual (Feb) |
| IRDAI insurance guidelines | irdai.gov.in | Daily |
| PFRDA NPS circulars | pfrda.org.in | Daily |
| NSE/BSE listing regulations | nseindia.com / bseindia.com | Daily |

### Market intelligence (`namespace: public`, daily refresh)
| Source | Refresh |
|---|---|
| MF fact sheets (all AMFI funds) | Daily |
| Annual reports (Nifty 50 companies) | Quarterly |
| Brokerage research reports | As published |
| Economic Survey excerpts | Annual |
| ET / Mint / Business Standard / Moneycontrol RSS | Every 2 hours |
| RBI monetary policy statements | Per MPC meeting |
| NSE sector/index data | Daily |

### FIN-OS content (`namespace: public`, static, re-indexed on deploy)
- All 96 HTML pages' text content
- 88 calculator explainer texts
- 38 `learn-*` educational modules
- FIN-OS principles & philosophy pages
- DNA decoder logic explanations
- Insight cards knowledge base
- Focus directive library

### User documents (`namespace: user:{uuid}`, private, per-user)
- Uploaded ITR PDFs
- Bank account statements
- Zerodha/Kite P&L exports
- CAS (Consolidated Account Statement)
- Salary slips & Form 16
- Loan statements (home/personal)
- Insurance policy documents
- Investment certificates (ELSS, FD)

### Structured finance data (mixed, API-sourced)
- AMFI NAV history (JSON) — `public`
- NSE options chain snapshots — `public`
- Historical Nifty 50 returns — `public`
- SGB issue prices & series list — `public`
- Tax slab tables (FY 2024-25 / 25-26) — `public`
- Penalty & interest rate tables — `public`
- DICGC deposit insurance limits — `public`
- EPF/VPF contribution rules — `public`

### Conversation memory (`namespace: user:{uuid}`, private)
- Arya episodic memory (`arya-memory.js`)
- Past RAG query → answer pairs
- User-bookmarked answers
- Correction feedback (thumbs down → `rag_feedback`)
- Agent run history (`AryaRunHistory`)
- `FINOS_USER_CONTEXT` snapshot at query time

---

## 2. Namespace Isolation Model

Every chunk carries exactly one `namespace` value:
- `public` — visible to all users and anonymous queries
- `user:{uuid}` — visible only to the authenticated user matching `{uuid}`

This is enforced at the **database query level**, not as application-layer filtering after retrieval — see [RAG_SECURITY.md](RAG_SECURITY.md) for the exact mechanism in both Qdrant and Supabase RLS.

---

## 3. Supabase Schema (new tables)

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

## 4. Qdrant Collection Schema

```python
from qdrant_client import QdrantClient
from qdrant_client.models import Distance, VectorParams, PayloadSchemaType

client = QdrantClient(host="localhost", port=6333)

client.create_collection(
    collection_name="finos_chunks",
    vectors_config=VectorParams(size=1024, distance=Distance.COSINE),
    hnsw_config={"m": 16, "ef_construct": 128},
)

# Payload indexes for fast pre-filtering
client.create_payload_index("finos_chunks", "namespace", PayloadSchemaType.KEYWORD)
client.create_payload_index("finos_chunks", "doc_type", PayloadSchemaType.KEYWORD)
client.create_payload_index("finos_chunks", "finance_category", PayloadSchemaType.KEYWORD)
client.create_payload_index("finos_chunks", "date_indexed", PayloadSchemaType.DATETIME)
```

Each point's payload mirrors the chunk metadata schema defined in [RAG_PIPELINE.md](RAG_PIPELINE.md) §2, plus `doc_id` (FK to `rag_documents.id` in Supabase) for joining back to the document registry.

---

## 5. Knowledge Base Growth Plan

| Stage | Chunks (approx) | Trigger |
|---|---|---|
| Phase 1 (initial) | ~5,000 | 96 FIN-OS pages + 88 calculator explainers |
| Phase 3 (regulatory) | ~80,000 | SEBI/RBI/AMFI backfill (2015–2026) |
| Phase 3 (news) | +500/day | Ongoing RSS ingestion |
| Steady state (Year 1) | ~500,000 | Full regulatory + 12mo news + active user docs |

Qdrant and the storage budget in [RAG_HARDWARE.md](RAG_HARDWARE.md) are sized for 1M chunks comfortably — no re-architecture needed through Year 1.

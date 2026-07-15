-- FIN-OS RAG — Supabase schema migration
-- See docs/RAG_KNOWLEDGE_BASE.md §3 for full design rationale.
--
-- NOT YET APPLIED to the live Supabase project (vkm — apply this yourself via the
-- Supabase SQL Editor at https://supabase.com/dashboard/project/oeapcyucnduhwpgxfknb/sql
-- or via `psql "$SUPABASE_DB_URL" -f schema.sql` if you have the direct DB connection
-- string — Claude does not have your DB password and won't run DDL on its own).
--
-- Safe to run: purely additive, only CREATE TABLE IF NOT EXISTS — does not touch
-- any existing FIN-OS tables (profiles, transactions, goals, etc.)

-- Document registry — one row per source document
CREATE TABLE IF NOT EXISTS rag_documents (
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

CREATE INDEX IF NOT EXISTS idx_rag_documents_hash ON rag_documents(content_hash);
CREATE INDEX IF NOT EXISTS idx_rag_documents_namespace ON rag_documents(namespace);

-- User feedback on RAG answers
CREATE TABLE IF NOT EXISTS rag_feedback (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  query text NOT NULL,
  answer text NOT NULL,
  chunk_ids text[],              -- Qdrant point IDs cited in the answer
  rating int NOT NULL,            -- 1 (thumbs up) or -1 (thumbs down)
  rating_note text,               -- optional free-text correction
  user_id uuid REFERENCES profiles(id),
  created_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_rag_feedback_user ON rag_feedback(user_id);

-- RLS
ALTER TABLE rag_documents ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "public docs visible to all, private to owner" ON rag_documents;
CREATE POLICY "public docs visible to all, private to owner"
  ON rag_documents FOR SELECT
  USING (namespace = 'public' OR user_id = auth.uid());

DROP POLICY IF EXISTS "users manage own docs" ON rag_documents;
CREATE POLICY "users manage own docs"
  ON rag_documents FOR ALL
  USING (user_id = auth.uid());

ALTER TABLE rag_feedback ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "users see own feedback" ON rag_feedback;
CREATE POLICY "users see own feedback"
  ON rag_feedback FOR ALL
  USING (user_id = auth.uid());

-- Verify after running:
--   SELECT * FROM rag_documents LIMIT 1;
--   SELECT * FROM rag_feedback LIMIT 1;
-- Both should return empty result sets with no errors.
